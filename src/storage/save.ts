import type { KeyValueStore } from './store';

export const SAVE_VERSION = 2;

export interface SavedPlayer {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  flying: boolean;
}

export interface SaveData {
  version: typeof SAVE_VERSION;
  seed: number;
  player: SavedPlayer;
  selectedSlot: number;
  /** chunkKey "cx,cy,cz" -> list of [localIndex 0..4095, block state] */
  edits: Record<string, [number, number][]>;
}

export function editsToRecord(edits: ReadonlyMap<string, ReadonlyMap<number, number>>): SaveData['edits'] {
  const out: SaveData['edits'] = {};
  for (const [key, chunkEdits] of edits) {
    if (chunkEdits.size > 0) out[key] = [...chunkEdits.entries()];
  }
  return out;
}

export function recordToEdits(record: SaveData['edits']): Map<string, Map<number, number>> {
  const out = new Map<string, Map<number, number>>();
  for (const [key, list] of Object.entries(record)) out.set(key, new Map(list));
  return out;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Returns null when the data is missing, corrupt, or from another version. Never throws. */
export function parseSave(json: string | null): SaveData | null {
  if (!json) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const d = raw as Partial<SaveData>;
  const p = d.player as Partial<SavedPlayer> | undefined;
  if (d.version !== SAVE_VERSION || !isNum(d.seed) || !isNum(d.selectedSlot)) return null;
  if (!p || !isNum(p.x) || !isNum(p.y) || !isNum(p.z) || !isNum(p.yaw) || !isNum(p.pitch) || typeof p.flying !== 'boolean') return null;
  if (typeof d.edits !== 'object' || d.edits === null) return null;
  for (const list of Object.values(d.edits)) {
    if (!Array.isArray(list)) return null;
    for (const e of list) if (!Array.isArray(e) || e.length !== 2 || !isNum(e[0]) || !isNum(e[1])) return null;
  }
  return d as SaveData;
}

export function loadSave(store: KeyValueStore, key: string): SaveData | null {
  try {
    return parseSave(store.getItem(key));
  } catch {
    return null; // storage can throw (privacy mode)
  }
}

/** Returns false if writing failed (e.g. quota exceeded). */
export function writeSave(store: KeyValueStore, key: string, data: SaveData): boolean {
  try {
    store.setItem(key, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
