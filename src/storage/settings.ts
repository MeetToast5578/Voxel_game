import {
  DEFAULT_FOV, DEFAULT_RENDER_DISTANCE, MAX_FOV, MAX_RENDER_DISTANCE, MIN_FOV, MIN_RENDER_DISTANCE,
} from '../config';
import { clamp } from '../core/math';
import type { KeyValueStore } from './store';

export interface Settings {
  renderDistance: number; // chunks, integer
  fov: number; // degrees
  mouseSensitivity: number; // multiplier for DEFAULT_MOUSE_SENSITIVITY
  resolution: number; // share of the screen's pixel density rendered, MIN_RESOLUTION..1 (T-J7)
}

export const MIN_RESOLUTION = 0.5;

/** Quality presets (T-J7): each sets the settings that cost the most frame time. */
export const QUALITY_PRESETS = {
  Low: { renderDistance: 4, resolution: 0.5 },
  Medium: { renderDistance: 8, resolution: 0.75 },
  High: { renderDistance: 12, resolution: 1 },
} as const satisfies Record<string, Partial<Settings>>;
export type QualityPreset = keyof typeof QUALITY_PRESETS;

/** The preset the settings match, or null when they have been tuned by hand. */
export function presetOf(s: Settings): QualityPreset | null {
  const match = Object.entries(QUALITY_PRESETS).find(([, p]) => p.renderDistance === s.renderDistance && p.resolution === s.resolution);
  return match ? (match[0] as QualityPreset) : null;
}

export const MIN_SENSITIVITY = 0.25;
export const MAX_SENSITIVITY = 3;

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  renderDistance: DEFAULT_RENDER_DISTANCE,
  fov: DEFAULT_FOV,
  mouseSensitivity: 1,
  resolution: 1,
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
    resolution: num(r.resolution, DEFAULT_SETTINGS.resolution, MIN_RESOLUTION, 1),
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
