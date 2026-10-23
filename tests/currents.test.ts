import { describe, expect, it } from 'vitest';
import { NO_CONTROLS, Player } from '../src/player/player';
import { LooseBodies } from '../src/items/looseBodies';
import { BlockId, flowingWaterState } from '../src/world/blocks';
import { flowVector } from '../src/world/flow';

/** A stream along +x at y = 0: a source at x = 0, then levels 7, 6, 5 ... ; still sources at z = 5; a fall at x = 20. */
function stream(x: number, y: number, z: number): number {
  if (y !== 0) return BlockId.STONE;
  if (z === 5) return BlockId.WATER;
  if (z !== 0) return BlockId.STONE;
  if (x === 20) return flowingWaterState(8, true);
  return x === 0 ? BlockId.WATER : x > 0 && x < 8 ? flowingWaterState(8 - x, false) : BlockId.STONE;
}

describe('currents (T-G12)', () => {
  it('flow runs toward thinner water, is still in a pool, and points down in falling water', () => {
    expect(flowVector(stream, 3, 0, 0)).toEqual({ x: 1, y: 0, z: 0 });
    expect(flowVector(stream, 0, 0, 5)).toEqual({ x: 0, y: 0, z: 0 });
    expect(flowVector(stream, 20, 0, 0)).toEqual({ x: 0, y: -1, z: 0 });
    expect(flowVector(stream, 3, 1, 0)).toEqual({ x: 0, y: 0, z: 0 }); // not fluid
  });

  it('carries a floating player and a loose body downstream; still water leaves them be', () => {
    const solid = (_x: number, y: number) => y < 10;
    const water = (_x: number, y: number) => y >= 10 && y <= 19;
    const along = () => ({ x: 1, y: 0, z: 0 });
    const still = () => ({ x: 0, y: 0, z: 0 });
    const drifted = (flow: typeof along) => {
      const p = new Player();
      p.setPosition(0.5, 15, 0.5);
      for (let i = 0; i < 120; i++) p.update(1 / 60, NO_CONTROLS, solid, water, undefined, flow);
      return p.position.x - 0.5;
    };
    expect(drifted(along)).toBeGreaterThan(1);
    expect(drifted(still)).toBe(0);

    const bodies = new LooseBodies();
    bodies.spawn(BlockId.PLANKS, 0.5, 15, 0.5, () => 0.5);
    const body = bodies.bodies[0]!;
    const x0 = body.x;
    for (let i = 0; i < 120; i++) bodies.step(1 / 60, solid, water, () => 600, undefined, along);
    expect(body.x - x0).toBeGreaterThan(1);
  });
});
