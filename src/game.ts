import { exportWorldArchive, parseWorldArchive, type WorldArchive } from './storage/worldArchive';
import { BuildClipboard } from './player/clipboard';
import { resolvePlacement } from './player/placementTarget';
import { blockCollision, slabBounds, slabItemState } from './world/blocks';
import { atmosphericFogStrength } from './world/atmosphere';
import {
  WORLD_FILE_MAX_BYTES, FOG_SAMPLE_INTERVAL_S, FOG_VALLEY_SAMPLE_M, FOG_GROUND_LAYER_M, metersToBlocks,
  AUTOSAVE_INTERVAL_S, BLOCK_SIZE_M, BREAK_REPEAT_S, DAY_LENGTH_S, DAYS_PER_SEASON, DEFAULT_MOUSE_SENSITIVITY, EYE_HEIGHT, FIXED_DT,
  FOOTSTEP_DISTANCE, FOOTSTEP_MIN_SPEED, GEN_BUDGET_MS, HOTBAR_SIZE, MAX_FRAME_DT, MESH_BUDGET_MS, REACH, SEA_LEVEL,
  SETTINGS_KEY, SPAWN_READY_RADIUS, START_TIME_OF_DAY, WORLD_LATITUDE_DEG, ITEM_SIZE, PLAYER_HEIGHT, WALK_SPEED,
  GAME_MODE_CREATIVE, GAME_MODE_SURVIVAL, HEALTH_MAX, HUNGER_MAX,
  DROWN_DAMAGE_PER_S, AIR_MAX_S, GAME_TICKS_PER_SECOND, LIGHTNING_SKY_BRIGHTEN, THUNDER_DELAY_MIN_S, THUNDER_DELAY_MAX_S,
} from './config';
import { Sounds } from './audio/sounds';
import { FixedStepLoop } from './core/loop';
import { Input } from './input/input';
import type { GameOptions } from './options';
import { ItemEntities } from './items/itemEntities';
import { LooseBodies } from './items/looseBodies';
import { BlockBreaking } from './player/breaking';
import { BuildTool, cornerFor, frameFor } from './player/buildTool';
import { Inventory, type ItemStack } from './player/inventory';
import { blockIntersectsBody, canBreak } from './player/interaction';
import type { Vec3 } from './player/physics';
import { FireExposure, fluidContact, landingDamage, landingWaterDepth } from './player/fluidHazards';
import { NO_CONTROLS, PLAYER_SHAPE, Player, type PlayerControls } from './player/player';
import { raycastVoxels, type RaycastHit } from './player/raycast';
import { type Box, type Cell, boundsOf } from './player/volumes';
import { ChunkMeshes } from './render/chunkMeshes';
import { Clouds } from './render/clouds';
import { Horizon } from './render/horizon';
import { HeldBlock } from './render/heldBlock';
import { BlockHighlight, BreakOverlay } from './render/highlight';
import { ItemMeshes } from './render/itemMeshes';
import { BodyMeshes } from './render/bodyMeshes';
import { Renderer } from './render/renderer';
import { Sky } from './render/sky';
import { WeatherRenderer } from './render/weather';
import { WeatherModel } from './world/weather';
import type { LoadedSave, SavedPlayer, WorldMeta } from './storage/save';
import { WorldSaver } from './storage/saver';
import { loadSettings, saveSettings, type Settings } from './storage/settings';
import { MemoryStore, browserStore, type KeyValueStore } from './storage/store';
import type { WorldStore } from './storage/worldStore';
import { DebugOverlay } from './ui/debugOverlay';
import { formatDebugLines } from './ui/debugText';
import { Hud } from './ui/hud';
import { InventoryScreen } from './ui/inventoryScreen';
import { Menu, type MenuMode } from './ui/menu';
import { BlockId, getBlockDef, isWaterState, isLavaState, isFluidState } from './world/blocks';
import { scheduleLeafDecay } from './world/ecology';
import { scheduleFallChecks } from './world/falling';
import { scheduleFlowChecks } from './world/flow';
import type { LooseBody } from './items/looseBodies';
import { collapsible, scheduleSupportChecks } from './world/collapse';
import { Chunk } from './world/chunk';
import { ChunkManager } from './world/chunkManager';
import { type EditCell, EditQueue } from './world/editQueue';
import { TerrainGenerator } from './world/generator';
import { findSpawnColumn, surfaceY } from './world/spawn';
import { daylightAt, lerpColor, skyColorAt } from './world/time';
import { WorkerPool } from './workers/workerPool';
import { World } from './world/world';
import { Calendar } from './world/calendar';

/** The world save the game starts with (opened and read by main.ts before the game is created). */
export interface GameSave {
  store: WorldStore;
  /** The loaded save, or null for a new world. */
  loaded: LoadedSave | null;
  /** False for throw-away worlds (?nosave=1, ?seed=) and when saving is unavailable. */
  persistent: boolean;
  /** True when the browser could not open IndexedDB; the menu says saving is unavailable. */
  unavailable: boolean;
}

/** Blocks in a box of blocks (inclusive bounds). */
function volumeOf(box: Box): number {
  return (box.max.x - box.min.x + 1) * (box.max.y - box.min.y + 1) * (box.max.z - box.min.z + 1);
}

export class Game {
  readonly world: World;
  readonly generator: TerrainGenerator;
  readonly renderer: Renderer;
  readonly meshes: ChunkMeshes;
  readonly horizon: Horizon;
  readonly chunks: ChunkManager;
  readonly player = new Player();
  inventory = new Inventory();
  readonly items = new ItemEntities();
  /** Seconds since the last game tick (see fixedUpdate). */
  private tickTimer = 0;
  /** Blocks that broke free of a big collapse and tumble until they settle (spec 25, slice 6). */
  readonly bodies = new LooseBodies();
  private readonly breaking = new BlockBreaking();
  private readonly held: HeldBlock;
  private readonly itemMeshes: ItemMeshes;
  private readonly bodyMeshes: BodyMeshes;
  private readonly breakOverlay: BreakOverlay;
  private readonly inventoryScreen: InventoryScreen;
  /** Seconds since the game started; drives the spin and bob of dropped items. */
  private clockS = 0;
  readonly input: Input;
  readonly sounds = new Sounds();
  /** The block under the crosshair (updated every frame), or null. */
  target: RaycastHit | null = null;
  /** True once the area around spawn is meshed and the player has been placed. */
  ready = false;
  /** True while the game receives input (pointer locked, or ?autostart=1). */
  playing = false;
  fps = 0;
  /** 0 sunrise, 0.25 noon, 0.5 sunset, 0.75 midnight; wraps at 1. */
  timeOfDay = START_TIME_OF_DAY;
  /** Game mode: 'creative' (current behaviour) or 'survival'. Defaults to creative for backwards compatibility. */
  gameMode = GAME_MODE_CREATIVE;
  /** Player health, 0..HEALTH_MAX. 0 = dead. */
  health = HEALTH_MAX;
  /** Player hunger, 0..HUNGER_MAX. */
  hunger = HUNGER_MAX;

