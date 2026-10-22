import { CHUNK_SIZE, WORLD_FILE_MAX_BYTES, WORLD_FILE_MAX_CHUNKS, WORLD_FILE_MAX_EDITS, WORLD_FILE_MAX_COORD } from '../config';
import { chunkRecord, metaRecord, parseChunkRecord, parseMeta, type ChunkRecord, type MetaRecord, type WorldMeta } from './save';

export interface WorldArchive { format:'voxel-game-world'; formatVersion:1; meta:MetaRecord; chunks:ChunkRecord[]; }
function equal(a:unknown,b:unknown):boolean {
  if(a===b)return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
  const expected=a as Record<string,unknown>,actual=b as Record<string,unknown>;
  const keys=Object.keys(expected);
  return keys.length===Object.keys(actual).length&&keys.every(k=>Object.hasOwn(actual,k)&&equal(expected[k],actual[k]));
}
function validate(raw:unknown): WorldArchive {
  if(!raw||typeof raw!=='object')throw Error('Not a world backup');
  const d=raw as Record<string,unknown>;
  if(d.format!=='voxel-game-world'||d.formatVersion!==1)throw Error('Unsupported world backup format');
  const meta=parseMeta(d.meta);
  if(!meta||!equal(metaRecord(meta),d.meta))throw Error('World metadata is invalid or contains unsupported states');
  if(!Number.isSafeInteger(meta.seed)||Object.values(meta.player).some(v=>typeof v==='number'&&Math.abs(v)>WORLD_FILE_MAX_COORD))throw Error('World coordinates or seed are outside supported bounds');
  if(meta.scheduledTicks?.some(t=>[t.x,t.y,t.z].some(v=>Math.abs(v)>WORLD_FILE_MAX_COORD)))throw Error('Scheduled update coordinates are outside supported bounds');
  if(meta.items.some(i=>[i.x,i.y,i.z].some(v=>Math.abs(v)>WORLD_FILE_MAX_COORD)))throw Error('Item coordinates are outside supported bounds');
  if(!Array.isArray(d.chunks)||d.chunks.length>WORLD_FILE_MAX_CHUNKS)throw Error('Invalid or oversized chunk list');
  const keys=new Set<string>(),chunks:ChunkRecord[]=[];
  let entries=0;
  for(const rawChunk of d.chunks) {
    const c=parseChunkRecord(rawChunk);
    if(!c||c.dropped)throw Error('A chunk contains invalid edits or unknown blocks');
    const coords=c.key.split(',').map(Number);
    if(coords.some(n=>!Number.isSafeInteger(n)||Math.abs(n*CHUNK_SIZE)>WORLD_FILE_MAX_COORD)||coords.join(',')!==c.key||keys.has(c.key))throw Error('Duplicate or invalid chunk coordinates');
    const normalized=chunkRecord(c.key,c.edits);
    if(!equal(normalized,rawChunk))throw Error('A chunk contains duplicate or malformed edits');
    entries+=c.edits.size;if(entries>WORLD_FILE_MAX_EDITS)throw Error('Too many edited blocks in world backup');
    keys.add(c.key);chunks.push(normalized);
  }
  return {format:'voxel-game-world',formatVersion:1,meta:metaRecord(meta),chunks};
}
/** Strict external-file validation: fail instead of silently repairing/dropping a user's blocks. */
export function parseWorldArchive(text:string):WorldArchive {
  if(text.length>WORLD_FILE_MAX_BYTES||new TextEncoder().encode(text).byteLength>WORLD_FILE_MAX_BYTES)throw Error('World backup is too large');
  let raw:unknown;try{raw=JSON.parse(text);}catch{throw Error('World backup is not valid JSON');}
  return validate(raw);
}
/** Snapshot live edits, including unloaded columns and explicit air removals. No generated terrain is serialized. */
export function exportWorldArchive(meta:WorldMeta,edits:ReadonlyMap<string,ReadonlyMap<number,number>>):string {
  if(edits.size>WORLD_FILE_MAX_CHUNKS || [...edits.values()].reduce((n,c)=>n+c.size,0)>WORLD_FILE_MAX_EDITS)throw Error('World backup exceeds the supported edit limit');
  const chunks=[...edits].map(([key,entries])=>chunkRecord(key,entries));
  const value=validate({format:'voxel-game-world',formatVersion:1,meta:metaRecord(meta),chunks});
  const text=JSON.stringify(value);
  if(new TextEncoder().encode(text).byteLength>WORLD_FILE_MAX_BYTES)throw Error('World backup is too large');
  return text;
}
