import { describe, expect, it } from 'vitest';
import { INVENTORY_SIZE, START_TIME_OF_DAY, STARTING_STACK } from '../src/config';
import { DEFAULT_HOTBAR, type ItemStack } from '../src/player/inventory';
import { metaRecord, parseChunkRecord, parseMeta, readSave, SAVE_VERSION, type WorldMeta } from '../src/storage/save';
import { BlockId } from '../src/world/blocks';

const inventory: (ItemStack | null)[] = Array.from({ length: INVENTORY_SIZE }, () => null);
[BlockId.BRICK, BlockId.SAND, BlockId.GLOWSTONE, BlockId.STONE, BlockId.LEAVES, BlockId.LOG, BlockId.WATER, BlockId.GLASS, BlockId.BEDROCK]
  .forEach((state, i) => (inventory[i] = { state, count: 64 }));
inventory[20] = { state: BlockId.GLASS, count: 1 };

const sample: WorldMeta = {
  scheduledTicks: [],
  gameTick: 0,
  seed: 42,
  selectedSlot: 3,
  player: { x: 1.5, y: 60, z: -3.25, yaw: 0.5, pitch: -0.2, flying: false },
  inventory,
  items: [{ state: BlockId.STONE, count: 1, x: 3.5, y: 40, z: 2.25 }],
  timeOfDay: 0.6,
  timeOfYear: 0.3,
  gameMode: 'creative',
  health: 20,
  hunger: 20,
  air: 15,
};
const stored = () => metaRecord(sample);
/** A save from before spec 24: a hotbar of names and no inventory or items. */
const legacy = (hotbar: unknown) => {
  const { inventory: _inventory, items: _items, ...rest } = stored();
  return { ...rest, hotbar };
};
const hotbarStates = (meta: WorldMeta | null) => meta!.inventory.slice(0, 9).map((s) => s?.state);

describe('save meta', () => {
  it('round trips, with the inventory and items stored by name', () => {
    expect(stored().inventory[0]).toEqual({ name: 'brick', count: 64 });
    expect(stored().inventory[20]).toEqual({ name: 'glass', count: 1 });
    expect(stored().items).toEqual([{ name: 'stone', count: 1, x: 3.5, y: 40, z: 2.25 }]);
    expect(parseMeta(stored())).toEqual(sample);
    expect(parseMeta(JSON.stringify(stored()))).toEqual(sample);
  });
  it('rejects other versions', () => {
    for (const version of [SAVE_VERSION - 1, SAVE_VERSION + 1, 0, undefined]) expect(parseMeta({ ...stored(), version })).toBeNull();
  });
  it('loads a save from before spec 24: the hotbar gets full stacks and the grid is empty', () => {
    const nine = ['brick', 'sand', 'glowstone', 'stone', 'leaves', 'log', 'water', 'glass', 'bedrock'];
    const meta = parseMeta(legacy(nine));
    expect(hotbarStates(meta)).toEqual([
      BlockId.BRICK, BlockId.SAND, BlockId.GLOWSTONE, BlockId.STONE, BlockId.LEAVES, BlockId.LOG, BlockId.WATER, BlockId.GLASS, BlockId.BEDROCK,
    ]);
    expect(meta!.inventory[0]).toEqual({ state: BlockId.BRICK, count: STARTING_STACK });
    expect(meta!.inventory.slice(9).every((s) => s === null)).toBe(true);
    expect(meta!.items).toEqual([]);
  });
  it('repairs a bad hotbar in an old save to DEFAULT_HOTBAR and keeps the world', () => {
    const nine = ['brick', 'sand', 'glowstone', 'stone', 'leaves', 'log', 'water', 'glass', 'bedrock'];
    const bad: unknown[] = [
      undefined,
      'abc',
      nine.slice(0, 8),
      [...nine, 'stone'],
      ['air', ...nine.slice(1)],
      ['nope', ...nine.slice(1)],
      ['stone#5', ...nine.slice(1)],
      [1, ...nine.slice(1)],
    ];
    for (const hotbar of bad) {
      const meta = parseMeta(legacy(hotbar));
      expect(meta).not.toBeNull();
      expect(hotbarStates(meta)).toEqual(DEFAULT_HOTBAR);
      expect(meta!.seed).toBe(42);
      expect(meta!.player).toEqual(sample.player);
    }
  });
  it('empties a bad slot in the inventory and keeps the rest', () => {
    const broken = stored().inventory.map((s) => s) as unknown[];
    broken[0] = { name: 'nope', count: 3 };
    broken[1] = { name: 'sand', count: 0 };
    broken[2] = { name: 'stone', count: 65 };
    broken[3] = 'stone';
    const meta = parseMeta({ ...stored(), inventory: broken });
    expect(meta!.inventory.slice(0, 4)).toEqual([null, null, null, null]);
    expect(meta!.inventory[4]).toEqual({ state: BlockId.LEAVES, count: 64 });
  });
  it('drops invalid items and keeps the rest', () => {
    const items = [
      { name: 'nope', count: 1, x: 0, y: 0, z: 0 },
      { name: 'stone', count: 1, x: 'a', y: 0, z: 0 },
      { name: 'dirt', count: 2, x: 1, y: 2, z: 3 },
    ];
    expect(parseMeta({ ...stored(), items })!.items).toEqual([{ state: BlockId.DIRT, count: 2, x: 1, y: 2, z: 3 }]);
  });
  it('wraps the time of day into [0, 1) and repairs anything else', () => {
    const time = (timeOfDay: unknown) => parseMeta({ ...stored(), timeOfDay })!.timeOfDay;
    expect(time(0.6)).toBe(0.6);
    expect(time(1.25)).toBe(0.25);
    expect(time(-0.25)).toBe(0.75);
    expect(Object.is(time(1), 0)).toBe(true);
    expect(Object.is(time(-0), 0)).toBe(true);
    expect(time('noon')).toBe(START_TIME_OF_DAY);
    expect(time(null)).toBe(START_TIME_OF_DAY);
    const { timeOfDay: _omit, ...missing } = stored();
    expect(parseMeta(missing)!.timeOfDay).toBe(START_TIME_OF_DAY);
  });
  it('rejects corrupt JSON, a bad player or a bad seed', () => {
    expect(parseMeta(null)).toBeNull();
    expect(parseMeta('not json')).toBeNull();
    expect(parseMeta('{}')).toBeNull();
    expect(parseMeta({ ...stored(), player: { ...sample.player, x: 'a' } })).toBeNull();
    expect(parseMeta({ ...stored(), player: undefined })).toBeNull();
    expect(parseMeta({ ...stored(), seed: 'x' })).toBeNull();
    expect(parseMeta({ ...stored(), selectedSlot: Number.NaN })).toBeNull();
  });
});

