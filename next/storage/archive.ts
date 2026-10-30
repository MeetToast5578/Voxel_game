import { parseMeta, SAVE_VERSION, type WorldStore } from './store';

/** A whole world as one JSON document, for backups and moving worlds between browsers. */
const FORMAT = 'voxel-world';

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(text: string): Uint8Array {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function exportWorld(store: WorldStore, name: string): Promise<string> {
  const meta = await store.getMeta(name);
  if (!meta) throw new Error(`No world named '${name}'`);
  const keys = await store.chunkKeys(name);
  const chunks: [number, string][] = [];
  for (const k of keys) {
    const data = await store.getChunk(name, k);
    if (data) chunks.push([k, toBase64(data)]);
  }
  const columns = [...(await store.getColumns(name))].map(([k, v]) => [k, toBase64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength))]);
  return JSON.stringify({ format: FORMAT, version: SAVE_VERSION, meta, chunks, columns });
}

/**
 * Stores a world from an exported document, under `name` (the archive's own name if omitted). Validates everything
 * before writing anything; refuses to replace an existing world.
 */
export async function importWorld(store: WorldStore, text: string, name?: string): Promise<string> {
  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error('Not a world file');
  }
  if (doc.format !== FORMAT) throw new Error('Not a world file');
  if (doc.version !== SAVE_VERSION) throw new Error(`World file version ${String(doc.version)} is not supported`);
  const meta = parseMeta(doc.meta);
  if (!meta) throw new Error('World file has an invalid meta record');
  const pairs = (v: unknown) => Array.isArray(v) && v.every((e) => Array.isArray(e) && Number.isSafeInteger(e[0]) && typeof e[1] === 'string');
  if (!pairs(doc.chunks) || !pairs(doc.columns)) throw new Error('World file has invalid chunk data');
  const target = name ?? meta.name;
  if (await store.getMeta(target)) throw new Error(`A world named '${target}' already exists`);
  let chunks: [number, Uint8Array][], columns: [number, Int32Array][];
  try {
    chunks = (doc.chunks as [number, string][]).map(([k, v]) => [k, fromBase64(v)]);
    columns = (doc.columns as [number, string][]).map(([k, v]) => {
      const bytes = fromBase64(v);
      if (bytes.length !== 256 * 4) throw new Error('bad column');
      return [k, new Int32Array(bytes.buffer)];
    });
  } catch {
    throw new Error('World file has invalid chunk data');
  }
  await store.putChunks(target, chunks);
  await store.putColumns(target, columns);
  await store.putMeta({ ...meta, name: target, revision: 0 }, 0);
  return target;
}
