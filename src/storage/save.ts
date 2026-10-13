import { CHUNK_VOLUME, HOTBAR_SIZE, START_TIME_OF_DAY } from '../config';
import { DEFAULT_HOTBAR } from '../player/hotbar';
import { BlockId, blockStateName, parseBlockStateName } from '../world/blocks';

export const SAVE_VERSION = 2;

export interface SavedPlayer {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  flying: boolean;
}

/** The world meta as the game uses it: the hotbar holds block states. */
export interface WorldMeta {
  seed: number;
  player: SavedPlayer;
  selectedSlot: number;
  /** HOTBAR_SIZE block states. */
  hotbar: number[];
  /** 0..1, wraps. */
  timeOfDay: number;
}

/** The stored form of the meta: block states are saved by name, so new block types never shift a save. */
export interface MetaRecord {
  version: typeof SAVE_VERSION;
  seed: number;
  player: SavedPlayer;
  selectedSlot: number;
  hotbar: string[];
  timeOfDay: number;
}

/** One chunk's player edits: chunk key "cx,cy,cz" and [localIndex 0..4095, state name] pairs. */
export interface ChunkRecord {
  key: string;
  edits: [number, string][];
}

export interface ParsedChunkRecord {
  key: string;
  /** localIndex -> block state */
  edits: Map<number, number>;
  /** Entries dropped because their index or state name was invalid. */
  dropped: number;
}

export function metaRecord(meta: WorldMeta): MetaRecord {
  return {
    version: SAVE_VERSION,
    seed: meta.seed,
    player: { ...meta.player },
    selectedSlot: meta.selectedSlot,
    hotbar: meta.hotbar.map((state) => blockStateName(state)),
    timeOfDay: meta.timeOfDay,
  };
}

export function chunkRecord(key: string, edits: ReadonlyMap<number, number>): ChunkRecord {
  return { key, edits: [...edits].map(([index, state]) => [index, blockStateName(state)]) };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Wraps a time of day into [0, 1); anything that is not a finite number becomes START_TIME_OF_DAY. Never -0. */
export function repairTimeOfDay(t: unknown): number {
  if (!isNum(t)) return START_TIME_OF_DAY;
  const wrapped = t - Math.floor(t) + 0; // + 0 turns -0 into +0
  return wrapped >= 1 ? 0 : wrapped;
}

/** HOTBAR_SIZE names of registered states other than air, as states; otherwise a copy of DEFAULT_HOTBAR. */
export function repairHotbar(hotbar: unknown): number[] {
  if (!Array.isArray(hotbar) || hotbar.length !== HOTBAR_SIZE) return [...DEFAULT_HOTBAR];
  const states: number[] = [];
  for (const name of hotbar) {
    const state = typeof name === 'string' ? parseBlockStateName(name) : null;
    if (state === null || state === BlockId.AIR) return [...DEFAULT_HOTBAR];
    states.push(state);
  }
  return states;
}

/**
 * Parses a stored meta (an object, or its JSON text). Returns null when it is missing, corrupt or of another
 * version, or when the seed, player or selected slot is invalid. The hotbar and time of day are repaired, never
 * rejected: a bad value there must not throw away a world. Never throws.
 */
export function parseMeta(raw: unknown): WorldMeta | null {
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof value !== 'object' || value === null) return null;
  const d = value as Partial<Record<keyof MetaRecord, unknown>>;
  const p = d.player as Partial<Record<keyof SavedPlayer, unknown>> | undefined;
  if (d.version !== SAVE_VERSION || !isNum(d.seed) || !isNum(d.selectedSlot)) return null;
  if (typeof p !== 'object' || p === null) return null;
  if (!isNum(p.x) || !isNum(p.y) || !isNum(p.z) || !isNum(p.yaw) || !isNum(p.pitch) || typeof p.flying !== 'boolean') return null;
  return {
    seed: d.seed,
    player: { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, flying: p.flying },
    selectedSlot: d.selectedSlot,
    hotbar: repairHotbar(d.hotbar),
    timeOfDay: repairTimeOfDay(d.timeOfDay),
  };
}

const CHUNK_KEY = /^-?\d+,-?\d+,-?\d+$/;

/**
 * Parses a stored chunk record. Returns null (the whole record is dropped) when it is not an object or its key is
 * not three integers. Invalid entries (index not an integer 0..4095, unknown state name) are dropped and counted.
 * Never throws.
 */
export function parseChunkRecord(raw: unknown): ParsedChunkRecord | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Partial<Record<keyof ChunkRecord, unknown>>;
  if (typeof r.key !== 'string' || !CHUNK_KEY.test(r.key)) return null;
  const edits = new Map<number, number>();
  let dropped = 0;
  for (const entry of Array.isArray(r.edits) ? (r.edits as unknown[]) : []) {
    const [index, name] = Array.isArray(entry) ? (entry as unknown[]) : [];
    const state = typeof name === 'string' ? parseBlockStateName(name) : null;
    if (!Number.isInteger(index) || (index as number) < 0 || (index as number) >= CHUNK_VOLUME || state === null) {
      dropped++;
      continue;
    }
    edits.set(index as number, state);
  }
  return { key: r.key, edits, dropped };
}

/** A save ready for the game: the meta plus every chunk's edits as block states. */
export interface LoadedSave {
  meta: WorldMeta;
  /** chunk key -> (localIndex -> block state) */
  edits: Map<string, Map<number, number>>;
  /** Chunk entries dropped as invalid, plus whole records dropped for a bad key (for one warning). */
  dropped: number;
}

/** Turns stored records into a LoadedSave; null when there is no valid meta (no save, or an unusable one). */
export function readSave(meta: unknown, chunks: readonly unknown[]): LoadedSave | null {
  const parsed = parseMeta(meta);
  if (!parsed) return null;
  const edits = new Map<string, Map<number, number>>();
  let dropped = 0;
  for (const raw of chunks) {
    const record = parseChunkRecord(raw);
    if (!record) {
      dropped++;
      continue;
    }
    dropped += record.dropped;
    if (record.edits.size > 0) edits.set(record.key, record.edits);
  }
  return { meta: parsed, edits, dropped };
}
