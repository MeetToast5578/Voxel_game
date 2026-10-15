import type { Game } from './game';

/** Exposed as window.__game so automated tests (scripts/smoke.mjs) can inspect and drive the game. */
export interface DebugApi {
  readonly ready: boolean;
  state(): ReturnType<Game['debugState']>;
  teleport(x: number, y: number, z: number): void;
  look(yaw: number, pitch: number): void;
  setFlying(flying: boolean): void;
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
}

declare global {
  interface Window {
    __game?: DebugApi;
  }
}

export function installDebugApi(game: Game): void {
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
    getBlock: (x, y, z) => game.world.getBlock(x, y, z),
    setBlock: (x, y, z, id) => game.setBlock(x, y, z, id),
    breakTarget: () => game.breakTarget(),
    placeTarget: () => game.placeTarget(),
    pickTarget: () => game.pickTarget(),
    selectSlot: (index) => game.inventory.select(index),
    setHotbarSlot: (index, state) => game.inventory.setSlot(index, state),
    holdButton: (button, down) => game.input.simulateButton(button, down),
    save: () => game.saveNow(),
    setTimeOfDay: (t) => {
      game.timeOfDay = ((t % 1) + 1) % 1;
    },
  };
}
