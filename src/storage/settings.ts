import { DEFAULT_VIEW_CHUNKS, MAX_VIEW_CHUNKS, MIN_VIEW_CHUNKS, MOUSE_SENSITIVITY } from '../config';

/** Keys that can be rebound, with what they do. */
export const BINDINGS = {
  forward: 'Forward', back: 'Back', left: 'Left', right: 'Right', jump: 'Jump / up', descend: 'Down (flying) / crouch',
  sprint: 'Sprint', inventory: 'Inventory', drop: 'Throw item', fly: 'Fly (creative)', hint: 'Hide hint', time: 'Skip an hour',
  fill: 'Fill box (creative)', clear: 'Clear box (creative)', viewUp: 'View distance +', viewDown: 'View distance −', debug: 'Debug text',
} as const;
export type Binding = keyof typeof BINDINGS;

export const DEFAULT_KEYS: Readonly<Record<Binding, string>> = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', descend: 'ShiftLeft', sprint: 'ControlLeft',
  inventory: 'KeyE', drop: 'KeyQ', fly: 'KeyF', hint: 'KeyH', time: 'KeyT', fill: 'KeyB', clear: 'KeyG', viewUp: 'Equal',
  viewDown: 'Minus', debug: 'F3',
};

export interface Settings {
  viewChunks: number;
  /** Radians per pixel of mouse movement. */
  mouseSensitivity: number;
  /** Vertical field of view in degrees. */
  fov: number;
  /** Sound effects volume, 0..1. */
  effectsVolume: number;
  invertY: boolean;
  /** Size of the menus and HUD, 0.75..1.5. */
  guiScale: number;
  /** First-steps hints in survival. */
  hints: boolean;
  /** KeyboardEvent.code per binding. */
  keys: Record<Binding, string>;
}

const KEY = 'voxel-next-settings';
export const DEFAULT_SETTINGS: Settings = {
  viewChunks: DEFAULT_VIEW_CHUNKS, mouseSensitivity: MOUSE_SENSITIVITY, fov: 70, effectsVolume: 1, invertY: false, guiScale: 1,
  hints: true, keys: { ...DEFAULT_KEYS },
};

const clampNum = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;

/** Settings from any stored value: every field is checked and clamped, and anything unusable gets its default. */
export function parseSettings(value: unknown): Settings {
  const s = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const keys = (typeof s.keys === 'object' && s.keys !== null ? s.keys : {}) as Record<string, unknown>;
  const code = (v: unknown, fallback: string) => (typeof v === 'string' && /^[A-Za-z0-9]{1,24}$/.test(v) ? v : fallback);
  return {
    viewChunks: Math.round(clampNum(s.viewChunks, MIN_VIEW_CHUNKS, MAX_VIEW_CHUNKS, DEFAULT_SETTINGS.viewChunks)),
    mouseSensitivity: clampNum(s.mouseSensitivity, 0.0002, 0.02, DEFAULT_SETTINGS.mouseSensitivity),
    fov: clampNum(s.fov, 40, 110, DEFAULT_SETTINGS.fov),
    effectsVolume: clampNum(s.effectsVolume, 0, 1, DEFAULT_SETTINGS.effectsVolume),
    invertY: typeof s.invertY === 'boolean' ? s.invertY : DEFAULT_SETTINGS.invertY,
    guiScale: clampNum(s.guiScale, 0.75, 1.5, DEFAULT_SETTINGS.guiScale),
    hints: typeof s.hints === 'boolean' ? s.hints : DEFAULT_SETTINGS.hints,
    keys: Object.fromEntries((Object.keys(DEFAULT_KEYS) as Binding[]).map((b) => [b, code(keys[b], DEFAULT_KEYS[b])])) as Record<Binding, string>,
  };
}

export function loadSettings(): Settings {
  try {
    return parseSettings(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return parseSettings(null);
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage can be full or blocked (private windows); settings then last for this session only.
  }
}

/** A key code as a short label: 'KeyW' → 'W', 'Digit1' → '1', 'ShiftLeft' → 'Shift'. */
export function keyLabel(code: string): string {
  return code.replace(/^Key|^Digit/, '').replace(/(Left|Right)$/, '').replace(/^Equal$/, '=').replace(/^Minus$/, '−') || code;
}