  /**
   * True when a crack stage has been shown for the current mining attempt. The render loop sets it, so the smoke test
   * can observe a stage that is shorter than one of its polls: on software rendering a 0.5 s block can go from stage
   * 0 to broken between two polls.
   */
  breakStageSeen = false;

  /** Debug hook (smoke test only): while true, simulation and rendering are skipped so another page can load. */
  private idle = false;
  private readonly clipboard = new BuildClipboard();

  /** Frames rendered since the page opened; a frame-rate-independent way to see that the loop is running. */
  private frameCount = 0;
  /** Seconds of air remaining, 0..AIR_MAX_S. Decreases when submerged. */
  air = AIR_MAX_S;
  /** Calendar: tracks season and day of year. */
  readonly calendar: Calendar;
  private readonly loop: FixedStepLoop;
  private readonly spawn: { x: number; z: number };
  /** Feet height at the spawn column, once its column top and the chunks below it are loaded. */
  private spawnFeetY: number | null = null;
  private readonly highlight: BlockHighlight;
  private actionCooldown = 0;
  /** The menu to return to when inventory was opened without capturing the pointer. */
  private inventoryReturnMenu: MenuMode | null = null;
  readonly fire = new FireExposure();

  /** The volumetric build tools (see src/player/buildTool.ts). */
  readonly tool = new BuildTool();
  private readonly edits: EditQueue;
  /** What the tools would change now: the key it was computed for, its box and its size. */
  private previewKey = '';
  private previewBox: Box | null = null;
  private previewCount = 0;
  private readonly store: KeyValueStore;
  private settings: Settings;
  private mouseSensitivity = DEFAULT_MOUSE_SENSITIVITY;
  private readonly hud: Hud;
  private readonly menu: Menu;
  private readonly debugOverlay: DebugOverlay;
  /** False with ?nosave=1 or ?seed=..., without IndexedDB, and after "New world" was clicked. */
  private savingEnabled: boolean;
  private readonly worldStore: WorldStore;
  private readonly saver: WorldSaver;
  private importing = false;
  private saveTimer = 0;
  /** Where the player was when the game was saved; used instead of the spawn search. */
  private readonly savedPlayer: SavedPlayer | null;
  private readonly clouds: Clouds;
  /** The sky: dome, sun, moon, stars. */
  readonly sky: Sky;
  /** Weather model and renderer (spec 34). */
  readonly weather: WeatherModel;
  readonly weatherRenderer: WeatherRenderer;
  /** Strikes already given a thunder clap, and the seconds left until each queued clap (T-F14). */
  private seenStrikes = 0;
  private readonly thunderDelays: number[] = [];
  private fogSampleTimer = 0;
  private fogValleyDepthM = 0;
  private fogGroundM = 0;
  private stepDistance = 0;
  private readonly usingWorkers: boolean;

