import { describe, expect, it } from 'vitest';
import { exportWorldArchive, parseWorldArchive } from '../src/storage/worldArchive';
import { startingSlots } from '../src/player/inventory';
import { BlockId, slabState } from '../src/world/blocks';
import { MemoryWorldStore } from '../src/storage/worldStore';
import { readSave, type WorldMeta } from '../src/storage/save';
const meta:WorldMeta={seed:17,player:{x:-8.5,y:100,z:32,yaw:.5,pitch:-.1,flying:true},selectedSlot:4,inventory:startingSlots(),items:[],timeOfDay:.5,timeOfYear:.25,gameMode:'creative',health:20,hunger:20,air:15,gameTick:120,scheduledTicks:[{x:1,y:3,z:2,delay:4,reason:'fall'}]};
const edits=new Map([['-1,6,2',new Map([[0,slabState(BlockId.STONE,true)],[1,BlockId.AIR]])]]);
const backup=()=>exportWorldArchive(meta,edits);
describe('portable world backups',()=>{
  it('roundtrips all metadata, explicit air removals, state variants and paused ticks',()=>{
    const a=parseWorldArchive(backup()),loaded=readSave(a.meta,a.chunks)!;
    expect(loaded.meta).toEqual(meta);expect(loaded.edits).toEqual(edits);
    expect(parseWorldArchive(JSON.stringify({chunks:a.chunks,meta:a.meta,formatVersion:1,format:a.format}))).toEqual(a);
  });
  it.each(['version','unknown block','duplicate chunk','duplicate edit','unsafe coordinate','repaired inventory','bad tick'])('rejects %s without silently dropping data',kind=>{
    const a=JSON.parse(backup());
    if(kind==='version')a.meta.version=99;
    if(kind==='unknown block')a.chunks[0].edits[0][1]='unknown_block';
    if(kind==='duplicate chunk')a.chunks.push(a.chunks[0]);
    if(kind==='duplicate edit')a.chunks[0].edits.push(a.chunks[0].edits[0]);
    if(kind==='unsafe coordinate')a.chunks[0].key='999999999999999999,0,0';
    if(kind==='repaired inventory')a.meta.inventory[0].count=-4;
    if(kind==='bad tick')a.meta.scheduledTicks[0].reason='unknown';
    expect(()=>parseWorldArchive(JSON.stringify(a))).toThrow();
  });
  it('rejects invalid JSON and malformed structural fields',()=>{
    for(const value of ['{','null','[]','{}',JSON.stringify({format:'voxel-game-world',formatVersion:2})])expect(()=>parseWorldArchive(value)).toThrow();
  });
  it('replaces a save completely and preserves the old save on a failed replacement',async()=>{
    const store=new MemoryWorldStore(),a=parseWorldArchive(backup());
    await store.write(a.meta,[{key:'9,9,9',edits:[[0,'brick']]}]);const before=await store.load();
    store.failWrites=true;expect(await store.replace(a.meta,a.chunks)).toBe(false);expect(await store.load()).toEqual(before);
    store.failWrites=false;expect(await store.replace(a.meta,a.chunks)).toBe(true);expect((await store.load()).chunks).toEqual(a.chunks);
  });
});
