import { describe, expect, it } from 'vitest';
import { BLOCKS } from '../engine/blocks';
import type { World } from '../engine/world';
import { Atlas, MAP_SCALE } from '../ui/atlas';

/** Flat grass at y 5 in chunk columns with cx < 2; nothing loaded beyond. */
const world = {
  column: (cx: number) => (cx < 2 ? { skyTop: new Int32Array(256).fill(5) } : undefined),
  isLoaded: (x: number) => x < 32,
  get: () => BLOCKS.state('grass'),
} as unknown as World;

describe('atlas', () => {
  it('remembers the land it saw, and keeps it through a save', () => {
    const a = new Atlas();
    a.record(world, 0, 0, 32);
    const seen = a.at(0, 0);
    expect(seen).not.toBeNull();
    expect(a.at(40 / MAP_SCALE, 0)).toBeNull();
    expect(a.at(-100, -100)).toBeNull();
    const b = new Atlas();
    b.load(JSON.parse(JSON.stringify(a.save())));
    expect(b.at(0, 0)).toEqual(seen);
    expect(b.at(-5, 7)).toEqual(a.at(-5, 7));
  });

  it('skips malformed saved regions', () => {
    const a = new Atlas();
    a.load([[0, 0, 'not base64!'], [1, 'x', ''], 'junk', [0, 1, btoa('short')]]);
    expect(a.save()).toEqual([]);
  });
});
