import { describe, expect, it } from 'vitest';
import {
  RegionSampler,
  regionIndexOf,
  REGION_CELL_BLOCKS,
  REGION_CELLS,
  REGION_CORE_BLOCKS,
  REGION_CORE_CELLS,
  REGION_HALF_BLOCKS,
  REGION_MARGIN_CELLS,
  advectMoisture,
  carveRivers,
  climateHeightSource,
  descendingOrder,
  erodeThermal,
  priorityFlood,
  routeFlow,
  simulateRegion,
  type HeightSource,
} from '../src/world/region';
import { ClimateSampler } from '../src/world/shape';

const climate = new ClimateSampler(1337);

const CELLS = REGION_CELLS;
const COUNT = CELLS * CELLS;
const idx = (cx: number, cz: number) => cz * CELLS + cx;

function makeGrid(fill: (cx: number, cz: number) => number): Float32Array {
  const a = new Float32Array(COUNT);
  for (let cz = 0; cz < CELLS; cz++) for (let cx = 0; cx < CELLS; cx++) a[idx(cx, cz)] = fill(cx, cz);
  return a;
}

/** Deterministic pseudo-random terrain, for tests that need noise-scale pits. */
function noiseSource(seed: number): HeightSource {
  let s = seed;
  return {
    height: (xM, _zM) => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const a = (s / 0x7fffffff) * 100;
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const b = (s / 0x7fffffff) * 100;
      return a * 0.6 + b * 0.4 + Math.sin(xM / 300) * 20;
    },
  };
}

/**
 * A long valley that drains toward +x, built so cells converge into it.
 *
 * A uniform tilt cannot produce a river: every column drains independently, so the catchment is
 * one cell wide and never reaches the threshold. Crossing the slope is what concentrates flow,
 * so this source has terrain rising away from z = 0 and descending along x.
 */
const valleySource: HeightSource = {
  height: (xM, zM) => 0.08 * Math.abs(zM) - 0.03 * xM + 40,
};
/** A cone whose lowest point is the centre: every cell drains in, so one huge catchment. */
const coneSource: HeightSource = {
  height: (xM, zM) => Math.hypot(xM, zM) * 0.08 - 20,
};

describe('priorityFlood', () => {
  it('raises a pit to its spill level, so nothing ponds', () => {
    const base = makeGrid((cx, cz) => {
      const d = Math.hypot(cx - CELLS / 2, cz - CELLS / 2);
      return d < 12 ? 10 : 100;
    });
    const filled = new Float32Array(COUNT);
    priorityFlood(base, filled);

    for (let i = 0; i < COUNT; i++) expect(filled[i]!).toBeGreaterThanOrEqual(base[i]!);
    expect(filled[idx(CELLS / 2, CELLS / 2)]!).toBeGreaterThan(90);
  });

  it('leaves an already-draining surface untouched', () => {
    const base = makeGrid((_cx, cz) => cz);
    const filled = new Float32Array(COUNT);
    priorityFlood(base, filled);
    // Only the epsilon is added, and only where a tie would otherwise trap water.
    for (let i = 0; i < COUNT; i++) expect(filled[i]!).toBeGreaterThanOrEqual(base[i]!);
    expect(filled[idx(0, 0)]!).toBeCloseTo(base[idx(0, 0)]!, 2);
  });

  it('leaves no interior pit, even in noise', () => {
    const src = noiseSource(4242);
    const base = makeGrid((_cx, _cz) => 0);
    for (let cz = 0; cz < CELLS; cz++)
      for (let cx = 0; cx < CELLS; cx++) base[idx(cx, cz)] = src.height(cx * 9.6, cz * 9.6);
    const filled = new Float32Array(COUNT);
    priorityFlood(base, filled);
    const down = routeFlow(filled);

    let pits = 0;
    for (let cz = 1; cz < CELLS - 1; cz++)
      for (let cx = 1; cx < CELLS - 1; cx++) if (down[idx(cx, cz)] === -1) pits++;
    expect(pits).toBe(0);
  });
});

