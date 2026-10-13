import {
  AUTOSAVE_INTERVAL_S, BREAK_REPEAT_S, DAY_LENGTH_S, DEFAULT_MOUSE_SENSITIVITY, FIXED_DT, FOOTSTEP_DISTANCE,
  FOOTSTEP_MIN_SPEED, GEN_BUDGET_MS, HOTBAR_SIZE, MAX_FRAME_DT, MESH_BUDGET_MS, REACH, SAVE_KEY, SETTINGS_KEY, SPAWN_READY_RADIUS, START_TIME_OF_DAY,
} from './config';
import { Sounds } from './audio/sounds';
import { FixedStepLoop } from './core/loop';
import { Input } from './input/input';
import type { GameOptions } from './options';
import { Hotbar } from './player/hotbar';
import { canBreak, placementTarget } from './player/interaction';
import type { Vec3 } from './player/physics';
import { NO_CONTROLS, PLAYER_SHAPE, Player, type PlayerControls } from './player/player';
import { raycastVoxels, type RaycastHit } from './player/raycast';
import { ChunkMeshes } from './render/chunkMeshes';
import { Clouds } from './render/clouds';
import { BlockHighlight } from './render/highlight';
import { Renderer } from './render/renderer';
import { editsToRecord, loadSave, recordToEdits, writeSave, type SavedPlayer } from './storage/save';
import { loadSettings, saveSettings, type Settings } from './storage/settings';
import { MemoryStore, browserStore, type KeyValueStore } from './storage/store';
import { DebugOverlay } from './ui/debugOverlay';
import { formatDebugLines } from './ui/debugText';
import { Hud } from './ui/hud';
import { Menu } from './ui/menu';
import { BlockId, getBlockDef, isSolid } from './world/blocks';
import { ChunkManager } from './world/chunkManager';
import { TerrainGenerator } from './world/generator';
import { findSpawnColumn, surfaceY } from './world/spawn';
import { daylightAt, skyColorAt } from './world/time';
import { WorkerPool } from './workers/workerPool';
import { World } from './world/world';

export class Game {
  readonly world: World;
  readonly generator: TerrainGenerator;
  readonly renderer: Renderer;
  readonly meshes: ChunkMeshes;
  readonly chunks: ChunkManager;
  readonly player = new Player();
  readonly hotbar = new Hotbar();
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
  private readonly loop: FixedStepLoop;
  private readonly spawn: { x: number; z: number };
  private readonly highlight: BlockHighlight;
  private actionCooldown = 0;
  private readonly store: KeyValueStore;
  private settings: Settings;
  private mouseSensitivity = DEFAULT_MOUSE_SENSITIVITY;
  private readonly hud: Hud;
  private readonly menu: Menu;
  private readonly debugOverlay: DebugOverlay;
  /** False with ?nosave=1 or ?seed=..., and after "New world" was clicked. */
  private savingEnabled: boolean;
  private saveTimer = 0;
  /** Where the player was when the game was saved; used instead of the spawn search. */
  private readonly savedPlayer: SavedPlayer | null;
  private readonly clouds: Clouds;
  private stepDistance = 0;
  private readonly usingWorkers: boolean;