describe('chunk records', () => {
  it('drops invalid entries, keeps the rest and counts them', () => {
    const r = parseChunkRecord({ key: '0,-1,2', edits: [[5, 'stone'], [4096, 'stone'], [7, 'nope'], [2.5, 'dirt']] });
    expect(r).not.toBeNull();
    expect([...r!.edits]).toEqual([[5, BlockId.STONE]]);
    expect(r!.dropped).toBe(3);
  });
  it('drops a record whose key is not three integers', () => {
    expect(parseChunkRecord({ key: '1,2', edits: [[5, 'stone']] })).toBeNull();
    expect(parseChunkRecord({ key: '1,2,x', edits: [] })).toBeNull();
    expect(parseChunkRecord('nope')).toBeNull();
  });
  it('readSave combines the meta and the chunks, and needs a valid meta', () => {
    const save = readSave(stored(), [
      { key: '0,0,0', edits: [[1, 'brick'], [2, 'air']] },
      { key: 'bad', edits: [] },
      { key: '3,-4,5', edits: [[4095, 'glass'], [9, 'nope']] },
    ]);
    expect(save!.meta).toEqual(sample);
    expect([...save!.edits.get('0,0,0')!]).toEqual([[1, BlockId.BRICK], [2, BlockId.AIR]]);
    expect([...save!.edits.get('3,-4,5')!]).toEqual([[4095, BlockId.GLASS]]);
    expect(save!.dropped).toBe(2);
    expect(readSave(null, [])).toBeNull();
  });
});

describe('bed respawn point (T-I9)', () => {
  it('round-trips a bed, leaves it out when unset, and drops a malformed one', () => {
    expect(parseMeta(metaRecord({ ...sample, bed: { x: 4, y: -7, z: 2 } }))?.bed).toEqual({ x: 4, y: -7, z: 2 });
    expect('bed' in metaRecord(sample)).toBe(false);
    expect(parseMeta({ ...metaRecord(sample), bed: { x: 1.5, y: 0, z: 0 } })?.bed).toBeUndefined();
  });
});
