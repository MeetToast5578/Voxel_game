import { describe, expect, it } from 'vitest';
import { DEFAULT_FOV, MAX_RENDER_DISTANCE } from '../src/config';
import { DEFAULT_SETTINGS, loadSettings, sanitizeSettings, saveSettings } from '../src/storage/settings';
import { MemoryStore } from '../src/storage/store';

describe('settings', () => {
  it('fills defaults and clamps', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ renderDistance: 99, fov: 'x', mouseSensitivity: 0 })).toEqual({
      renderDistance: MAX_RENDER_DISTANCE,
      fov: DEFAULT_FOV,
      mouseSensitivity: 0.25,
    });
    expect(sanitizeSettings({ renderDistance: 4.6 }).renderDistance).toBe(5);
  });
  it('round trips through a store and survives garbage', () => {
    const store = new MemoryStore();
    saveSettings(store, 'k', { renderDistance: 4, fov: 90, mouseSensitivity: 2 });
    expect(loadSettings(store, 'k')).toEqual({ renderDistance: 4, fov: 90, mouseSensitivity: 2 });
    store.setItem('k', '{broken');
    expect(loadSettings(store, 'k')).toEqual(DEFAULT_SETTINGS);
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
