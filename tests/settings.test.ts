import { describe, expect, it } from 'vitest';
import { DEFAULT_FOV, MAX_RENDER_DISTANCE } from '../src/config';
import { DEFAULT_SETTINGS, MIN_RESOLUTION, QUALITY_PRESETS, loadSettings, presetOf, sanitizeSettings, saveSettings } from '../src/storage/settings';
import { MemoryStore } from '../src/storage/store';

describe('settings', () => {
  it('fills defaults and clamps', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ renderDistance: 99, fov: 'x', mouseSensitivity: 0 })).toEqual({
      renderDistance: MAX_RENDER_DISTANCE,
      fov: DEFAULT_FOV,
      mouseSensitivity: 0.25,
      resolution: 1,
    });
    expect(sanitizeSettings({ resolution: 0.1 }).resolution).toBe(MIN_RESOLUTION);
    expect(sanitizeSettings({ renderDistance: 4.6 }).renderDistance).toBe(5);
  });
  it('round trips through a store and survives garbage', () => {
    const store = new MemoryStore();
    saveSettings(store, 'k', { renderDistance: 4, fov: 90, mouseSensitivity: 2, resolution: 0.75 });
    expect(loadSettings(store, 'k')).toEqual({ renderDistance: 4, fov: 90, mouseSensitivity: 2, resolution: 0.75 });
    store.setItem('k', '{broken');
    expect(loadSettings(store, 'k')).toEqual(DEFAULT_SETTINGS);
  });
});

describe('quality presets (T-J7)', () => {
  it('each preset is recognised once applied, and hand-tuned settings match none', () => {
    for (const [name, preset] of Object.entries(QUALITY_PRESETS)) expect(presetOf({ ...DEFAULT_SETTINGS, ...preset })).toBe(name);
    expect(presetOf({ ...DEFAULT_SETTINGS, renderDistance: 5 })).toBeNull();
    expect(QUALITY_PRESETS.Low.renderDistance).toBeLessThan(QUALITY_PRESETS.High.renderDistance);
  });
});

describe('MemoryStore', () => {
  it('gets, sets and removes', () => {
    const store = new MemoryStore();
    expect(store.getItem('a')).toBeNull();
    store.setItem('a', '1');
    expect(store.getItem('a')).toBe('1');
    store.removeItem('a');
    expect(store.getItem('a')).toBeNull();
  });
});
