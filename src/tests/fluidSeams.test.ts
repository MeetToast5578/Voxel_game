import { describe, expect, it } from 'vitest';
import { BLOCKS } from '../engine/blocks';
import { buildMesh, decodeVertex, LAYERS, PAD_VOLUME, padIndex } from '../engine/mesher';

type Point = readonly [number, number, number];
type Cell = { point: Point; state: number };
const directions = [
  { face: 0, axis: 0, sign: 1 }, { face: 1, axis: 0, sign: -1 },
  { face: 4, axis: 2, sign: 1 }, { face: 5, axis: 2, sign: -1 },
] as const;
// Independently specified rendered heights, in sixteenths: source, eight flow levels, eight falling states.
const heights = [14, 2, 4, 5, 7, 9, 11, 12, 14, 16, 16, 16, 16, 16, 16, 16, 16];
const states = (kind: string) => [BLOCKS.state(kind), ...Array.from({ length: 16 }, (_, v) => BLOCKS.state('flowing_' + kind, v))];

function mesh(kind: string, cells: Cell[]) {
  const data = new Uint16Array(PAD_VOLUME);
  for (const c of cells) data[padIndex(...c.point)] = c.state;
  const words = buildMesh({ states: data, light: new Uint8Array(PAD_VOLUME).fill(0xf0), climate: new Uint8Array(256) })[LAYERS.indexOf(kind === 'water' ? 'water' : 'opaque')]!;
  return Array.from({ length: words.length / 8 }, (_, q) => [0, 2, 4, 6].map(i => decodeVertex(words[q * 8 + i]!, words[q * 8 + i + 1]!)));
}

function checkJoin(kind: string, a: number, b: number, d: typeof directions[number], at: Point, coveredA = false, coveredB = false) {
  const list = states(kind), neighbour = [...at] as [number, number, number];
  neighbour[d.axis] += d.sign;
  const cells: Cell[] = [{ point: at, state: list[a]! }, { point: neighbour, state: list[b]! }];
  if (coveredA) cells.push({ point: [at[0], at[1] + 1, at[2]], state: list[0]! });
  if (coveredB) cells.push({ point: [neighbour[0], neighbour[1] + 1, neighbour[2]], state: list[0]! });
  const plane = at[d.axis] + (d.sign > 0 ? 1 : 0);
  const quads = mesh(kind, cells).filter(q => q.every(v => v.normal === d.face && (d.axis === 0 ? v.x : v.z) === plane && v.y >= at[1] && v.y <= at[1] + 1));
  const high = coveredA ? 16 : heights[a]!, low = coveredB ? 16 : heights[b]!;
  const label = `${kind} ${a}/${b}, face ${d.face}, at ${at}, covered ${coveredA}/${coveredB}`;
  expect(quads.length, label).toBe(high > low ? 1 : 0);
  if (high > low) {
    expect([...new Set(quads[0]!.map(v => (v.y - at[1]) * 16))].sort((x, y) => x - y), label).toEqual([low, high]);
    const lateral = d.axis === 0 ? 'z' : 'x', start = at[d.axis === 0 ? 2 : 0];
    expect([...new Set(quads[0]!.map(v => v[lateral]))].sort((x, y) => x - y), label).toEqual([start, start + 1]);
  }
}

describe('continuous fluid boundaries', () => {
  it.each(['water', 'lava'])('closes every source/flow/falling height pair for %s', kind => {
    for (let a = 0; a < heights.length; a++) for (let b = 0; b < heights.length; b++) {
      checkJoin(kind, a, b, directions[0], [7, 7, 7]);
    }
  });

  it.each(['water', 'lava'])('joins %s on every side at horizontal and vertical chunk borders', kind => {
    for (const d of directions) for (const border of [false, true]) {
      const at: [number, number, number] = [7, 15, 7];
      if (border) at[d.axis] = d.sign > 0 ? 15 : 0;
      for (let b = 0; b < heights.length; b++) for (const coveredA of [false, true]) for (const coveredB of [false, true]) {
        checkJoin(kind, 0, b, d, at, coveredA, coveredB);
        checkJoin(kind, b, 0, d, at, coveredA, coveredB);
      }
    }
  });

  it.each(['water', 'lava'])('keeps merged %s river-step strips joined over a whole chunk width', kind => {
    const cells: Cell[] = [], source = BLOCKS.state(kind);
    for (let z = -1; z <= 16; z++) for (let y = 0; y <= 3; y++) {
      cells.push({ point: [7, y, z], state: source });
      if (y < 3) cells.push({ point: [8, y, z], state: source });
    }
    const join = mesh(kind, cells).filter(q => q.every(v => v.normal === 0 && v.x === 8 && v.y >= 2 && v.y <= 3));
    expect(join).toHaveLength(1);
    expect([...new Set(join[0]!.map(v => v.y))].sort()).toEqual([2.875, 3]);
    expect([...new Set(join[0]!.map(v => v.z))].sort((a, b) => a - b)).toEqual([0, 16]);
  });
});
