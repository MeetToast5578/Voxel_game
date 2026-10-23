import { describe, expect, it } from 'vitest';
import { LAVA_TICK_DELAY, WATER_TICK_DELAY, LAVA_DENSITY, WATER_DENSITY } from '../src/config';
import { BlockId, blockTopHeight, flowingLavaState, isLavaState, lavaLevel, getBlockDef, blockStateName, parseBlockStateName } from '../src/world/blocks';
import { Chunk } from '../src/world/chunk';
import { World } from '../src/world/world';
import { scheduleFlowChecks, scheduleFlowingWater, handleFlow, FLOW_REASON } from '../src/world/flow';
import { Player, NO_CONTROLS } from '../src/player/player';
import { LooseBodies } from '../src/items/looseBodies';

function fixture() {
  const w = new World(1);
  for (const cx of [-1, 0, 1]) {
    for (const cy of [-1, 0]) w.addChunk(new Chunk(cx, cy, 0));
    w.installColumnTops(cx, 0, new Int32Array(256).fill(-100));
    for (let x = cx * 16; x < cx * 16 + 16; x++) for (let z = 0; z < 16; z++) w.setBlock(x, 0, z, BlockId.BEDROCK);
  }
  return w;
}
function pour(w: World, x: number, y: number, z: number, id: number) {
  expect(w.setBlock(x, y, z, id)).toBe(true);
  scheduleFlowChecks(w, x, y, z);
}
function ticks(w: World, n: number) { for (let i = 0; i < n; i++) w.tickStep(1000); }

