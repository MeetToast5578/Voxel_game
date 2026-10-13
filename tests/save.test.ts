import { describe, expect, it } from 'vitest';
import { editsToRecord, loadSave, parseSave, recordToEdits, writeSave, type SaveData } from '../src/storage/save';
import { MemoryStore } from '../src/storage/store';
import { SAVE_KEY } from '../src/config';

const sample: SaveData = {
  version: 2,
  seed: 42,
  selectedSlot: 3,
  player: { x: 1.5, y: 60, z: -3.25, yaw: 0.5, pitch: -0.2, flying: false },
  edits: { '0,0,0': [[123, 5], [456, 0]], '-1,-3,2': [[4095, 9]] },
};

describe('save', () => {
  it('round trips', () => {
    const store = new MemoryStore();
    expect(writeSave(store, 'k', sample)).toBe(true);
    expect(loadSave(store, 'k')).toEqual(sample);
  });
  it('converts edits between Map and JSON-friendly record', () => {
    const map = recordToEdits(sample.edits);
    expect(map.get('0,0,0')!.get(456)).toBe(0);
    expect(editsToRecord(map)).toEqual(sample.edits);
  });
  it('rejects missing, corrupt or wrong-version data', () => {
    expect(parseSave(null)).toBeNull();
    expect(parseSave('not json')).toBeNull();
    expect(parseSave('{}')).toBeNull();
    expect(parseSave(JSON.stringify({ ...sample, version: 1 }))).toBeNull(); // 128-high column saves
    expect(parseSave(JSON.stringify({ ...sample, version: 3 }))).toBeNull();
    expect(parseSave(JSON.stringify({ ...sample, player: { ...sample.player, x: 'a' } }))).toBeNull();
    expect(parseSave(JSON.stringify({ ...sample, edits: { '0,0,0': [[1]] } }))).toBeNull();
  });
  it('uses a new key, so v1 saves are neither loaded nor overwritten', () => {
    expect(SAVE_KEY).toBe('voxel-game-save-v2');
  });
  it('writeSave returns false when storage throws', () => {
    const broken = new MemoryStore();
    broken.setItem = () => {
      throw new Error('quota');
    };
    expect(writeSave(broken, 'k', sample)).toBe(false);
  });
});
