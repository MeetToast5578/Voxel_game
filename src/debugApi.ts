import { parseBlockStateName } from './world/blocks';
import { growSapling } from './world/saplings';
import type { Game } from './game';
import type { ToolKind, ToolMode } from './player/buildTool';
import { HEALTH_MAX, HUNGER_MAX, AIR_MAX_S } from './config';

/** Exposed as window.__game so automated tests (scripts/smoke.mjs) can inspect and drive the game. */
export interface DebugApi {
  readonly ready: boolean;
  state(): ReturnType<Game['debugState']>;
  teleport(x: number, y: number, z: number): void;
  look(yaw: number, pitch: number): void;
  setFlying(flying: boolean): void;
  /** Isolate voxel terrain without changing fog or camera range. */
  setHorizonHidden(hidden: boolean): void;
  blockState(name: string): number | null;
  getBlock(x: number, y: number, z: number): number;
  setBlock(x: number, y: number, z: number, id: number): boolean;
  breakTarget(): boolean;
  placeTarget(): boolean;
  pickTarget(): boolean;
  selectSlot(index: number): void;
  /** Puts a full stack of a block state into a hotbar slot; an invalid index or state is ignored. */
  setHotbarSlot(index: number, state: number): void;
  /** Presses (down) or releases a mouse button, for the smoke test: 0 left, 1 middle, 2 right (spec 24). */
  holdButton(button: number, down: boolean): void;
  /** Resolves once the write has completed (true) or failed or was skipped (false). */
  save(): Promise<boolean>;
  setTimeOfDay(t: number): void;
  /** 0..1 wraps; 0 = spring equinox. For checking seasonal visuals (T-F7). */
  setTimeOfYear(t: number): void;
  /** Grows the sapling at a cell now, as a random tick would (T-G3). Returns whether it grew. */
  growSapling(x: number, y: number, z: number): boolean;
  /** Turns snow and ice (T-G2), leaf litter (T-G6) and regrowing plants (T-G5) on or off, so test platforms high in the sky stay as built. */
  setWeatherEffects(on: boolean): void;
  /** The volume tools: sets any of their fields (mode, kind, size, thickness, disc) for the smoke test. */
  setTool(fields: { mode?: ToolMode; kind?: ToolKind; size?: number; thickness?: number; disc?: boolean }): void;
  /** One add or remove click at the aimed block with the volume tools. The change lands over the next frames. */
  toolClick(add: boolean): void;
  /** Undoes the last volume action. False when there is none or one is still being applied. */
  undoEdit(): boolean;
  redoEdit(): boolean;
  copyTarget(): boolean;
  pasteTarget(): boolean;
  exportWorld(): string;
  importWorld(text:string): Promise<boolean>;
  /** True while a volume action is still being applied. */
  readonly editsBusy: boolean;
  /** Game mode: 'survival' or 'creative'. */
  setGameMode(mode: 'survival' | 'creative'): void;
  /** Set player health (0..20). */
  setHealth(health: number): void;
  /** Apply damage to the player. */
  damage(amount: number): void;
  /** Set player hunger (0..20). */
  setHunger(hunger: number): void;
  /** Set player air (0..15 seconds). */
  setAir(air: number): void;
  /** Clears the flag that records whether a crack stage was shown for the current mining attempt. */
  resetBreakStage(): void;
  /** Debug hook: pauses or resumes simulation and rendering so an auxiliary page can load without contention. */
  setIdle(idle: boolean): void;
  /** Spawns a creature by species key (T-H1); returns its id, or null for an unknown species. */
  spawnCreature(species: string, x: number, y: number, z: number): number | null;
  /** Every live creature: id, species, position, behaviour and health. */
  creatures(): { id: number; species: string; x: number; y: number; z: number; behaviour: string; health: number }[];
  /** Removes every live creature (stored ones stay), for checks that need a quiet world. */
  clearCreatures(): void;
  /** Turns creature spawning and column storage on or off (scripted checks turn it off). */
  setCreatureSpawning(on: boolean): void;
}

declare global {
  interface Window {
    __game?: DebugApi;
  }
}

export function installDebugApi(game: Game): void {
  const { surfaceWeather, leafFall, groundPlantAt } = game.world; // set in the Game constructor
  window.__game = {
    get ready() {
      return game.ready;
    },
    state: () => game.debugState(),
    teleport: (x, y, z) => game.player.setPosition(x, y, z),
    look: (yaw, pitch) => {
      game.player.yaw = yaw;
      game.player.pitch = pitch;
    },
    setFlying: (flying) => {
      if (game.player.flying !== flying) game.player.toggleFlying();
    },
    setHorizonHidden: hidden => game.horizon.setDebugHidden(hidden),
    blockState: parseBlockStateName,
    getBlock: (x, y, z) => game.world.getBlock(x, y, z),
    setBlock: (x, y, z, id) => game.setBlock(x, y, z, id),
    breakTarget: () => game.breakTarget(),
    placeTarget: () => game.placeTarget(),
    pickTarget: () => game.pickTarget(),
    selectSlot: (index) => game.inventory.select(index),
    setHotbarSlot: (index, state) => game.inventory.setSlot(index, state),
    holdButton: (button, down) => game.input.simulateButton(button, down),
    resetBreakStage: () => game.resetBreakStage(),
    setIdle: (idle) => game.setIdle(idle),
    save: () => game.saveNow(),
    growSapling: (x, y, z) => growSapling(game.world, x, y, z),
    setWeatherEffects: (on) => {
      game.world.surfaceWeather = on ? surfaceWeather : undefined;
      game.world.leafFall = on ? leafFall : undefined;
      game.world.groundPlantAt = on ? groundPlantAt : undefined;
    },
    setTimeOfDay: (t) => {
      game.timeOfDay = ((t % 1) + 1) % 1;
    },
    setTimeOfYear: (t) => {
      game.calendar.timeOfYear = ((t % 1) + 1) % 1;
    },
    setTool: (fields) => {
      Object.assign(game.tool, fields);
    },
    toolClick: (add) => game.toolClick(add),
    undoEdit: () => game.undoEdit(),
    redoEdit: () => game.redoEdit(),
    copyTarget: () => game.copyTarget(),
    pasteTarget: () => game.pasteTarget(),
    exportWorld: () => game.exportWorld(),
    importWorld: text => game.importWorld(text),
    get editsBusy() {
      return game.editsBusy;
    },
    spawnCreature: (species, x, y, z) => game.spawnCreature(species, x, y, z)?.id ?? null,
    creatures: () => game.creatures.all().map((c) => ({ id: c.id, species: c.species.key, x: c.x, y: c.y, z: c.z, behaviour: c.behaviour, health: c.health })),
    clearCreatures: () => { for (const c of game.creatures.all()) game.creatures.remove(c.id); },
    setCreatureSpawning: (on) => { game.creatureSpawning = on; },
    setGameMode: (mode) => {
      game.setGameMode(mode); // through the game, so the menu picker stays in step and survival tops up the vitals
    },
    setHealth: (health) => {
      game.health = Math.max(0, Math.min(HEALTH_MAX, health));
    },
    damage: (amount) => {
      game.damage(amount);
    },
    setHunger: (hunger) => {
      game.hunger = Math.max(0, Math.min(HUNGER_MAX, hunger));
    },
    setAir: (air) => {
      game.air = Math.max(0, Math.min(AIR_MAX_S, air));
    },
  };
}
