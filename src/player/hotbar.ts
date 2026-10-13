import { HOTBAR_SIZE } from '../config';
import { mod } from '../core/math';
import { BLOCK_STATE_COUNT, BlockId } from '../world/blocks';

export const DEFAULT_HOTBAR: readonly number[] = [
  BlockId.STONE,
  BlockId.DIRT,
  BlockId.GRASS,
  BlockId.COBBLESTONE,
  BlockId.PLANKS,
  BlockId.LOG,
  BlockId.GLOWSTONE,
  BlockId.GLASS,
  BlockId.BRICK,
];

export class Hotbar {
  readonly slots: number[];
  selected = 0;

  constructor(slots: readonly number[] = DEFAULT_HOTBAR) {
    if (slots.length !== HOTBAR_SIZE) throw new Error(`Hotbar needs exactly ${HOTBAR_SIZE} slots`);
    this.slots = [...slots];
  }

  get selectedBlock(): number {
    return this.slots[this.selected]!;
  }

  /** index 0..8; anything else is ignored. */
  select(index: number): void {
    if (Number.isInteger(index) && index >= 0 && index < HOTBAR_SIZE) this.selected = index;
  }

  /** steps > 0 moves right, steps < 0 moves left; wraps around. */
  scroll(steps: number): void {
    this.selected = mod(this.selected + steps, HOTBAR_SIZE);
  }

  /** Puts a block state into slot index (0..8). An invalid index, air, or an unregistered state is ignored. */
  setSlot(index: number, state: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= HOTBAR_SIZE) return;
    if (!Number.isInteger(state) || state <= BlockId.AIR || state >= BLOCK_STATE_COUNT) return;
    this.slots[index] = state;
  }

  /** "Pick block": select the slot holding `id`, or put `id` into the selected slot. */
  pick(id: number): void {
    const existing = this.slots.indexOf(id);
    if (existing >= 0) this.selected = existing;
    else this.slots[this.selected] = id;
  }
}
