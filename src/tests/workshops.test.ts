import {describe,it,expect} from 'vitest';
import {BLOCKS,WOOD_SPECIES} from '../engine/blocks';
import {Inventory} from '../game/inventory';
import {trade,forge,Decorations,cleanSign} from '../game/workshops';
import {breakSeconds,dropsOf} from '../game/mining';
import {craftResult} from '../game/crafting';
import {Chunk} from '../engine/chunk';
import {encodeChunk,decodeChunk} from '../storage/chunkCodec';
import {MAX_MOB_PARTS,mobRig,poseMobPart} from '../render/mobModels';
import {SPECIES} from '../creatures/species';
import {treeCells} from '../worldgen/trees';
const S=(key:string,v=0)=>BLOCKS.state(key,v);

describe('trading and forge',()=>{
 it('exchanges both directions and never consumes payment on a failed/full exchange',()=>{
  const inv=new Inventory();inv.add({state:S('wheat'),count:8});expect(trade(inv,0)).toBe(true);
  expect(inv.count(S('wheat'))).toBe(0);expect(inv.count(S('trade_coin'))).toBe(1);
  expect(trade(inv,0)).toBe(false);
  inv.clear();inv.slots.fill(null);for(let i=0;i<36;i++)inv.slots[i]={state:S('dirt'),count:64};
  inv.slots[0]={state:S('trade_coin'),count:64};const before=inv.save();
  expect(trade(inv,3)).toBe(false);expect(inv.save()).toEqual(before);
  inv.slots[35]=null;expect(trade(inv,3)).toBe(true);expect(inv.count(S('trade_coin'))).toBe(62);expect(inv.count(S('wheat'))).toBe(6);
 });
 it('upgrades equipment, charges increasing costs, changes mining speed and persists the upgrade',()=>{
  const inv=new Inventory();inv.slots[0]={state:S('iron_pickaxe'),count:1,wear:20};
  const plain=breakSeconds(S('stone'),inv.slots[0]);const before=inv.save();expect(forge(inv,0)).toBe(false);expect(inv.save()).toEqual(before);
  inv.add({state:S('ember_crystal'),count:30});inv.add({state:S('iron_ingot'),count:10});
  for(let i=1;i<=3;i++){expect(forge(inv,0)).toBe(true);expect(inv.slots[0]!.upgrade).toBe(i);}
  expect(inv.count(S('ember_crystal'))).toBe(12);expect(inv.count(S('iron_ingot'))).toBe(4);expect(forge(inv,0)).toBe(false);
  expect(breakSeconds(S('stone'),inv.slots[0])).toBeLessThan(plain);
  const restored=new Inventory();restored.load(JSON.parse(JSON.stringify(inv.save())));expect(restored.slots[0]).toEqual(inv.slots[0]);
 });
 it('keeps sign text and frame contents through reload and returns framed items without duplication',()=>{
  const d=new Decorations(),inv=new Inventory();inv.slots[0]={state:S('diamond_pickaxe'),count:1,wear:13,upgrade:2};
  d.setSign('1,2,3','Home\nEmber trail');expect(d.frame(inv,'2,2,3',0)).toBe(true);expect(inv.slots[0]).toBeNull();
  const back=new Decorations();back.load(JSON.parse(JSON.stringify(d.save())));
  expect(back.signs.get('1,2,3')).toBe('Home\nEmber trail');expect(back.frames.get('2,2,3')?.upgrade).toBe(2);
  expect(back.frame(inv,'2,2,3',null)).toBe(true);expect(back.frames.size).toBe(0);expect(inv.slots[0]?.wear).toBe(13);
  expect(back.frame(inv,'2,2,3',null)).toBe(true);expect(inv.slots.filter(Boolean)).toHaveLength(1);
  expect(cleanSign('a'.repeat(40)+'\nb\nc\nd\ne').split('\n')).toEqual(['a'.repeat(24),'b','c','d']);
 });
});

describe('tree materials and model rigs',()=>{
 it('generates species-specific wood/leaves and crafts matching planks',()=>{
  for(const name of ['birch','spruce','palm'] as const){
   const variant=WOOD_SPECIES.indexOf(name),cells=[...treeCells(4,0,0,name).values()];
   expect(cells).toContain(S('log',variant));expect(cells).toContain(S('leaves',variant*2));
   const log={state:S('log',variant),count:1};expect(dropsOf(log.state,null,.5)[0]?.state).toBe(log.state);
   expect(craftResult([log,null,null,null],2)).toEqual({state:S('planks',variant),count:4});
  }
 });
 it('round-trips named legacy and new material states through the chunk codec',async()=>{
  const c=new Chunk(0,0,0);const states=[S('log'),S('leaves',1),S('planks'),S('log',5),S('leaves',11),S('sign',3),S('ember_forge')];
  states.forEach((s,i)=>c.set(i,s));const bytes=await encodeChunk(c);const decoded=await decodeChunk(0,0,0,bytes);
  states.forEach((s,i)=>expect(decoded.get(i)).toBe(s));
 });
 it('gives each species a bounded distinct rig with finite poses and a front-facing head',()=>{
  const signatures=new Set<string>();
  for(const s of SPECIES){
   const rig=mobRig(s.key);expect(rig.length).toBeLessThanOrEqual(MAX_MOB_PARTS);expect(rig.some(p=>p.name==='head'&&p.skin===1)).toBe(true);
   signatures.add(JSON.stringify(rig));
   for(const part of rig)for(const sleeping of [false,true]){
    const p=poseMobPart(part,{phase:1,time:2,moving:true,sleeping,attacking:true});expect(Object.values(p).every(Number.isFinite)).toBe(true);
    expect(part.w>0&&part.h>0&&part.d>0).toBe(true);
   }
  }
  expect(signatures.size).toBeGreaterThanOrEqual(17);
  expect(mobRig('deer').some(p=>p.name.startsWith('antler'))).toBe(true);
  expect(mobRig('rabbit').find(p=>p.name==='ear_-1')!.h).toBeGreaterThan(mobRig('cow').find(p=>p.name==='ear_-1')!.h);
  expect(mobRig('camel').some(p=>p.name==='hump')).toBe(true);expect(mobRig('fish').some(p=>p.name==='tail')).toBe(true);
 });
});