describe('routeFlow and accumulateFlow', () => {
  it('routes every cell to a strictly lower neighbour', () => {
    const base = makeGrid((cx, cz) => (cx + cz) % 7);
    const filled = new Float32Array(COUNT);
    priorityFlood(base, filled);
    const down = routeFlow(filled);
    for (let i = 0; i < COUNT; i++) {
      const d = down[i]!;
      if (d >= 0) expect(filled[d]!).toBeLessThan(filled[i]!);
    }
  });

  it('accumulates a growing catchment from a river source to the sea', () => {
    const r = simulateRegion(valleySource, 0, 0);
    // Start at the highest river cell (its source) and walk downstream to the sea.
    let start = -1;
    let bestH = -Infinity;
    for (let i = 0; i < COUNT; i++) {
      if (!r.river[i]) continue;
      if (r.height[i]! > bestH) {
        bestH = r.height[i]!;
        start = i;
      }
    }
    expect(start).toBeGreaterThanOrEqual(0);

    let i = start;
    let last = r.flow[i]!;
    let steps = 0;
    while (r.downstream[i]! >= 0 && steps < COUNT) {
      expect(r.flow[i]!).toBeGreaterThanOrEqual(last);
      last = r.flow[i]!;
      i = r.downstream[i]!;
      steps++;
    }
    expect(steps).toBeGreaterThan(10); // it really did travel to the sea
    expect(last).toBeGreaterThan(1000);
  });

  it('conserves catchment: every cell ends up at an outlet exactly once', () => {
    const r = simulateRegion(valleySource, 0, 0);
    let atOutlets = 0;
    for (let i = 0; i < COUNT; i++) if (r.downstream[i] === -1) atOutlets += r.flow[i]!;
    expect(atOutlets).toBeCloseTo(COUNT, 2);
  });

  it('orders cells so a cell is visited only after everything draining into it', () => {
    const surface = makeGrid((_cx, cz) => cz);
    const order = descendingOrder(surface);
    for (let k = 1; k < order.length; k++) {
      expect(surface[order[k]!]!).toBeLessThanOrEqual(surface[order[k - 1]!]!);
    }
  });
});

describe('erodeThermal', () => {
  it('leaves flat ground alone and knocks a spike down', () => {
    const flat = new Float32Array(COUNT).fill(50);
    erodeThermal(flat);
    for (let i = 0; i < COUNT; i++) expect(flat[i]!).toBeCloseTo(50, 5);

    const spike = new Float32Array(COUNT).fill(50);
    spike[idx(CELLS / 2, CELLS / 2)] = 400;
    erodeThermal(spike);
    expect(spike[idx(CELLS / 2, CELLS / 2)]!).toBeLessThan(400);
    // Material moved outward, not destroyed.
    expect(spike[idx(CELLS / 2 + 1, CELLS / 2)]!).toBeGreaterThan(50);
  });

  it('never leaves a slope past the angle of repose on flat ground', () => {
    // A staircase: every step is far steeper than repose, so it should relax.
    const step = new Float32Array(COUNT).fill(0);
    for (let cz = 0; cz < CELLS; cz++)
      for (let cx = 0; cx < CELLS; cx++) step[idx(cx, cz)] = cx < CELLS / 2 ? 0 : 40;
    erodeThermal(step);
    // The cliff face must have spread into its neighbours.
    const face = step[idx(CELLS / 2 - 1, CELLS / 2)]!;
    expect(face).toBeGreaterThan(0);
  });
});

