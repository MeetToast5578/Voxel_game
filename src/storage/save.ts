import { CHUNK_VOLUME, GAME_MODE_CREATIVE, GAME_MODE_SURVIVAL, HEALTH_MAX, HUNGER_MAX, HOTBAR_SIZE, INVENTORY_SIZE, MAX_ITEMS, MAX_STACK, START_TIME_OF_DAY, STARTING_STACK, AIR_MAX_S } from '../config';
import type { PendingTick } from '../world/tick';
import type { DroppedItem } from '../items/itemEntities';
import { DEFAULT_HOTBAR, type ItemStack } from '../player/inventory';
import { BlockId, blockStateName, parseBlockStateName } from '../world/blocks';

export const SAVE_VERSION = 3; // 3: block coordinates at 0.3 m; older saves are not loaded

export interface SavedPlayer {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  flying: boolean;
}

/** The world meta as the game uses it: block states, not names. */
export interface WorldMeta {
  seed: number;
  /** Optional for compatibility with saves made before scheduled update persistence. */
  scheduledTicks?: PendingTick[];
  gameTick?: number;
  player: SavedPlayer;
  selectedSlot: number;
  /** INVENTORY_SIZE slots: the hotbar first, then the grid. */
  inventory: (ItemStack | null)[];
  /** Items lying on the ground. */
  items: DroppedItem[];
  /** 0..1, wraps. */
  timeOfDay: number;
  /** 0..1, wraps. 0 = spring equinox. */
  timeOfYear: number;
  /** Game mode: 'survival' or 'creative'. */
  gameMode: string;
  /** Player health, 0..HEALTH_MAX. */
  health: number;
  /** Player hunger, 0..HUNGER_MAX. */
  hunger: number;
  /** Seconds of air remaining, 0..AIR_MAX_S. */
  air: number;
}

/** A stack as stored: the block's name and the count. */
export interface StoredStack {
  name: string;
  count: number;
}

/** The stored form of the meta: block states are saved by name, so new block types never shift a save. */
export interface MetaRecord {
  version: typeof SAVE_VERSION;
  seed: number;
  /** Optional for compatibility with saves made before scheduled update persistence. */
  scheduledTicks?: PendingTick[];
  gameTick?: number;
  player: SavedPlayer;
  selectedSlot: number;
  inventory: (StoredStack | null)[];
  items: (StoredStack & { x: number; y: number; z: number })[];
  timeOfDay: number;
  timeOfYear: number;
  gameMode: string;
  health: number;
  hunger: number;
  air: number;
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
    scheduledTicks: meta.scheduledTicks?.map(t => ({ ...t })) ?? [],
    gameTick: meta.gameTick ?? 0,
    player: { ...meta.player },
    selectedSlot: meta.selectedSlot,
    inventory: meta.inventory.map((s) => (s ? { name: blockStateName(s.state), count: s.count } : null)),
    items: meta.items.map((i) => ({ name: blockStateName(i.state), count: i.count, x: i.x, y: i.y, z: i.z })),
    timeOfDay: meta.timeOfDay,
    timeOfYear: meta.timeOfYear,
    gameMode: meta.gameMode,
    health: meta.health,
    hunger: meta.hunger,
    air: meta.air,
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

/** A stored stack as a stack, or null when the name, the count or the shape is not valid. */
function parseStack(raw: unknown): ItemStack | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Partial<Record<keyof StoredStack, unknown>>;
  const state = typeof r.name === 'string' ? parseBlockStateName(r.name) : null;
  if (state === null || state === BlockId.AIR) return null;
  if (!Number.isInteger(r.count) || (r.count as number) < 1 || (r.count as number) > MAX_STACK) return null;
  return { state, count: r.count as number };
}

/**
 * The inventory from a save. A save from before spec 24 has only a hotbar: its nine blocks get full stacks, and the
 * grid is empty. Invalid slots are emptied, never rejected. Never throws.
 */
export function repairInventory(inventory: unknown, hotbar: unknown): (ItemStack | null)[] {
  if (Array.isArray(inventory) && inventory.length === INVENTORY_SIZE) return inventory.map((s) => parseStack(s));
  const slots: (ItemStack | null)[] = new Array(INVENTORY_SIZE).fill(null);
  repairHotbar(hotbar).forEach((state, i) => {
    slots[i] = { state, count: STARTING_STACK };
  });
  return slots;
}

/** Dropped items from a save; invalid ones are dropped, and only the newest MAX_ITEMS are kept. Never throws. */
export function repairItems(items: unknown): DroppedItem[] {
  if (!Array.isArray(items)) return [];
  const out: DroppedItem[] = [];
  for (const raw of items) {
    const stack = parseStack(raw);
    const d = raw as Partial<Record<'x' | 'y' | 'z', unknown>>;
    if (!stack || !isNum(d.x) || !isNum(d.y) || !isNum(d.z)) continue;
    out.push({ state: stack.state, count: stack.count, x: d.x, y: d.y, z: d.z });
  }
  return out.slice(-MAX_ITEMS);
}

const TICK_REASONS = new Set(['fall', 'flow', 'support', 'leaf-decay', 'grass-spread']);
/** Malformed scheduled work is dropped without rejecting a usable world. */
export function repairTicks(raw: unknown): PendingTick[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap(value => {
    if (!value || typeof value !== 'object') return [];
    const t = value as Partial<PendingTick>;
    if (![t.x, t.y, t.z, t.delay].every(Number.isSafeInteger) || t.delay! < 0 ||
        typeof t.reason !== 'string' || !TICK_REASONS.has(t.reason)) return [];
    return [{ x: t.x!, y: t.y!, z: t.z!, delay: t.delay!, reason: t.reason }];
  });
}

/**
 * Parses a stored meta (an object, or its JSON text). Returns null when it is missing, corrupt or of another
 * version, or when the seed, player or selected slot is invalid. The inventory, items and time of day are repaired,
 * never rejected: a bad value there must not throw away a world. Never throws.
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
  const d = value as Record<string, unknown>;
  const p = d.player as Partial<Record<keyof SavedPlayer, unknown>> | undefined;
  if (d.version !== SAVE_VERSION || !isNum(d.seed) || !isNum(d.selectedSlot)) return null;
  if (typeof p !== 'object' || p === null) return null;
  if (!isNum(p.x) || !isNum(p.y) || !isNum(p.z) || !isNum(p.yaw) || !isNum(p.pitch) || typeof p.flying !== 'boolean') return null;
  return {
    seed: d.seed,
    scheduledTicks: repairTicks(d.scheduledTicks),
    gameTick: Number.isSafeInteger(d.gameTick) && (d.gameTick as number) >= 0 ? d.gameTick as number : 0,
    player: { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, flying: p.flying },
    selectedSlot: d.selectedSlot,
    inventory: repairInventory(d.inventory, d.hotbar),
    items: repairItems(d.items),
    timeOfDay: repairTimeOfDay(d.timeOfDay),
    timeOfYear: repairTimeOfDay(d.timeOfYear ?? 0),
    gameMode: typeof d.gameMode === 'string' && (d.gameMode === GAME_MODE_SURVIVAL || d.gameMode === GAME_MODE_CREATIVE)
      ? d.gameMode
      : GAME_MODE_CREATIVE,
    health: isNum(d.health) ? Math.max(0, Math.min(HEALTH_MAX, d.health)) : HEALTH_MAX,
    hunger: isNum(d.hunger) ? Math.max(0, Math.min(HUNGER_MAX, d.hunger)) : HUNGER_MAX,
    air: isNum(d.air) ? Math.max(0, Math.min(AIR_MAX_S, d.air)) : AIR_MAX_S,
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
