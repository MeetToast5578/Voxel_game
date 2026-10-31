import { describe, expect, it } from 'vitest';
import { BLOCKS } from '../engine/blocks';
import { raycast, TARGET } from '../game/raycast';
import { submergedFraction } from '../game/player';

const at = (cells: Record<string, number>) => (x: number, y: number, z: number) => TARGET[cells[`${x},${y},${z}`] ?? 0]!;
const S = (key: string, v = 0) => BLOCKS.state(key, v);

describe('raycast', () => {
  it('hits the first full cell and reports the face entered', () => {
    const hit = raycast(0.5, 0.5, 0.5, 1, 0, 0, 10, at({ '4,0,0': S('stone'), '6,0,0': S('stone') }))!;
    expect([hit.x, hit.y, hit.z, hit.nx, hit.ny, hit.nz]).toEqual([4, 0, 0, -1, 0, 0]);
    expect(hit.distance).toBeCloseTo(3.5);
  });

  it('stops at its reach and passes through water', () => {
    expect(raycast(0.5, 0.5, 0.5, 1, 0, 0, 3, at({ '4,0,0': S('stone') }))).toBeNull();
    const hit = raycast(0.5, 0.5, 0.5, 1, 0, 0, 10, at({ '2,0,0': S('water'), '3,0,0': S('stone') }))!;
    expect(hit.x).toBe(3);
  });

  it('hits the top of a bottom slab from above and misses its empty half', () => {
    const cells = { '0,0,0': S('stone_slab') };
    const down = raycast(0.5, 3, 0.5, 0, -1, 0, 10, at(cells))!;
    expect(down.ny).toBe(1);
    expect(down.distance).toBeCloseTo(2.5);
    expect(raycast(-1, 0.75, 0.5, 1, 0, 0, 10, at(cells))).toBeNull();
  });

  it('hits a slab from inside its own cell', () => {
    const hit = raycast(0.5, 0.9, 0.5, 0, -1, 0, 10, at({ '0,0,0': S('stone_slab') }))!;
    expect(hit.distance).toBeCloseTo(0.4);
    expect(hit.ny).toBe(1);
  });
});

describe('swimming', () => {
  it('measures how much of the body is under water', () => {
    const body = { x: 0.5, y: 0, z: 0.5, vx: 0, vy: 0, vz: 0, halfWidth: 0.4, height: 3, onGround: false };
    expect(submergedFraction(body, () => false)).toBe(0);
    expect(submergedFraction(body, () => true)).toBeCloseTo(1);
    expect(submergedFraction(body, (_x, y) => y < 1)).toBeCloseTo(1 / 3);
    body.y = 0.5;
    expect(submergedFraction(body, (_x, y) => y < 1)).toBeCloseTo(0.5 / 3);
  });
});