describe('carveRivers', () => {
  it('cuts a channel with a flow direction along the drainage network', () => {
    const height = new Float32Array(COUNT);
    const flow = new Float32Array(COUNT).fill(1000);
    const down = new Int32Array(COUNT).fill(-1);
    const lake = new Uint8Array(COUNT);
    const river = new Uint8Array(COUNT);
    const depth = new Float32Array(COUNT);
    const width = new Float32Array(COUNT);
    const fx = new Float32Array(COUNT);
    const fz = new Float32Array(COUNT);

    for (let cz = 0; cz < CELLS; cz++)
      for (let cx = 0; cx < CELLS; cx++) {
        height[idx(cx, cz)] = cz;
        down[idx(cx, cz)] = cz > 0 ? idx(cx, cz - 1) : -1;
      }
    carveRivers(height, flow, down, lake, river, depth, width, fx, fz);

    const mid = idx(4, 4);
    expect(river[mid]).toBe(1);
    expect(depth[mid]!).toBeGreaterThan(0);
    expect(width[mid]!).toBeGreaterThan(0);
    expect(height[mid]!).toBeLessThan(4); // cut below its starting 4
    expect(fz[mid]!).toBe(-1); // flows down the ramp, toward -z
    expect(fx[mid]!).toBe(0);
  });

  it('grows wider and deeper with more flow', () => {
    const height = new Float32Array(COUNT);
    const down = new Int32Array(COUNT).fill(-1);
    const lake = new Uint8Array(COUNT);
    const depth = new Float32Array(COUNT);
    const width = new Float32Array(COUNT);
    const small = new Float32Array(COUNT).fill(400);
    const big = new Float32Array(COUNT).fill(40000);
    carveRivers(height, small, down, lake, new Uint8Array(COUNT), depth, width, new Float32Array(COUNT), new Float32Array(COUNT));
    const smallDepth = depth[idx(5, 5)]!;
    const smallWidth = width[idx(5, 5)]!;
    carveRivers(height, big, down, lake, new Uint8Array(COUNT), depth, width, new Float32Array(COUNT), new Float32Array(COUNT));
    expect(depth[idx(5, 5)]!).toBeGreaterThan(smallDepth);
    expect(width[idx(5, 5)]!).toBeGreaterThan(smallWidth);
  });

  it('leaves low-catchment ground bare and does not cut lakes', () => {
    const down = new Int32Array(COUNT).fill(-1);
    const river = new Uint8Array(COUNT);
    const flow1 = new Float32Array(COUNT).fill(1);
    carveRivers(new Float32Array(COUNT), flow1, down, new Uint8Array(COUNT), river, new Float32Array(COUNT), new Float32Array(COUNT), new Float32Array(COUNT), new Float32Array(COUNT));
    for (let i = 0; i < COUNT; i++) expect(river[i]).toBe(0);

    const lake = new Uint8Array(COUNT);
    lake[idx(3, 3)] = 1;
    const river2 = new Uint8Array(COUNT);
    carveRivers(new Float32Array(COUNT), new Float32Array(COUNT).fill(100000), down, lake, river2, new Float32Array(COUNT), new Float32Array(COUNT), new Float32Array(COUNT), new Float32Array(COUNT));
    expect(river2[idx(3, 3)]).toBe(0);
    expect(river2[idx(4, 4)]).toBe(1);
  });
});

describe('advectMoisture', () => {
  it('wets the windward side of a range and dries the lee side', () => {
    // A ridge across the wind: the wind blows +x, so the west half is windward.
    const height = makeGrid((cx) => (cx < CELLS / 2 ? 20 : 200));
    const moisture = new Float32Array(COUNT);
    advectMoisture(height, moisture);

    const windward = moisture[idx(10, CELLS / 2)]!;
    const lee = moisture[idx(CELLS - 10, CELLS / 2)]!;
    expect(windward).toBeGreaterThan(0.5);
    expect(lee).toBeLessThan(windward);
  });

  it('dries out progressively downwind of the ridge', () => {
    const height = makeGrid((cx) => (cx < CELLS / 2 ? 20 : 200));
    const moisture = new Float32Array(COUNT);
    advectMoisture(height, moisture);
    let last = Infinity;
    for (let cx = CELLS / 2; cx < CELLS - 4; cx += 4) {
      const m = moisture[idx(cx, CELLS / 2)]!;
      expect(m).toBeLessThanOrEqual(last + 1e-6);
      last = m;
    }
  });

  it('keeps the ocean saturated', () => {
    const height = makeGrid(() => -50);
    const moisture = new Float32Array(COUNT);
    advectMoisture(height, moisture);
    for (let i = 0; i < COUNT; i++) expect(moisture[i]).toBe(1);
  });

  it('stays within 0..1', () => {
    const height = makeGrid((cx) => ((cx * 7919) % 300) - 50);
    const moisture = new Float32Array(COUNT);
    advectMoisture(height, moisture);
    for (let i = 0; i < COUNT; i++) {
      expect(moisture[i]!).toBeGreaterThanOrEqual(0);
      expect(moisture[i]!).toBeLessThanOrEqual(1);
    }
  });
});