  constructor(container: HTMLElement, readonly options: GameOptions) {
    this.store = options.nosave ? new MemoryStore() : browserStore();
    this.settings = loadSettings(this.store, SETTINGS_KEY);

    // A ?seed= URL starts a throw-away world: it neither loads nor overwrites the save.
    this.savingEnabled = !options.nosave && options.seed === null;
    const save = this.savingEnabled ? loadSave(this.store, SAVE_KEY) : null;
    const seed = options.seed ?? save?.seed ?? Math.floor(Math.random() * 1_000_000_000);
    this.world = new World(seed);
    if (save) {
      for (const [key, chunkEdits] of recordToEdits(save.edits)) this.world.edits.set(key, chunkEdits);
      this.hotbar.select(save.selectedSlot);
    }
    this.savedPlayer = save?.player ?? null;
    this.generator = new TerrainGenerator(seed);
    this.renderer = new Renderer(container);
    this.meshes = new ChunkMeshes(this.renderer.scene, this.renderer.solidMaterial, this.renderer.waterMaterial);
    this.usingWorkers = options.workers && typeof Worker !== 'undefined';
    const workerCount = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
    const jobs = this.usingWorkers ? new WorkerPool(seed, workerCount) : null;
    this.chunks = new ChunkManager(this.world, this.generator, this.meshes, this.settings.renderDistance, jobs);
    this.applySettings(this.settings);
    this.spawn = this.savedPlayer ? { x: this.savedPlayer.x, z: this.savedPlayer.z } : findSpawnColumn(this.generator);

    this.highlight = new BlockHighlight(this.renderer.scene);
    this.clouds = new Clouds(this.renderer.scene, seed);
    this.input = new Input(this.renderer.canvas);
    this.hud = new Hud(container, this.renderer.atlasCanvas);
    this.debugOverlay = new DebugOverlay(container);
    this.menu = new Menu(container, this.settings, {
      onPlay: () => {
        this.sounds.unlock();
        this.input.requestPointerLock();
      },
      onSettingsChange: (s) => this.changeSettings(s),
      onNewWorld: () => this.newWorld(),
    });

    this.playing = options.autostart;
    if (options.autostart) this.menu.hide();
    else this.menu.show('start');
    this.renderer.canvas.addEventListener('click', () => {
      this.sounds.unlock();
      if (!this.input.pointerLocked) this.input.requestPointerLock();
    });
    this.input.onPointerLockChanged((locked) => {
      this.playing = locked || options.autostart;
      if (locked) this.menu.hide();
      else if (!options.autostart) this.menu.show('paused');
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.saveNow();
    });
    window.addEventListener('pagehide', () => this.saveNow());

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

  /** Solid test used by physics. Unloaded chunks count as solid so the player can never fall out of the world. */
  readonly isSolidAt = (x: number, y: number, z: number): boolean =>
    !this.world.isLoadedAt(x, z) || isSolid(this.world.getBlock(x, y, z));

  readonly isWaterAt = (x: number, y: number, z: number): boolean => this.world.getBlock(x, y, z) === BlockId.WATER;

  private fixedUpdate(dt: number): void {
    if (!this.ready) return;
    this.timeOfDay = (this.timeOfDay + dt / DAY_LENGTH_S) % 1;
    this.player.update(dt, this.playing ? this.readControls() : NO_CONTROLS, this.isSolidAt, this.isWaterAt);
    this.updateFootsteps(dt);
    this.saveTimer += dt;
    if (this.saveTimer >= AUTOSAVE_INTERVAL_S) {
      this.saveTimer = 0;
      this.saveNow();
    }
  }

  /** Writes the save game (player edits, player state, seed). Does nothing when saving is disabled. */
  saveNow(): void {
    if (!this.savingEnabled || !this.ready) return;
    const p = this.player;
    writeSave(this.store, SAVE_KEY, {
      version: 1,
      seed: this.world.seed,
      selectedSlot: this.hotbar.selected,
      player: { x: p.position.x, y: p.position.y, z: p.position.z, yaw: p.yaw, pitch: p.pitch, flying: p.flying },
      edits: editsToRecord(this.world.edits),
    });
  }

  private renderFrame(alpha: number, frameDt: number): void {
    if (this.playing) {
      const { dx, dy } = this.input.consumeMouseDelta();
      this.player.addLook(dx, dy, this.mouseSensitivity);
      if (this.input.consumePressed('KeyF')) this.player.toggleFlying();
      this.handleHotbarInput();
    }
    if (this.input.consumePressed('F3') || this.input.consumePressed('Backquote')) this.debugOverlay.toggle();

    const focus = this.ready ? this.player.position : { x: this.spawn.x, z: this.spawn.z };
    this.chunks.update(focus.x, focus.z, GEN_BUDGET_MS, MESH_BUDGET_MS);

    if (!this.ready && this.chunks.isAreaMeshed(this.spawn.x, this.spawn.z, SPAWN_READY_RADIUS)) {
      const saved = this.savedPlayer;
      if (saved) {
        this.player.setPosition(saved.x, saved.y, saved.z);
        this.player.yaw = saved.yaw;
        this.player.pitch = saved.pitch;
        this.player.flying = saved.flying;
      } else {
        const y = surfaceY((x, yy, z) => this.world.getBlock(x, yy, z), this.spawn.x, this.spawn.z);
        this.player.setPosition(this.spawn.x, y, this.spawn.z);
      }
      this.ready = true;
    }

    const eye = this.player.eyePosition(alpha);
    this.renderer.setCamera(eye.x, eye.y, eye.z, this.player.yaw, this.player.pitch);
    this.renderer.setDaylight(daylightAt(this.timeOfDay));
    this.renderer.setSkyColor(skyColorAt(this.timeOfDay));
    this.clouds.update(eye.x, eye.z, frameDt, daylightAt(this.timeOfDay));
    this.renderer.setUnderwater(this.isWaterAt(Math.floor(eye.x), Math.floor(eye.y), Math.floor(eye.z)));
    this.updateTarget(eye);
    if (this.playing && this.ready) this.handleBlockActions(frameDt);
    if (frameDt > 0) this.fps += (1 / frameDt - this.fps) * 0.05;
    this.renderer.render();
    this.hud.update(this.hotbar.slots, this.hotbar.selected, frameDt);
    this.debugOverlay.update(frameDt, () => formatDebugLines(this.debugState()));
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
    this.savingEnabled = false; // otherwise 'pagehide' would write the old world back
    this.store.removeItem(SAVE_KEY);
    window.location.href = window.location.pathname;
  }

  /** Changes a block and remeshes the affected chunks. Returns false if the chunk is not loaded. */
  setBlock(x: number, y: number, z: number, id: number): boolean {
    if (!this.world.setBlock(x, y, z, id)) return false;
    this.chunks.onBlockChanged(x, y, z);
    return true;
  }

  /** Breaks the targeted block. Returns true if a block was removed. */
  breakTarget(): boolean {
    const t = this.target;
    if (!t || !canBreak(this.world.getBlock(t.x, t.y, t.z))) return false;
    const ok = this.setBlock(t.x, t.y, t.z, BlockId.AIR);
    if (ok) this.sounds.play('break');
    return ok;
  }

  /** Middle click: put the targeted block type into the hotbar. */
  pickTarget(): boolean {
    const t = this.target;
    if (!t) return false;
    this.hotbar.pick(this.world.getBlock(t.x, t.y, t.z));
    return true;
  }

  /** Places the selected hotbar block against the targeted face. Returns true if a block was placed. */
  placeTarget(): boolean {
    const t = this.target;
    if (!t) return false;
    const block = this.hotbar.selectedBlock;
    const p = placementTarget(t, (x, y, z) => this.world.getBlock(x, y, z), block, this.player.position, PLAYER_SHAPE);
    const ok = p !== null && this.setBlock(p.x, p.y, p.z, block);
    if (ok) this.sounds.play('place');
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

  private updateTarget(eye: Vec3): void {
    const d = this.player.lookDirection();
    this.target = this.ready
      ? raycastVoxels(eye.x, eye.y, eye.z, d.x, d.y, d.z, REACH, (x, y, z) => getBlockDef(this.world.getBlock(x, y, z)).targetable)
      : null;
    this.highlight.update(this.target);
  }

  private handleHotbarInput(): void {
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      if (this.input.consumePressed(`Digit${i + 1}`)) this.hotbar.select(i);
    }
    const wheel = this.input.consumeWheel();
    if (wheel !== 0) this.hotbar.scroll(wheel);
  }

  /** Left button breaks, right button places; holding a button repeats every BREAK_REPEAT_S seconds. */
  private handleBlockActions(frameDt: number): void {
    this.actionCooldown = Math.max(0, this.actionCooldown - frameDt);
    if (this.input.consumeClick(1)) this.pickTarget();
    const breakClicked = this.input.consumeClick(0);
    const placeClicked = this.input.consumeClick(2);
    if (breakClicked || (this.input.isMouseDown(0) && this.actionCooldown === 0)) {
      this.breakTarget();
      this.actionCooldown = BREAK_REPEAT_S;
    } else if (placeClicked || (this.input.isMouseDown(2) && this.actionCooldown === 0)) {
      this.placeTarget();
      this.actionCooldown = BREAK_REPEAT_S;
    }
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
      target: this.target ? [this.target.x, this.target.y, this.target.z] : null,
      targetName: this.target ? getBlockDef(this.world.getBlock(this.target.x, this.target.y, this.target.z)).name : null,
      selectedSlot: this.hotbar.selected,
      selectedBlock: getBlockDef(this.hotbar.selectedBlock).name,
      renderDistance: this.chunks.renderDistance,
      workers: this.usingWorkers,
      ...this.chunks.stats,
    };
  }
}
