import { CHUNK_VOLUME } from '../config';
import { AIR, BLOCKS } from '../engine/blocks';
import { Chunk } from '../engine/chunk';

/**
 * Binary form of a saved chunk, deflated. States are stored by name, so the block table may change between versions;
 * a name that no longer exists loads as air. Light is stored too, so a reloaded chunk matches the world it was saved in.
 *
 * Layout before deflating: u8 format (1), u16 palette size, u32 name bytes, names joined by '\n' (UTF-8),
 * u8 index kind (0 uniform, 1 u8, 2 u16) and the indices, u8 light kind (0 uniform + u8 value, 1 per cell) and the light.
 */
const FORMAT = 1;

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeChunk(chunk: Chunk): Promise<Uint8Array> {
  const { palette, indices, light, uniformLight } = chunk.snapshot();
  const names = new TextEncoder().encode(palette.map((s) => BLOCKS.stateName(s)).join('\n'));
  const indexBytes = indices ? new Uint8Array(indices.buffer, indices.byteOffset, indices.byteLength) : new Uint8Array(0);
  const size = 1 + 2 + 4 + names.length + 1 + indexBytes.length + 1 + (light ? CHUNK_VOLUME : 1);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let o = 0;
  out[o++] = FORMAT;
  view.setUint16(o, palette.length, true); o += 2;
  view.setUint32(o, names.length, true); o += 4;
  out.set(names, o); o += names.length;
  out[o++] = indices === null ? 0 : indices instanceof Uint8Array ? 1 : 2;
  out.set(indexBytes, o); o += indexBytes.length;
  out[o++] = light ? 1 : 0;
  if (light) out.set(light, o);
  else out[o] = uniformLight;
  return deflate(out);
}

/** Decodes a saved chunk. Throws on anything malformed, so the caller can fall back to generating it. */
export async function decodeChunk(cx: number, cy: number, cz: number, data: Uint8Array): Promise<Chunk> {
  const bytes = await inflate(data);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 0;
  const need = (n: number) => {
    if (o + n > bytes.length) throw new Error('Truncated chunk record');
  };
  need(7);
  if (bytes[o++] !== FORMAT) throw new Error('Unknown chunk format');
  const count = view.getUint16(o, true); o += 2;
  const nameBytes = view.getUint32(o, true); o += 4;
  need(nameBytes);
  const names = new TextDecoder().decode(bytes.subarray(o, o + nameBytes)).split('\n'); o += nameBytes;
  if (names.length !== count || count === 0) throw new Error('Bad chunk palette');
  const palette = names.map((n) => BLOCKS.parseStateName(n) ?? AIR);
  need(1);
  const kind = bytes[o++]!;
  let indices: Uint8Array | Uint16Array | null = null;
  if (kind === 1 || kind === 2) {
    const len = CHUNK_VOLUME * kind;
    need(len);
    const copy = bytes.slice(o, o + len);
    indices = kind === 1 ? copy : new Uint16Array(copy.buffer);
    o += len;
  } else if (kind !== 0) throw new Error('Bad index kind');
  need(1);
  const lightKind = bytes[o++]!;
  need(lightKind === 1 ? CHUNK_VOLUME : 1);
  const light = lightKind === 1 ? bytes.slice(o, o + CHUNK_VOLUME) : null;
  const uniformLight = lightKind === 1 ? 0 : bytes[o]!;
  const chunk = new Chunk(cx, cy, cz);
  chunk.restore(palette, indices, light, uniformLight);
  chunk.modified = true;
  return chunk;
}