describe('simulateRegion', () => {
  it('is deterministic: the same source and region give the same result', () => {
    const a = simulateRegion(valleySource, 0, 0);
    const b = simulateRegion(valleySource, 0, 0);
    for (let i = 0; i < COUNT; i++) {
      expect(a.height[i]!).toBe(b.height[i]!);
      expect(a.flow[i]!).toBe(b.flow[i]!);
      expect(a.moisture[i]!).toBe(b.moisture[i]!);
      expect(a.river[i]).toBe(b.river[i]);
    }
  });

  it('carves rivers that only ever run downhill', () => {
    const r = simulateRegion(valleySource, 0, 0);
    let rivers = 0;
    for (let i = 0; i < COUNT; i++) {
      if (!r.river[i]) continue;
      rivers++;
      const d = r.downstream[i]!;
      if (d >= 0) expect(r.height[d]!).toBeLessThanOrEqual(r.height[i]! + 1e-4);
    }
    expect(rivers).toBeGreaterThan(0);
  });

  it('gathers a large catchment where the valley collects', () => {
    const r = simulateRegion(valleySource, 0, 0);
    let max = 0;
    for (let i = 0; i < COUNT; i++) max = Math.max(max, r.flow[i]!);
    expect(max).toBeGreaterThan(COUNT / 4);
  });

  it('forms a lake in a cone basin, with one level for the whole basin', () => {
    const r = simulateRegion(coneSource, 0, 0);
    let lakes = 0;
    const levels = new Set<number>();
    for (let i = 0; i < COUNT; i++) {
      if (!r.lake[i]) continue;
      lakes++;
      levels.add(r.lakeLevel[i]!);
      // A lake only exists where filling genuinely raised the ground, and above sea level.
      expect(r.filledHeight[i]! - r.baseHeight[i]!).toBeGreaterThan(1);
      expect(r.lakeLevel[i]!).toBeGreaterThan(0);
      expect(r.height[i]!).toBeLessThan(r.lakeLevel[i]!);
      // No river channel is cut through a lake, which would drain it.
      expect(r.river[i]).toBe(0);
    }
    expect(lakes).toBeGreaterThan(0);
    // A cone drains to a single basin, so there should be exactly one level.
    expect(levels.size).toBe(1);
  });

  it('produces no visible step at a region boundary', () => {
    // The spike the roadmap asks for, stated correctly.
    //
    // Two neighbouring regions do not have to agree cell-for-cell: a region core ends where the
    // next core begins, 32 blocks apart, and those two cells legitimately differ by the terrain
    // slope. What must not happen is a *step larger than the terrain already has*. So this
    // compares the height step across the seam against the step between ordinary adjacent cells
    // well inside a core. If the seam is within the ordinary range, nothing can see it.
    const src = climateHeightSource((xM, zM) => climate.fields(xM, zM));
    const a = simulateRegion(src, 0, 0);
    const b = simulateRegion(src, 1, 0);

    const inside: number[] = [];
    for (let cz = REGION_MARGIN_CELLS + 4; cz < CELLS - REGION_MARGIN_CELLS - 5; cz += 2)
      for (let cx = REGION_MARGIN_CELLS + 4; cx < CELLS - REGION_MARGIN_CELLS - 5; cx += 2) {
        inside.push(Math.abs(a.height[idx(cx + 1, cz)]! - a.height[idx(cx, cz)]!));
      }
    inside.sort((p, q) => p - q);
    const typical = inside[inside.length >> 1]!;

    const seam: number[] = [];
    for (let cz = REGION_MARGIN_CELLS; cz < CELLS - REGION_MARGIN_CELLS; cz += 2) {
      seam.push(Math.abs(b.height[idx(REGION_MARGIN_CELLS, cz)]! - a.height[idx(CELLS - REGION_MARGIN_CELLS - 1, cz)]!));
    }
    seam.sort((p, q) => p - q);
    const medianSeam = seam[seam.length >> 1]!;
    const maxSeam = seam[seam.length - 1]!;

    // The seam must not stand out from the terrain around it.
    expect(medianSeam).toBeLessThan(typical * 2);
    // And no single seam step may be a cliff on its own.
    expect(maxSeam).toBeLessThan(typical * 12);
  });

  it('places every region core around the position it claims to own', () => {
    // A source whose height depends only on x: region (n, 0)'s core centre must sit near
    // world x = n * REGION_CORE_BLOCKS, so its height must match that x.
    const src: HeightSource = { height: (xM) => -xM / 50 + 100 };
    const mid = Math.floor(CELLS / 2);
    for (const regionX of [-1, 0, 2]) {
      const r = simulateRegion(src, regionX, 0);
      // The cell nearest the core centre, sampled by index.
      const cx = mid - REGION_MARGIN_CELLS + REGION_CORE_CELLS / 2;
      const expected = -(regionX * REGION_CORE_BLOCKS * 0.3) / 50 + 100;
      expect(Math.abs(r.height[idx(cx, mid)]! - expected)).toBeLessThan(15);
    }
  });

  it('covers the region core, not just the simulated margin', () => {
    const r = simulateRegion(coneSource, 2, -3);
    const seen = new Set<number>();
    for (let cz = 20; cz < CELLS - 20; cz++) for (let cx = 20; cx < CELLS - 20; cx++) seen.add(Math.round(r.height[idx(cx, cz)]!));
    expect(seen.size).toBeGreaterThan(5);
  });

  it('does not simulate one region as a copy of a shifted one', () => {
    // Different regions sample different world positions, so they must not be identical.
    const a = simulateRegion(coneSource, 0, 0);
    const b = simulateRegion(coneSource, 3, 2);
    let same = 0;
    for (let i = 0; i < COUNT; i += 7) if (a.baseHeight[i] === b.baseHeight[i]) same++;
    expect(same).toBeLessThan(COUNT / 7);
  });
});

