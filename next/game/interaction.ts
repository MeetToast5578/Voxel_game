import { REACH_M, REPEAT_S, toCells } from '../config';
import { BLOCKS } from '../engine/blocks';
import type { World } from '../engine/world';
import { COLLISION } from './collision';
import type { Input } from './input';
import { overlapsSolid } from './physics';
import type { Player } from './player';
import { raycast, TARGET, type RayHit } from './raycast';

export const HOTBAR = ['stone', 'dirt', 'grass', 'planks', 'glass', 'glowstone', 'sand', 'water', 'lava'];

/** Breaking and placing blocks under the crosshair, with a hotbar. */
export class Interaction {
  slot = 0;
  target: RayHit | null = null;
  private repeat = 0;

  constructor(private readonly world: World, private readonly setBlock: (x: number, y: number, z: number, state: number) => void) {}

  get selected(): number {
    return BLOCKS.state(HOTBAR[this.slot]!);
  }

  update(dt: number, input: Input, player: Player): void {
    if (input.slot >= 0) this.slot = Math.min(HOTBAR.length - 1, input.slot);
    input.slot = -1;
    if (input.consume('slotNext')) this.slot = (this.slot + 1) % HOTBAR.length;
    if (input.consume('slotPrev')) this.slot = (this.slot + HOTBAR.length - 1) % HOTBAR.length;
    const [dx, dy, dz] = player.direction();
    const b = player.body;
    this.target = raycast(b.x, player.eyeY, b.z, dx, dy, dz, toCells(REACH_M), (x, y, z) => TARGET[this.world.get(x, y, z)]!);
    if (input.consume('pick') && this.target) {
      const key = BLOCKS.type(this.world.get(this.target.x, this.target.y, this.target.z)).key;
      const i = HOTBAR.indexOf(key);
      if (i >= 0) this.slot = i;
    }
    this.repeat -= dt;
    const breakNow = input.consume('break') || (input.breaking && this.repeat <= 0);
    const placeNow = input.consume('place') || (input.placing && this.repeat <= 0);
    if (!this.target || (!breakNow && !placeNow)) return;
    this.repeat = REPEAT_S;
    const t = this.target;
    if (breakNow) {
      this.setBlock(t.x, t.y, t.z, BLOCKS.state('air'));
      return;
    }
    const x = t.x + t.nx, y = t.y + t.ny, z = t.z + t.nz;
    const there = this.world.get(x, y, z);
    if (TARGET[there] !== 0 || !this.world.isLoaded(x, y, z)) return;
    const state = this.selected;
    // Nothing is placed where it would trap the player.
    const box = COLLISION[state]!;
    if (box !== 0 && overlapsSolid(b, (cx, cy, cz) => (cx === x && cy === y && cz === z ? box : 0))) return;
    this.setBlock(x, y, z, state);
  }
}
