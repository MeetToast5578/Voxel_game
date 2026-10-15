import type { Game } from './game';
import { addDroppedItem, spawnDroppedItem } from './items/droppedItems';

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
  /** Puts a block state into a hotbar slot; an invalid index or state is ignored. */
  setHotbarSlot(index: number, state: number): void;
  /** Drops an item of this block state in cell (x, y, z), as breaking a block does. */
  dropItem(x: number, y: number, z: number, blockId: number): void;
  /** The dropped items on the ground, oldest first; x, y, z is the bottom centre of each item. */
  droppedItems(): { blockId: number; x: number; y: number; z: number; pickupDelay: number }[];
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
    selectSlot: (index) => game.hotbar.select(index),
    setHotbarSlot: (index, state) => game.hotbar.setSlot(index, state),
    dropItem: (x, y, z, blockId) => addDroppedItem(game.items, spawnDroppedItem(blockId, x, y, z, Math.random)),
    droppedItems: () =>
      game.items.map((item) => ({
        blockId: item.blockId,
        x: item.pos.x,
        y: item.pos.y,
        z: item.pos.z,
        pickupDelay: item.pickupDelay,
      })),
    save: () => game.saveNow(),
    setTimeOfDay: (t) => {
      game.timeOfDay = ((t % 1) + 1) % 1;
    },
  };
}
