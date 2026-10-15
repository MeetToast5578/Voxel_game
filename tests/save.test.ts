import { describe, expect, it } from 'vitest';
import { START_TIME_OF_DAY } from '../src/config';
import { DEFAULT_HOTBAR } from '../src/player/hotbar';
import { metaRecord, parseChunkRecord, parseMeta, readSave, SAVE_VERSION, type WorldMeta } from '../src/storage/save';
import { BlockId } from '../src/world/blocks';

const sample: WorldMeta = {
  seed: 42,
  selectedSlot: 3,
  player: { x: 1.5, y: 60, z: -3.25, yaw: 0.5, pitch: -0.2, flying: false },
  hotbar: [BlockId.BRICK, BlockId.SAND, BlockId.GLOWSTONE, BlockId.STONE, BlockId.LEAVES, BlockId.LOG, BlockId.WATER, BlockId.GLASS, BlockId.BEDROCK],
  timeOfDay: 0.6,
};
const stored = () => metaRecord(sample);

describe('save meta', () => {
  it('round trips, with the hotbar stored by name', () => {
    expect(stored().hotbar).toEqual(['brick', 'sand', 'glowstone', 'stone', 'leaves', 'log', 'water', 'glass', 'bedrock']);
    expect(parseMeta(stored())).toEqual(sample);
    expect(parseMeta(JSON.stringify(stored()))).toEqual(sample);
  });
  it('rejects other versions', () => {
    for (const version of [SAVE_VERSION - 1, SAVE_VERSION + 1, 0, undefined]) expect(parseMeta({ ...stored(), version })).toBeNull();
  });
  it('repairs a bad hotbar to DEFAULT_HOTBAR and keeps the world', () => {
    const nine = stored().hotbar;
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
      const meta = parseMeta({ ...stored(), hotbar });
      expect(meta).not.toBeNull();
      expect(meta!.hotbar).toEqual(DEFAULT_HOTBAR);
      expect(meta!.hotbar).not.toBe(DEFAULT_HOTBAR); // a copy
      expect(meta!.seed).toBe(42);
      expect(meta!.player).toEqual(sample.player);
    }
  });
  it('keeps a valid hotbar as it is', () => {
    const hotbar = ['stone', 'glowstone', 'bedrock', 'stone', 'glowstone', 'bedrock', 'stone', 'glowstone', 'bedrock'];
    expect(parseMeta({ ...stored(), hotbar })!.hotbar).toEqual(
      hotbar.map((n) => ({ stone: BlockId.STONE, glowstone: BlockId.GLOWSTONE, bedrock: BlockId.BEDROCK })[n]),
    );
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