  constructor(container: HTMLElement, readonly options: GameOptions, save: GameSave) {
    this.store = options.nosave ? new MemoryStore() : browserStore();
    this.settings = loadSettings(this.store, SETTINGS_KEY);

    // A ?seed= URL starts a throw-away world: it neither loads nor overwrites the save.
    this.savingEnabled = save.persistent;
    this.worldStore = save.store;
    const loaded = save.loaded?.meta ?? null;
    const seed = options.seed ?? loaded?.seed ?? Math.floor(Math.random() * 1_000_000_000);
    this.generator = new TerrainGenerator(seed);
    // Keeping column tops exact can need a chunk that is not loaded; it is generated synchronously, not kept.
    this.world = new World(seed, (cx, cy, cz) => {
      const chunk = new Chunk(cx, cy, cz);
      this.generator.generateChunk(chunk);
      return chunk.blocks;
    });
    this.generator.onGrassPlaced = (wx, wy, wz) => {
      this.world.scheduleTick(wx, wy, wz, this.world.currentTick + 1, 'grass-spread');
    };
    this.calendar = new Calendar(DAYS_PER_SEASON, WORLD_LATITUDE_DEG);
    if (save.loaded && loaded) {
      this.world.loadEdits(save.loaded.edits);
      this.world.loadTicks(loaded.scheduledTicks ?? [], loaded.gameTick ?? 0);
      this.inventory = new Inventory(loaded.inventory);
      this.inventory.select(loaded.selectedSlot);
      this.items.restore(loaded.items);
      this.timeOfDay = loaded.timeOfDay;
      this.calendar.timeOfYear = loaded.timeOfYear ?? 0;
      this.gameMode = loaded.gameMode ?? GAME_MODE_CREATIVE;
      this.health = loaded.health ?? HEALTH_MAX;
      this.hunger = loaded.hunger ?? HUNGER_MAX;
      this.air = loaded.air ?? AIR_MAX_S;
    }
    this.savedPlayer = loaded?.player ?? null;
    this.saver = new WorldSaver(this.worldStore, this.world, () => this.worldMeta());
    this.renderer = new Renderer(container);
    this.meshes = new ChunkMeshes(this.renderer.scene, this.renderer.solidMaterial, this.renderer.waterMaterial);
    this.held = new HeldBlock(this.renderer.camera, this.renderer.itemMaterial);
    this.itemMeshes = new ItemMeshes(this.renderer.scene, this.renderer.itemMaterial);
    this.bodyMeshes = new BodyMeshes(this.renderer.scene, this.renderer.itemMaterial);
    this.usingWorkers = options.workers && typeof Worker !== 'undefined';
    const workerCount = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
    const jobs = this.usingWorkers ? new WorkerPool(seed, workerCount) : null;
    this.horizon = new Horizon(this.renderer.scene, seed, this.usingWorkers);
    this.chunks = new ChunkManager(this.world, this.generator, this.meshes, this.settings.renderDistance, jobs);
    this.edits = new EditQueue(this.world, this.chunks, (id) => canBreak(id));
    this.applySettings(this.settings);
    this.spawn = this.savedPlayer ? { x: this.savedPlayer.x, z: this.savedPlayer.z } : findSpawnColumn(this.generator);

    this.highlight = new BlockHighlight(this.renderer.scene);
    this.breakOverlay = new BreakOverlay(this.renderer.scene, this.renderer.crackMaterial);
    this.clouds = new Clouds(this.renderer.scene, seed);
    this.sky = new Sky(this.renderer.scene);
    this.weather = new WeatherModel(seed);
    this.weatherRenderer = new WeatherRenderer(this.renderer.scene);
    this.input = new Input(this.renderer.canvas);
    this.hud = new Hud(container, this.renderer.atlasCanvas, () => this.toggleInventory());
    this.debugOverlay = new DebugOverlay(container);
    this.inventoryScreen = new InventoryScreen(container, this.renderer.atlasCanvas, this.inventory, () => this.closeInventory());
    this.menu = new Menu(
      container,
      this.settings,
      this.gameMode,
      save.unavailable ? 'Saving is unavailable in this browser.' : null,
      {
        onPlay: () => {
          this.sounds.unlock();
          this.input.requestPointerLock();
        },
        onSettingsChange: (s) => this.changeSettings(s),
        onNewWorld: () => this.newWorld(),
        onExportWorld: () => this.downloadWorld(),
        onImportWorld: save.persistent ? file => { void this.importFile(file); } : undefined,
        onInventory: () => this.openInventory(),
        onGameModeChange: (mode) => this.setGameMode(mode),
      },
    );

    this.playing = options.autostart;
    if (options.autostart) this.menu.hide();
    else this.menu.show('start');
    this.renderer.canvas.addEventListener('click', () => {
      this.sounds.unlock();
      if (!this.input.pointerLocked) this.input.requestPointerLock();
    });
    this.input.onPointerLockChanged((locked) => {
      this.playing = locked || options.autostart;
      if (locked) {
        this.menu.hide();
        this.menu.setLockNote(null);
      } else if (!options.autostart && !this.inventoryScreen.isOpen) {
        // Esc releases the mouse and opens the pause menu, so it also cancels a wall, floor or roof in progress.
        this.tool.cancelFrame();
        this.menu.show('paused');
      }
    });
    this.input.onPointerLockFailed(() =>
      this.menu.setLockNote('Your browser did not capture the mouse. Click Play, or click the game, to try again.'),
    );
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void this.saveNow();
    });
    window.addEventListener('pagehide', () => void this.saveNow()); // best effort: the page may be gone first

    this.loop = new FixedStepLoop(
      FIXED_DT,
      MAX_FRAME_DT,
      (dt) => this.fixedUpdate(dt),
      (alpha, frameDt) => this.renderFrame(alpha, frameDt),
    );
  }

  start(): void {
    this.loop.start();
  }

  /** Clears the "a crack stage was shown" flag; the smoke test calls this before holding the mining button. */
  resetBreakStage(): void {
    this.breakStageSeen = false;
  }

  /**
   * Debug hook for the smoke test: while idle, the game runs neither simulation nor rendering. A second browser page
   * then loads and becomes ready without competing for the CPU and for the software WebGL context. Idempotent.
   */
  setIdle(idle: boolean): void {
    this.idle = idle;
  }

  /** Solid test used by physics. Unloaded chunks count as solid so the player can never fall into one. */
  readonly isSolidAt = (x: number, y: number, z: number) =>
    !this.world.isLoadedAt(x, y, z) || blockCollision(this.world.getBlock(x, y, z));

  readonly isWaterAt = (x: number, y: number, z: number): boolean => isWaterState(this.world.getBlock(x, y, z));

  readonly isLavaAt = (x: number, y: number, z: number): boolean => isLavaState(this.world.getBlock(x, y, z));

  private fixedUpdate(dt: number): void {
    if (!this.ready || this.idle) return;
    this.timeOfDay = (this.timeOfDay + dt / DAY_LENGTH_S) % 1;
    this.calendar.advance(dt); // Both clocks follow simulation time, including the existing menu-time behaviour.
    this.player.update(dt, this.playing ? this.readControls() : NO_CONTROLS, this.isSolidAt, this.isWaterAt, this.isLavaAt);
    this.items.step(dt, this.isSolidAt);
    // Block updates run at a fixed rate of game ticks, so a flow or a fall takes several ticks, as in Minecraft.
    this.tickTimer += dt;
    while (this.tickTimer >= 1 / GAME_TICKS_PER_SECOND) {
      this.tickTimer -= 1 / GAME_TICKS_PER_SECOND;
      this.chunks.tick();
    }
    for (const body of this.bodies.step(dt, this.isSolidAt, this.isWaterAt, (state) => getBlockDef(state).density, this.isLavaAt)) {
      this.settleBody(body);
    }
    this.edits.step();
    this.spawnBrokenBlocks();
    this.collectItems();
    this.updateFootsteps(dt);
    if (this.player.splashSpeed > 0) this.sounds.play('splash');
    this.saveTimer += dt;
    if (this.saveTimer >= AUTOSAVE_INTERVAL_S) {
      this.saveTimer = 0;
      void this.saveNow();
    }

    // Survival mode: fall damage, drowning, death.
    if (this.gameMode === GAME_MODE_SURVIVAL) {
      this.updateSurvival(dt);
    }
  }

  /** Fall damage, drowning, and death for survival mode. */
  private updateSurvival(dt: number): void {
    const p = this.player;

    if (p.impactSpeedM_S > 0) {
      this.damage(landingDamage(p.impactSpeedM_S, landingWaterDepth(p.position, (x, y, z) => this.world.getBlock(x, y, z))));
    }
    this.damage(this.fire.step(dt, fluidContact(p.position, PLAYER_SHAPE, (x, y, z) => this.world.getBlock(x, y, z))));

    // Drowning: lose air when submerged, take damage when air runs out.
    if (p.inWater) {
      this.air = Math.max(0, this.air - dt);
      if (this.air <= 0) {
        this.damage(DROWN_DAMAGE_PER_S * dt);
      }
    } else {
      this.air = Math.min(AIR_MAX_S, this.air + dt * 2); // restore air twice as fast as it depletes
    }

    // Death: respawn at spawn point, drop inventory.
    if (this.health <= 0) {
      this.die();
    }
  }

  /**
   * Switch between Creative and Survival from the menu. Entering survival tops health and hunger back up, so opening
   * the menu mid-fall cannot strand the player at the moment they switch.
   */
  setGameMode(mode: string): void {
    if (mode !== GAME_MODE_CREATIVE && mode !== GAME_MODE_SURVIVAL) return;
    if (mode === this.gameMode) return;
    this.gameMode = mode;
    this.fire.reset();
    if (mode === GAME_MODE_SURVIVAL) {
      this.health = HEALTH_MAX;
      this.hunger = HUNGER_MAX;
    }
    this.menu.setGameMode(mode);
  }

  /** Apply damage to the player. Clamps health at 0. */
  damage(amount: number): void {
    if (this.gameMode !== GAME_MODE_SURVIVAL) return;
    this.health = Math.max(0, this.health - amount);
  }

  /** Heal the player. Clamps health at MAX. */
  heal(amount: number): void {
    this.health = Math.min(HEALTH_MAX, this.health + amount);
  }

  /** Die: drop inventory, reset health, respawn at spawn. */
  private die(): void {
    // Drop all inventory on the ground.
    const p = this.player.position;
    for (let i = 0; i < this.inventory.slots.length; i++) {
      const stack = this.inventory.slots[i];
      if (stack) {
        this.items.spawn(stack.state, stack.count, p.x, p.y + 1, p.z, Math.random);
      }
    }
    this.inventory = new Inventory();
    this.inventory.select(0);

    // Reset health, air and transient fire.
    this.fire.reset();
    this.health = HEALTH_MAX;
    this.air = AIR_MAX_S;

    // Respawn at spawn point.
    const spawnY = this.spawnFeetY ?? this.world.topAt(Math.floor(this.spawn.x), Math.floor(this.spawn.z)) ?? SEA_LEVEL;
    this.player.setPosition(this.spawn.x, spawnY, this.spawn.z);
    this.ready = true;
  }

  /**
   * Writes the world meta and the chunks whose edits changed. Resolves to true once the write has completed;
   * false when saving is disabled, the player is not placed yet, or the write failed.
   */
  saveNow(): Promise<boolean> {
    if (!this.savingEnabled || !this.ready) return Promise.resolve(false);
    return this.saver.save().then(ok=>{
      if(!ok && this.worldStore.stale) {
        this.savingEnabled=false; this.playing=false; this.input.releasePointerLock();
        this.menu.show('paused');
        this.menu.setLockNote('This saved world was replaced in another tab. Export this session to keep it, then reload.');
      }
      return ok;
    });
  }

  exportWorld(): string { if(!this.ready || this.edits.busy)throw Error('Wait for world loading or the current building action'); return exportWorldArchive(this.worldMeta(),this.world.edits); }

  private downloadWorld(): void {
    try {
      const url=URL.createObjectURL(new Blob([this.exportWorld()],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download=`voxel-world-${this.world.seed}.json`;
      link.click();setTimeout(()=>URL.revokeObjectURL(url),0);
      this.menu.setLockNote('World backup downloaded.');
    } catch(error) {this.menu.setLockNote(error instanceof Error ? error.message : 'World export failed');}
  }
  private async importFile(file:File):Promise<void> {
    try {
      if(file.size>WORLD_FILE_MAX_BYTES)throw Error('World backup is too large');
      const data=parseWorldArchive(await file.text());
      if(this.importing)return;
      if(!window.confirm(`Replace your saved world with seed ${data.meta.seed} (${data.chunks.length} edited chunks)? Export your current world first if you want to keep it.`))return;
      if(!await this.restoreArchive(data))this.menu.setLockNote('World import failed; your previous save is unchanged.');
    } catch(error) {this.menu.setLockNote(error instanceof Error ? error.message : 'World import failed');}
  }
  /** Debug/test path uses the same strict validation and atomic replacement as the file picker. */
  async importWorld(text:string):Promise<boolean> {
    try {return await this.restoreArchive(parseWorldArchive(text));} catch {return false;}
  }
  private async restoreArchive(data:WorldArchive):Promise<boolean> {
    if(!this.savingEnabled || !this.ready || this.edits.busy || this.importing)return false;
    this.importing=true;
    const wasIdle=this.idle;this.idle=true;this.savingEnabled=false;
    this.menu.setLockNote('Restoring world backup…');
    this.menu.setBusy(true);
    await this.saver.drain();
    const ok=await this.worldStore.replace(data.meta,data.chunks);
    if(ok) {window.location.href=window.location.pathname;return true;}
    this.savingEnabled=true;this.idle=wasIdle;this.importing=false;this.menu.setBusy(false);
    return false;
  }

  private worldMeta(): WorldMeta {
    const p = this.player;
    return {
      seed: this.world.seed,
      scheduledTicks: this.world.snapshotTicks(),
      gameTick: this.world.currentTick,
      player: { x: p.position.x, y: p.position.y, z: p.position.z, yaw: p.yaw, pitch: p.pitch, flying: p.flying },
      selectedSlot: this.inventory.selected,
      inventory: this.inventory.slots.map((s) => (s ? { ...s } : null)),
      // Bodies are not saved: each one still tumbling is saved as a dropped item where it is, and the live body goes on.
      items: [
        ...this.items.snapshot(),
        ...this.bodies.bodies.map((b) => ({ state: b.state, count: 1, x: b.x, y: b.y, z: b.z })),
      ],
      timeOfDay: this.timeOfDay,
      timeOfYear: this.calendar.timeOfYear,
      gameMode: this.gameMode,
      health: this.health,
      hunger: this.hunger,
      air: this.air,
    };
  }

  private renderFrame(alpha: number, frameDt: number): void {
    if (this.idle) return;
    this.frameCount++;
    this.clockS += frameDt;
    const eKey = this.input.consumePressed('KeyE');
    const escKey = this.input.consumePressed('Escape');
    if (eKey && (this.playing || this.inventoryScreen.isOpen || (this.menu.visible && this.menu.currentMode === 'paused'))) {
      this.toggleInventory();
    }
    else if (escKey && this.inventoryScreen.isOpen) this.closeInventory();
    if (this.playing && !this.inventoryScreen.isOpen) {
      const { dx, dy } = this.input.consumeMouseDelta();
      this.player.addLook(dx, dy, this.mouseSensitivity);
      if (this.input.consumePressed('KeyF')) this.player.toggleFlying();
      this.handleHotbarInput();
      this.handleToolKeys();
    }
    if (this.input.consumePressed('F3') || this.input.consumePressed('Backquote')) this.debugOverlay.toggle();

    const focus = this.ready ? this.player.eyePosition(alpha) : this.spawnFocus();
    this.chunks.update(focus.x, focus.y, focus.z, GEN_BUDGET_MS, MESH_BUDGET_MS);
    if (!this.ready) this.trySpawn();

    const eye = this.player.eyePosition(alpha);
    this.renderer.setSurfaceDistance(this.chunks.surfaceDistance(eye.y));
    this.renderer.setCamera(eye.x, eye.y, eye.z, this.player.yaw, this.player.pitch);
    this.updateAtmosphere(eye, frameDt);
    this.clouds.update(eye.x, eye.z, frameDt, daylightAt(this.timeOfDay));
    const underwater = this.isWaterAt(Math.floor(eye.x), Math.floor(eye.y), Math.floor(eye.z));
    this.renderer.setUnderwater(underwater);
    const skyTop = this.world.topAt(Math.floor(eye.x), Math.floor(eye.z));
    this.horizon.update(eye.x, eye.z, this.settings.renderDistance, this.ready && !underwater && (skyTop === undefined || eye.y >= skyTop - metersToBlocks(16)));
    this.renderer.setHorizonDistance(this.horizon.visible ? this.horizon.radius : 0);
    const horizonEnvironment = this.renderer.horizonEnvironment;
    this.horizon.setEnvironment(horizonEnvironment.daylight, horizonEnvironment.sky, horizonEnvironment.haze);
    const look = this.player.lookDirection();
    this.updateTarget(eye, look);
    if (this.playing && this.ready && !this.inventoryScreen.isOpen) this.handleBlockActions(frameDt, eye, look);
    this.itemMeshes.sync(this.items.items, this.clockS);
    this.bodyMeshes.sync(this.bodies.bodies);
    this.breakOverlay.update(this.breaking.target, this.breaking.stage, this.breaking.target ? slabBounds(this.world.getBlock(this.breaking.target.x, this.breaking.target.y, this.breaking.target.z)) : null);
    const walking = this.player.onGround ? Math.min(1, Math.hypot(this.player.velocity.x, this.player.velocity.z) / WALK_SPEED) : 0;
    this.held.setState(this.inventory.selectedBlock);
    this.held.update(frameDt, walking, this.breaking.target !== null);
    if (frameDt > 0) this.fps += (1 / frameDt - this.fps) * 0.05;
    this.renderer.render();
    this.hud.update(this.inventory.slots, this.inventory.selected, frameDt, this.playing, this.ready && !this.inventoryScreen.isOpen);
    this.hud.setHazard(this.gameMode === GAME_MODE_SURVIVAL && this.fire.remaining > 0 ? 'On fire · Enter water to extinguish' : '');
    this.debugOverlay.update(frameDt, () => formatDebugLines(this.debugState()));
  }

  /** Keep atmospheric sampling and visual clocks together; positions here are in blocks. */
  private updateAtmosphere(eye: { x: number; y: number; z: number }, frameDt: number): void {
    // Lightning (T-F14): the current flash lights the world and whitens the sky colour.
    const flash = this.weatherRenderer.getFlashIntensity();
    this.renderer.setSkyColor(lerpColor(skyColorAt(this.timeOfDay), 0xffffff, flash * LIGHTNING_SKY_BRIGHTEN));
    this.renderer.setDaylight(Math.max(daylightAt(this.timeOfDay), flash));
    this.sky.update(this.timeOfDay, this.calendar.timeOfYear, this.renderer.camera);
    // Weather: sample at the player's position and update particles/lightning.
    const weather = this.weather.sample(
      eye.x * BLOCK_SIZE_M,
      eye.z * BLOCK_SIZE_M,
      this.timeOfDay,
      this.calendar.timeOfYear,
      eye.y * BLOCK_SIZE_M,
    );
    this.weatherRenderer.update(
      eye.x,
      eye.z,
      weather,
      frameDt,
      (x, z) => this.world.topAt(x, z),
      eye.y,
    );
    this.renderer.setWetness(this.weatherRenderer.wetness);
    this.updateThunder(frameDt);
    this.fogSampleTimer -= frameDt;
    if (this.fogSampleTimer <= 0) {
      this.fogSampleTimer = FOG_SAMPLE_INTERVAL_S;
      const span = metersToBlocks(FOG_VALLEY_SAMPLE_M);
      const local = this.generator.sampleColumn(eye.x, eye.z).offsetM;
      this.fogGroundM = local;
      const neighbours = [[span,0],[-span,0],[0,span],[0,-span]];
      const surrounding = neighbours.reduce((sum, [dx,dz]) => sum + this.generator.sampleColumn(eye.x + dx!, eye.z + dz!).offsetM, 0) / neighbours.length;
      this.fogValleyDepthM = Math.max(0, surrounding - local);
    }
    const aboveGround = Math.max(0, eye.y * BLOCK_SIZE_M - this.fogGroundM - FOG_GROUND_LAYER_M);
    this.renderer.setAtmosphericFog(atmosphericFogStrength(this.timeOfDay, weather.humidity, Math.max(0, this.fogValleyDepthM - aboveGround)));
  }

  /** Each new lightning strike queues one thunder clap after a random delay (T-F14). */
  private updateThunder(dt: number): void {
    for (; this.seenStrikes < this.weatherRenderer.strikes; this.seenStrikes++) {
      this.thunderDelays.push(THUNDER_DELAY_MIN_S + Math.random() * (THUNDER_DELAY_MAX_S - THUNDER_DELAY_MIN_S));
    }
    for (let i = this.thunderDelays.length - 1; i >= 0; i--) {
      this.thunderDelays[i]! -= dt;
      if (this.thunderDelays[i]! > 0) continue;
      this.thunderDelays.splice(i, 1);
      this.sounds.play('thunder');
    }
  }

  /** Where chunks are loaded around before the player is placed: the spawn point (or its column top). */
  private spawnFocus(): Vec3 {
    const saved = this.savedPlayer;
    if (saved) return { x: saved.x, y: saved.y + EYE_HEIGHT, z: saved.z };
    const top = this.world.topAt(Math.floor(this.spawn.x), Math.floor(this.spawn.z));
    return { x: this.spawn.x, y: (this.spawnFeetY ?? top ?? SEA_LEVEL) + EYE_HEIGHT, z: this.spawn.z };
  }

  /**
   * Places the player once the 3x3x3 chunks around the feet are meshed. A new player stands on the surface of the
   * spawn column, found by scanning down from its column top (which needs those chunks loaded first).
   */
  private trySpawn(): void {
    const saved = this.savedPlayer;
    if (saved) {
      if (!this.chunks.isAreaMeshed(saved.x, saved.y, saved.z, SPAWN_READY_RADIUS)) return;
      this.player.setPosition(saved.x, saved.y, saved.z);
      this.player.yaw = saved.yaw;
      this.player.pitch = saved.pitch;
      this.player.flying = saved.flying;
      this.ready = true;
      return;
    }
    if (this.spawnFeetY === null) {
      const top = this.world.topAt(Math.floor(this.spawn.x), Math.floor(this.spawn.z));
      if (top === undefined) return;
      let missing = false;
      const y = surfaceY(
        (x, yy, z) => {
          if (!this.world.isLoadedAt(x, yy, z)) missing = true;
          return this.world.getBlock(x, yy, z);
        },
        this.spawn.x,
        this.spawn.z,
        top,
      );
      if (missing) return;
      this.spawnFeetY = y;
    }
    if (!this.chunks.isAreaMeshed(this.spawn.x, this.spawnFeetY, this.spawn.z, SPAWN_READY_RADIUS)) return;
    this.player.setPosition(this.spawn.x, this.spawnFeetY, this.spawn.z);
    this.ready = true;
  }

  private applySettings(s: Settings): void {
    this.chunks.renderDistance = s.renderDistance;
    this.renderer.setViewDistance(s.renderDistance);
    this.renderer.setFov(s.fov);
    this.mouseSensitivity = DEFAULT_MOUSE_SENSITIVITY * s.mouseSensitivity;
  }

  private changeSettings(s: Settings): void {
    this.settings = s;
    this.applySettings(s);
    saveSettings(this.store, SETTINGS_KEY, s);
  }

  /** Deletes the save and reloads; with no save, the next start picks a new random seed. */
  private newWorld(): void {
    if(this.importing)return;
    const saving=this.savingEnabled,idle=this.idle;
    this.importing=true;this.savingEnabled=false;this.idle=true;this.menu.setBusy(true);
    void this.saver.drain().then(()=>this.worldStore.clear()).then(ok=>{
      if(ok){window.location.href=window.location.pathname;return;}
      this.savingEnabled=saving;this.idle=idle;this.importing=false;this.menu.setBusy(false);
      this.menu.setLockNote('The world could not be cleared. Your saved world is unchanged; reload before retrying.');
    });
  }

  /** Changes a block and remeshes the affected chunks. Returns false if the chunk is not loaded. */
  setBlock(x: number, y: number, z: number, id: number): boolean {
    const oldTop = this.world.topAt(x, z);
    const prev = this.world.getBlock(x, y, z);
    if (!this.world.setBlock(x, y, z, id)) return false;
    this.chunks.onBlockChanged(x, y, z, oldTop, this.world.topAt(x, z));
    // A log was chopped: the leaves it held up (if no other log holds them) fall a moment later.
    if (prev === BlockId.LOG && id !== BlockId.LOG) scheduleLeafDecay(this.world, x, y, z);
    // Sand or gravel above a removed block falls; a falling block placed in the air falls too.
    if (prev !== id) scheduleFallChecks(this.world, x, y, z);
    // A block that was holding others up is gone: its neighbours check their support (spec 25, slice 5).
    if (collapsible(prev) && !collapsible(id)) scheduleSupportChecks(this.world, x, y, z);
    // Water next to a changed cell may now flow into it, or drain.
    if (prev !== id) scheduleFlowChecks(this.world, x, y, z);
    return true;
  }

  /** Breaks the targeted block at once, dropping it (the debug API; holding the button is timed). */
  breakTarget(): boolean {
    const t = this.target;
    return t !== null && this.breakCell(t.x, t.y, t.z);
  }

  /** Removes a block and drops it as an item. Returns false when the block cannot be broken. */
  private breakCell(x: number, y: number, z: number): boolean {
    const id = this.world.getBlock(x, y, z);
    if (!canBreak(id)) return false;
    const ok = this.setBlock(x, y, z, BlockId.AIR);
    if (ok) {
      this.items.spawn(slabItemState(id), 1, x + 0.5, y + (1 - ITEM_SIZE) / 2, z + 0.5, Math.random);
      this.sounds.play('break');
    }
    return ok;
  }

  /**
   * Blocks the physics broke: a big collapse makes them tumbling bodies, and anything else drops as an item, as a
   * player's break does. Past the body cap, a block drops as an item.
   */
  private spawnBrokenBlocks(): void {
    for (const d of this.world.takeDrops()) {
      if (d.body && this.bodies.canAdd) this.bodies.spawn(d.id, d.x + 0.5, d.y, d.z + 0.5, Math.random);
      else this.items.spawn(slabItemState(d.id), 1, d.x + 0.5, d.y + (1 - ITEM_SIZE) / 2, d.z + 0.5, Math.random);
    }
  }

  /**
   * A body that came to rest becomes its block in the cell it fills, when that cell is open and the player is not in it.
   * Otherwise it drops as an item where it lies.
   */
  private settleBody(body: LooseBody): void {
    const x = Math.floor(body.x);
    const y = Math.floor(body.y + 0.5);
    const z = Math.floor(body.z);
    const cell = this.world.getBlock(x, y, z);
    const open = (cell === BlockId.AIR || isFluidState(cell)) && !blockIntersectsBody(x, y, z, this.player.position, PLAYER_SHAPE);
    if (open && this.setBlock(x, y, z, body.state)) return;
    this.items.spawn(body.state, 1, body.x, body.y, body.z, Math.random);
  }


  /** Middle click: pick the targeted block type (see Inventory.pick). */
  pickTarget(): boolean {
    const t = this.target;
    if (!t) return false;
    this.inventory.pick(slabItemState(this.world.getBlock(t.x, t.y, t.z)));
    return true;
  }

  /** Places the selected block against the targeted face, using one from its stack. Returns true if it was placed. */
  placeTarget(): boolean {
    const t = this.target;
    if (!t || this.inventory.selectedBlock === BlockId.AIR) return false;
    const block = this.inventory.selectedBlock;
    const eye = this.player.eyePosition(1), look = this.player.lookDirection();
    const p = resolvePlacement(t, (x, y, z) => this.world.getBlock(x, y, z), block, this.player.position, PLAYER_SHAPE, eye.y + look.y * t.distance);
    const ok = p !== null && this.setBlock(p.x, p.y, p.z, p.state);
    if (ok) {
      this.inventory.consumeSelected();
      this.sounds.play('place');
    }
    return ok;
  }

  /** A footstep sound every FOOTSTEP_DISTANCE walked on the ground. */
  private updateFootsteps(dt: number): void {
    const p = this.player;
    const speed = Math.hypot(p.velocity.x, p.velocity.z);
    if (!p.onGround || p.flying || speed < FOOTSTEP_MIN_SPEED) return;
    this.stepDistance += speed * dt;
    if (this.stepDistance >= FOOTSTEP_DISTANCE) {
      this.stepDistance = 0;
      this.sounds.play('step');
    }
  }

  private updateTarget(eye: Vec3, look: Vec3): void {
    this.target = this.ready
      ? raycastVoxels(eye.x, eye.y, eye.z, look.x, look.y, look.z, REACH, (x, y, z) => { const state = this.world.getBlock(x, y, z); return getBlockDef(state).targetable ? slabBounds(state) ?? true : false; })
      : null;
    this.updatePreview(eye, look);
  }

  private handleHotbarInput(): void {
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      if (this.input.consumePressed(`Digit${i + 1}`)) this.inventory.select(i);
    }
    const wheel = this.input.consumeWheel();
    if (wheel !== 0) this.inventory.scroll(wheel);
  }

  /**
   * Left button: hold to break the targeted block (spec 24). Right button places; holding repeats every BREAK_REPEAT_S
   * seconds. Middle click picks the targeted block.
   */
  private handleBlockActions(frameDt: number, eye: Vec3, look: Vec3): void {
    this.actionCooldown = Math.max(0, this.actionCooldown - frameDt);
    if (this.input.consumeClick(1)) this.pickTarget();
    if (this.tool.mode !== 'single') {
      // Volume tools: right click adds (add mode), left click removes (remove mode). Holding does nothing. Flatten
      // works on either button.
      const addClick = this.input.consumeClick(2);
      const removeClick = this.input.consumeClick(0);
      if (this.tool.kind === 'flatten') {
        if (addClick || removeClick) this.flattenAt();
      } else if (this.tool.mode === 'add' && addClick) {
        this.volumeClick(true, eye, look);
      } else if (this.tool.mode === 'remove' && removeClick) {
        this.volumeClick(false, eye, look);
      }
      return;
    }
    const breakClicked = this.input.consumeClick(0);
    const t = this.target;
    const broken = this.breaking.update(
      frameDt,
      this.input.isMouseDown(0),
      t ? { x: t.x, y: t.y, z: t.z } : null,
      this.breakHardness(),
    );
    if (this.breaking.stage >= 0) this.breakStageSeen = true; // every frame that shows cracks, not only polled ones
    if (broken) this.breakCell(broken.x, broken.y, broken.z);
    if (breakClicked || broken) this.held.swing();
    const placeClicked = this.input.consumeClick(2);
    if (placeClicked || (this.input.isMouseDown(2) && this.actionCooldown === 0)) {
      this.placeTarget();
      this.actionCooldown = BREAK_REPEAT_S;
      this.held.swing();
    }
  }

  /** Seconds to break the targeted block by hand, or null when it cannot be broken. */
  private breakHardness(): number | null {
    const t = this.target;
    if (!t) return null;
    const id = this.world.getBlock(t.x, t.y, t.z);
    return canBreak(id) ? getBlockDef(id).hardness : null;
  }

  /** Tool keys: R mode, Q shape, [ ] size, , . thickness, G solid or shell, C square or disc, X cancels a wall or floor. */
  private handleToolKeys(): void {
    const t = this.tool;
    if (this.input.consumePressed('KeyR')) t.cycleMode();
    if (this.input.consumePressed('KeyQ')) t.cycleKind();
    if (this.input.consumePressed('BracketLeft')) t.adjustSize(-1);
    if (this.input.consumePressed('BracketRight')) t.adjustSize(1);
    if (this.input.consumePressed('Comma')) t.adjustThickness(-1);
    if (this.input.consumePressed('Period')) t.adjustThickness(1);
    if (this.input.consumePressed('KeyG')) t.toggleHollow();
    if (this.input.consumeShortcut('KeyC')) this.copyTarget();
    else if (this.input.consumePressed('KeyC')) t.toggleDisc();
    if (this.input.consumeShortcut('KeyV')) this.pasteTarget();
    if (this.input.consumePressed('KeyX')) { t.cancelFrame(); this.clipboard.cancel(); }
    if (this.input.consumeShortcut('KeyZ')) this.undoEdit();
    if (this.input.consumeShortcut('KeyZ', true) || this.input.consumeShortcut('KeyY')) this.redoEdit();
  }

  /** Ctrl+Z: undoes the last volume action (cells changed since then are left alone). */
  undoEdit(): boolean {
    return this.edits.undo();
  }

  redoEdit(): boolean { return this.edits.redo(); }

  /** Copy two aimed corners; paste anchors the copied minimum corner to the aimed adjacent cell. */
  copyTarget(): boolean {
    if (!this.target || this.edits.busy || this.gameMode !== GAME_MODE_CREATIVE) return false;
    return this.clipboard.select(this.target, this.world);
  }
  pasteTarget(): boolean {
    const t = this.target;
    if (!t || this.gameMode !== GAME_MODE_CREATIVE || this.clipboard.count === 0) return false;
    return this.startEdit(this.clipboard.paste({x:t.x+t.nx,y:t.y+t.ny,z:t.z+t.nz}));
  }

  /** True while a volume action is still being applied over several frames. */
  get editsBusy(): boolean {
    return this.edits.busy;
  }

  /** One volume click at the aimed block, as the mouse does it (the debug API). */
  toolClick(add: boolean): void {
    this.volumeClick(add, this.player.eyePosition(1), this.player.lookDirection());
  }

  /**
   * One volume click. Box, sphere and plane change the volume at the aimed face. A wall or floor takes two clicks: the
   * first sets its first corner, the second sets the far corner (where the look ray meets its plane) and changes the
   * blocks between them.
   */
  private volumeClick(add: boolean, eye: Vec3, look: Vec3): void {
    const tool = this.tool;
    if (add && this.inventory.selectedBlock === BlockId.AIR) return;
    if (tool.twoClick) {
      if (!tool.frame) {
        if (this.target) tool.frame = frameFor(tool.kind, this.target, look, add);
        return;
      }
      const corner = cornerFor(tool.frame, eye, look);
      if (corner && this.startEdit(this.editCells(tool.cellsBetween(corner), add))) tool.frame = null;
      return;
    }
    if (this.target) this.startEdit(this.editCells(tool.cellsAt(this.target, add), add));
  }

  /** Flatten at the aimed block: the footprint is filled and cleared to the height of the aimed block. */
  private flattenAt(): void {
    const t = this.target;
    if (!t) return;
    this.startEdit(this.tool.cellsFlatten(t, (x, z) => this.world.topAt(x, z), this.inventory.selectedBlock));
  }

  /** Cells for an add (filled with the selected block) or a remove (cleared). */
  private editCells(cells: Cell[], add: boolean): EditCell[] {
    const id = add ? this.inventory.selectedBlock : BlockId.AIR;
    return cells.map((c) => ({ x: c.x, y: c.y, z: c.z, id, clear: !add }));
  }

  /** Queues a volume action. Fills keep only the cells outside the player's body, so a volume never traps the player. */
  private startEdit(cells: EditCell[]): boolean {
    const wanted = cells.filter((c) => c.clear || !blockIntersectsBody(c.x, c.y, c.z, this.player.position, PLAYER_SHAPE, slabBounds(c.id)));
    const started = this.edits.start(wanted);
    if (started) {
      this.held.swing();
      this.sounds.play(wanted.some((c) => !c.clear) ? 'place' : 'break');
    }
    return started;
  }

  /**
   * Shows what the volume tools would change: the outline of the volume at the aimed face, or of the wall, floor or roof
   * being drawn. Single-block mode shows the aimed block, as before. The build tool panel shows every setting either way.
   */
  private updatePreview(eye: Vec3, look: Vec3): void {
    const tool = this.tool;
    const t = this.target;
    const selection=t ? this.clipboard.preview(t) : null;
    if(selection) {this.highlight.showBox(selection);this.showToolRows(null);return;}
    if (tool.mode === 'single') {
      this.highlight.update(t, t ? slabBounds(this.world.getBlock(t.x, t.y, t.z)) : null);
      this.showToolRows(t ? 1 : null);
      return;
    }
    if (tool.twoClick) {
      const corner = tool.frame ? cornerFor(tool.frame, eye, look) : null;
      const box = corner ? tool.boxBetween(corner) : null;
      if (box) {
        this.highlight.showBox(box);
        this.showToolRows(volumeOf(box));
      } else {
        this.highlight.update(t, t ? slabBounds(this.world.getBlock(t.x, t.y, t.z)) : null);
        this.showToolRows(null);
      }
      return;
    }
    if (!t) {
      this.highlight.update(null);
      this.showToolRows(null);
      return;
    }
    const key = `${tool.kind}|${tool.mode}|${tool.size}|${tool.thickness}|${tool.disc}|${t.x},${t.y},${t.z},${t.nx},${t.ny},${t.nz}`;
    if (key !== this.previewKey) {
      this.previewKey = key;
      if (tool.kind === 'flatten') {
        this.previewBox = boundsOf(tool.footprint(t));
        this.previewCount = tool.cellsFlatten(t, (x, z) => this.world.topAt(x, z), this.inventory.selectedBlock).length;
      } else {
        const cells = tool.cellsAt(t, tool.mode === 'add');
        this.previewBox = boundsOf(cells);
        this.previewCount = cells.length;
      }
    }
    this.highlight.showBox(this.previewBox);
    this.showToolRows(this.previewCount);
  }

  /** Sends every tool setting to the HUD panel, with the live preview count (null when nothing is aimed). */
  private showToolRows(preview: number | null): void {
    const selected = this.inventory.selectedStack;
    this.hud.setTool(
      this.tool.rows({
        preview,
        block: selected ? getBlockDef(selected.state).name : 'empty',
        undo: this.edits.undoCount,
        redo: this.edits.redoCount,
        clipboard: this.gameMode === GAME_MODE_CREATIVE ? this.clipboard.status : 'Copy/paste requires creative mode',
      }),
    );
  }

  /** E or the HUD button: toggle the same inventory screen (spec 24). */
  private toggleInventory(): void {
    if (this.inventoryScreen.isOpen) this.closeInventory();
    else this.openInventory();
  }

  /** Frees the pointer and shows the inventory, remembering the originating menu when not playing. */
  private openInventory(): void {
    this.inventoryReturnMenu = this.playing ? null : this.menu.currentMode;
    this.menu.hide();
    this.inventoryScreen.show();
    this.input.releasePointerLock();
  }

  /** Closes the inventory. Restore its originating menu, or request pointer capture to return to play. */
  private closeInventory(): void {
    const leftover = this.inventoryScreen.hide();
    if (leftover) this.dropStack(leftover);
    if (this.inventoryReturnMenu !== null) {
      const mode = this.inventoryReturnMenu;
      this.inventoryReturnMenu = null;
      this.menu.show(mode);
    } else {
      this.input.requestPointerLock();
    }
  }

  /** Drops a stack in front of the player, for a stack that did not fit back into the inventory. */
  private dropStack(stack: ItemStack): void {
    const p = this.player.position;
    this.items.spawn(stack.state, stack.count, p.x, p.y + 1, p.z, Math.random);
  }

  /** Walking over dropped items picks them up while they fit in the inventory. */
  private collectItems(): void {
    const p = this.player.position;
    let changed = false;
    this.items.collect(p.x, p.y, p.z, PLAYER_HEIGHT, (state, count) => {
      const left = this.inventory.add(state, count);
      if (left < count) changed = true;
      return left;
    });
    if (changed && this.inventoryScreen.isOpen) this.inventoryScreen.refresh();
  }

  private readControls(): PlayerControls {
    const i = this.input;
    return {
      forward: i.isDown('KeyW'),
      back: i.isDown('KeyS'),
      left: i.isDown('KeyA'),
      right: i.isDown('KeyD'),
      jump: i.isDown('Space'),
      descend: i.isDown('ShiftLeft'),
      sprint: i.isDown('ShiftLeft') || i.isDown('ControlLeft'),
    };
  }

  /** Biome, temperature, rain and weather at the player, for the F3 overlay. */
  private climateDebug() {
    const p = this.player;
    const c = this.world.isLoadedAt(Math.floor(p.position.x), Math.floor(p.position.y), Math.floor(p.position.z))
      ? this.generator.climateAt(Math.floor(p.position.x), Math.floor(p.position.y), Math.floor(p.position.z))
      : null;
    const w = this.weather.sample(p.position.x * BLOCK_SIZE_M, p.position.z * BLOCK_SIZE_M, this.timeOfDay, this.calendar.timeOfYear, p.position.y * BLOCK_SIZE_M);
    return {
      biome: c?.biome ?? 'unknown',
      temperatureC: c ? Math.round(c.temperatureC * 10) / 10 : 0,
      precipitationMm: c ? Math.round(c.precipitationMm) : 0,
      weather: `${w.precipitation}${w.isStorm ? ', storm' : ''}`,
    };
  }

  debugState() {
    const p = this.player;
    const round = (v: number) => Math.round(v * 100) / 100;
    return {
      ready: this.ready,
      playing: this.playing,
      fps: Math.round(this.fps),
      seed: this.world.seed,
      position: [round(p.position.x), round(p.position.y), round(p.position.z)],
      yaw: round(p.yaw),
      pitch: round(p.pitch),
      onGround: p.onGround,
      flying: p.flying,
      inWater: p.inWater,
      timeOfDay: Math.round(this.timeOfDay * 1000) / 1000,
      season: this.calendar.season,
      dayOfSeason: this.calendar.day,
      ...this.climateDebug(),
      dayLengthMin: Math.round(this.calendar.dayLengthMin),
      gameMode: this.gameMode,
      health: this.health,
      horizon: { centerX: this.horizon.centerX, centerZ: this.horizon.centerZ, ready: this.horizon.radius > 0, visible: this.horizon.visible, vertices: this.horizon.vertices, radiusM: this.horizon.radius * BLOCK_SIZE_M, builds: this.horizon.builds },
      burning: this.fire.remaining > 0,
      inLava: this.player.inLava,
      hunger: this.hunger,
      air: Math.round(this.air * 100) / 100,
      target: this.target ? [this.target.x, this.target.y, this.target.z] : null,
      targetName: this.target ? getBlockDef(this.world.getBlock(this.target.x, this.target.y, this.target.z)).name : null,
      selectedSlot: this.inventory.selected,
      selectedBlock: getBlockDef(this.inventory.selectedBlock).name,
      hotbar: this.inventory.slots.slice(0, HOTBAR_SIZE).map((s) => s?.state ?? 0),
      hotbarCounts: this.inventory.slots.slice(0, HOTBAR_SIZE).map((s) => s?.count ?? 0),
      /** [block state, count] per slot, or null: hotbar first. */
      inventory: this.inventory.slots.map((s) => (s ? [s.state, s.count] : null)),
      inventoryOpen: this.inventoryScreen.isOpen,
      items: this.items.items.length,
      looseBodies: this.bodies.bodies.length,
      breakStage: this.breaking.stage,
      breakStageSeen: this.breakStageSeen,
      frames: this.frameCount,
      renderDistance: this.chunks.renderDistance,
      workers: this.chunks.usingWorkers,
      drawCalls: this.renderer.drawCalls,
      /** True when the 3x3x3 chunks around the player's feet are meshed. */
      areaMeshed: this.chunks.isAreaMeshed(p.position.x, p.position.y, p.position.z, SPAWN_READY_RADIUS),
      ...this.chunks.stats,
    };
  }
}
