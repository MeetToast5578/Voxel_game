import {
  DEFAULT_FOV, DEFAULT_RENDER_DISTANCE, MAX_FOV, MAX_RENDER_DISTANCE, MIN_FOV, MIN_RENDER_DISTANCE,
} from '../config';
import { clamp } from '../core/math';
import type { KeyValueStore } from './store';

export interface Settings {
  renderDistance: number; // chunks, integer
  fov: number; // degrees
  mouseSensitivity: number; // multiplier for DEFAULT_MOUSE_SENSITIVITY
}

export const MIN_SENSITIVITY = 0.25;
export const MAX_SENSITIVITY = 3;

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  renderDistance: DEFAULT_RENDER_DISTANCE,
  fov: DEFAULT_FOV,
  mouseSensitivity: 1,
};

/** Turns anything (parsed JSON, garbage, null) into valid settings: clamps numbers, fills defaults. */
export function sanitizeSettings(raw: unknown): Settings {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown, fallback: number, min: number, max: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? clamp(v, min, max) : fallback;
  return {
    renderDistance: Math.round(num(r.renderDistance, DEFAULT_SETTINGS.renderDistance, MIN_RENDER_DISTANCE, MAX_RENDER_DISTANCE)),
    fov: num(r.fov, DEFAULT_SETTINGS.fov, MIN_FOV, MAX_FOV),
    mouseSensitivity: num(r.mouseSensitivity, DEFAULT_SETTINGS.mouseSensitivity, MIN_SENSITIVITY, MAX_SENSITIVITY),
  };
}

export function loadSettings(store: KeyValueStore, key: string): Settings {
  try {
    const text = store.getItem(key);
    return sanitizeSettings(text ? JSON.parse(text) : null);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(store: KeyValueStore, key: string, settings: Settings): void {
  try {
    store.setItem(key, JSON.stringify(settings));
  } catch {
    // Quota exceeded or storage disabled: settings just won't persist.
  }
}