describe('lava flow and registry (T-G8)', () => {
  it('appends luminous non-solid lava states and round-trips level/falling names', () => {
    expect(getBlockDef(BlockId.LAVA).solid).toBe(false);
    expect(getBlockDef(BlockId.LAVA).lightEmission).toBe(15);
    expect(getBlockDef(BlockId.LAVA).density).toBe(LAVA_DENSITY);
    for (let level = 1; level <= 8; level++) for (const falling of [false, true]) {
      const s = flowingLavaState(level, falling);
      expect(isLavaState(s)).toBe(true);
      expect(lavaLevel(s)).toBe(level);
      expect(blockTopHeight(s)).toBe(level / 8);
      expect(parseBlockStateName(blockStateName(s))).toBe(s);
    }
  });
  it('moves at its own slower delay, across a negative chunk seam, thinning sideways', () => {
    const w = fixture();
    pour(w, -1, 1, 4, BlockId.LAVA);
    ticks(w, WATER_TICK_DELAY);
    expect(w.getBlock(0, 1, 4)).toBe(BlockId.AIR);
    ticks(w, LAVA_TICK_DELAY - WATER_TICK_DELAY - 1);
    expect(w.getBlock(0, 1, 4)).toBe(BlockId.AIR);
    ticks(w, 1);
    expect(w.getBlock(0, 1, 4)).toBe(flowingLavaState(7, false));
    expect(w.getBlock(1, 1, 4)).toBe(BlockId.AIR);
    ticks(w, LAVA_TICK_DELAY);
    expect(w.getBlock(1, 1, 4)).toBe(flowingLavaState(6, false));
  });
  it('falls before spreading and flowing lava drains without a same-fluid feed', () => {
    const w = fixture();
    pour(w, 4, 4, 4, BlockId.LAVA);
    ticks(w, LAVA_TICK_DELAY);
    expect(w.getBlock(4, 3, 4)).toBe(flowingLavaState(8, true));
    expect(w.getBlock(5, 4, 4)).toBe(BlockId.AIR);
    const lone = fixture();
    pour(lone, 4, 1, 4, flowingLavaState(4, false));
    ticks(lone, LAVA_TICK_DELAY);
    expect(lone.getBlock(4, 1, 4)).toBe(BlockId.AIR);
  });
  it('resumes saved flowing lava and source contacts at the correct delay', () => {
    const w = fixture(), c = w.getChunk(0, 0, 0)!;
    w.setBlock(4, 1, 4, flowingLavaState(2, false));
    scheduleFlowingWater(w, c);
    ticks(w, LAVA_TICK_DELAY - 1);
    expect(isLavaState(w.getBlock(4, 1, 4))).toBe(true);
    ticks(w, 1);
    expect(w.getBlock(4, 1, 4)).toBe(BlockId.AIR);
    w.setBlock(8, 1, 4, BlockId.LAVA); w.setBlock(9, 1, 4, BlockId.WATER);
    scheduleFlowingWater(w, c);
    ticks(w, WATER_TICK_DELAY);
    expect(w.getBlock(8, 1, 4)).toBe(BlockId.OBSIDIAN);
  });
  it('resumes reactions when the water side of a source interface loads across a chunk seam', () => {
    const w = fixture();
    w.setBlock(-1, 1, 4, BlockId.LAVA); w.setBlock(0, 1, 4, BlockId.WATER);
    // Only the water chunk is resumed: the lava chunk was already present.
    scheduleFlowingWater(w, w.getChunk(0, 0, 0)!);
    ticks(w, WATER_TICK_DELAY);
    expect(w.getBlock(-1, 1, 4)).toBe(BlockId.OBSIDIAN);
    expect(w.getBlock(0, 1, 4)).toBe(BlockId.WATER);
  });
  it('gives a player more buoyancy and greater drag without water splash flags', () => {
    const water = new Player(), lava = new Player();
    water.velocity.x = lava.velocity.x = 10;
    water.update(1 / 60, NO_CONTROLS, () => false, () => true);
    lava.update(1 / 60, NO_CONTROLS, () => false, () => false, () => true);
    expect(lava.velocity.x).toBeLessThan(water.velocity.x);
    expect(lava.velocity.y).toBeGreaterThan(water.velocity.y);
    expect(lava.inWater).toBe(false); expect(lava.inLava).toBe(true); expect(lava.splashSpeed).toBe(0);
  });
  it('applies lava density and high drag to loose rock bodies', () => {
    const a = new LooseBodies(), b = new LooseBodies();
    const aw = a.spawn(BlockId.STONE, 4, 1, 4, () => 0.5), bl = b.spawn(BlockId.STONE, 4, 1, 4, () => 0.5);
    aw.vx = bl.vx = 10;
    a.step(1 / 60, () => false, () => true, () => 2600);
    b.step(1 / 60, () => false, () => false, () => 2600, () => true);
    expect(bl.vx).toBeLessThan(aw.vx); expect(bl.vy).toBeGreaterThan(aw.vy);
    expect(LAVA_DENSITY).toBeGreaterThan(WATER_DENSITY);
  });
});

describe('water/lava reactions (T-G9)', () => {
  it.each([[BlockId.LAVA, BlockId.OBSIDIAN], [flowingLavaState(4, false), BlockId.COBBLESTONE]])('cools lava %s to %s from either handler order', (lava, product) => {
    for (const waterFirst of [true, false]) {
      const w = fixture();
      w.setBlock(-1, 1, 4, lava); w.setBlock(0, 1, 4, BlockId.WATER);
      const run = (x: number) => handleFlow(w, { x, y: 1, z: 4, dueTick: 0, reason: FLOW_REASON });
      run(waterFirst ? 0 : -1); run(waterFirst ? -1 : 0);
      expect(w.getBlock(-1, 1, 4)).toBe(product);
      expect(w.getBlock(0, 1, 4)).toBe(BlockId.WATER);
    }
  });
  it('prioritizes downward lava/water contact as stone and preserves water', () => {
    const w = fixture();
    w.setBlock(4, 1, 4, BlockId.WATER); pour(w, 4, 2, 4, BlockId.LAVA);
    ticks(w, WATER_TICK_DELAY);
    expect(w.getBlock(4, 2, 4)).toBe(BlockId.STONE);
    expect(w.getBlock(4, 1, 4)).toBe(BlockId.WATER);
  });
});
