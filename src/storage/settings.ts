import { DEFAULT_VIEW_CHUNKS, MAX_VIEW_CHUNKS, MIN_VIEW_CHUNKS, MOUSE_SENSITIVITY } from '../config';

export interface Settings {
  viewChunks: number;
  /** Radians per pixel of mouse movement. */
  mouseSensitivity: number;
  /** Vertical field of view in degrees. */
  fov: number;
}

const KEY = 'voxel-next-settings';
export const DEFAULT_SETTINGS: Settings = { viewChunks: DEFAULT_VIEW_CHUNKS, mouseSensitivity: MOUSE_SENSITIVITY, fov: 70 };

const clampNum = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;

/** Settings from any stored value: every field is checked and clamped, and anything unusable gets its default. */
export function parseSettings(value: unknown): Settings {
  const s = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  return {
    viewChunks: Math.round(clampNum(s.viewChunks, MIN_VIEW_CHUNKS, MAX_VIEW_CHUNKS, DEFAULT_SETTINGS.viewChunks)),
    mouseSensitivity: clampNum(s.mouseSensitivity, 0.0002, 0.02, DEFAULT_SETTINGS.mouseSensitivity),
    fov: clampNum(s.fov, 40, 110, DEFAULT_SETTINGS.fov),
  };
}

export function loadSettings(): Settings {
  try {
    return parseSettings(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage can be full or blocked (private windows); settings then last for this session only.
  }
}