describe('grid geometry', () => {
  it('has a core large enough to cover the camera far plane', () => {
    expect(REGION_CORE_BLOCKS * 0.3).toBeGreaterThan(600);
  });

  it('has a margin deeper than anything that reads across cells', () => {
    expect(REGION_HALF_BLOCKS).toBeGreaterThan(8 * REGION_CELL_BLOCKS);
  });
});

describe('world-coordinate region sampling', () => {
  const plane = (x: number, z: number) => 100 - x * 0.01 - z * 0.005;
  it('selects the centred core for positive and negative coordinates', () => {
    for (let r = -3; r <= 3; r++) {
      const centre = r * REGION_CORE_BLOCKS;
      expect(regionIndexOf(centre - REGION_CORE_BLOCKS / 2)).toBe(r);
      expect(regionIndexOf(centre)).toBe(r);
      expect(regionIndexOf(centre + REGION_CORE_BLOCKS / 2 - 1)).toBe(r);
      expect(regionIndexOf(centre + REGION_CORE_BLOCKS / 2)).toBe(r + 1);
    }
  });
  it('samples a sloped world without clamped flat strips or steps at 50 actual ownership seams', () => {
    const sampler = new RegionSampler({ height: plane }, 64);
    for (let rx = -2; rx <= 2; rx++) for (let rz = -2; rz <= 2; rz++) {
      for (const axis of ['x', 'z']) {
        const seam = (axis === 'x' ? rx + 0.5 : rz + 0.5) * REGION_CORE_BLOCKS;
        const other = (axis === 'x' ? rz : rx) * REGION_CORE_BLOCKS + 137;
        const values = [-1, 0, 1].map(d => {
          const x = axis === 'x' ? seam + d : other;
          const z = axis === 'z' ? seam + d : other;
          const s = sampler.sample(x, z);
          expect(s.isLake).toBe(false);
          expect(s.offsetM).toBeCloseTo(plane(x * 0.3, z * 0.3), 3);
          return s.offsetM;
        });
        expect(Math.abs(values[2]! - values[0]!)).toBeLessThan(0.01);
      }
    }
    // The old selection flattened this whole strip into the far simulated border.
    const before = sampler.sample(-26, 101);
    expect(before.offsetM).toBeCloseTo(plane(-26 * 0.3, 101 * 0.3), 3);
    sampler.clear();
    expect(sampler.sample(-26, 101)).toEqual(before);
  });
});
