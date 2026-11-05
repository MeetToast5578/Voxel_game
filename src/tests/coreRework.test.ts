import {describe,it,expect} from 'vitest';
import manifest from '../../assets/woodland-ember/core-rework/manifest.json';
import index from '../../assets/woodland-ember/core-rework/texture-index.json';
import core from '../render/coreArt.json';
import {decodeArtTile} from '../render/artCodec';
import {artworkPixels} from '../render/woodlandArt';
import {BLOCKS} from '../engine/blocks';
import {CHUNK_AREA} from '../config';
import {buildMesh,decodeVertex,PAD_VOLUME,padIndex} from '../engine/mesher';
import {TILE_NAMES} from '../render/tilePixels';
const packed=core as Record<string,{palette:number[];indices:string}>;
const pixels=(name:string)=>decodeArtTile(packed[name]!);
const pixel=(p:Uint8ClampedArray,x:number,y:number)=>[...p.subarray((y*32+x)*4,(y*32+x)*4+4)];

describe('separated core texture pack',()=>{
 it('maps independent material sources to separate exact-size active runtime entries',()=>{
  expect(manifest.entries).toHaveLength(8);expect(new Set(manifest.entries.map(e=>e.source)).size).toBe(8);
  expect(index).toHaveLength(36);expect(new Set(index.map(e=>e.file)).size).toBe(36);
  expect(Object.keys(packed).sort()).toEqual(index.map(e=>e.name).sort());
  for(const e of index){
   expect(e.width,e.name).toBe(32);expect(e.height,e.name).toBe(32);
   const rgba=pixels(e.name);expect(rgba.length).toBe(4096);expect(Array.from(rgba).filter((_,i)=>i%4===3).every(a=>a===255)).toBe(true);
   expect([...artworkPixels(e.name)!],e.name).toEqual([...rgba]);expect(TILE_NAMES).toContain(e.name);
  }
 });
 it('matches repeat seams between every variation and uses vegetation across the entire grass face',()=>{
  for(const e of manifest.entries){
   const base=pixels(e.name);
   for(const name of [e.name,...e.variations]){
    const p=pixels(name);
    for(let t=0;t<32;t++){
     expect(pixel(p,0,t),name).toEqual(pixel(base,0,t));expect(pixel(p,31,t),name).toEqual(pixel(base,31,t));
     if(e.repeatAxes.includes('y')){expect(pixel(p,t,0),name).toEqual(pixel(base,t,0));expect(pixel(p,t,31),name).toEqual(pixel(base,t,31));}
    }
    for(let t=0;t<32;t++){expect(pixel(p,0,t),name).toEqual(pixel(p,31,t));if(e.repeatAxes.includes('y'))expect(pixel(p,t,0),name).toEqual(pixel(p,t,31));}
   }
  }
  // Overhead tufts and upright side blades are distinct, but every part remains vegetation.
  expect([...pixels('grass_side')]).not.toEqual([...pixels('grass_top')]);
  for(const name of ['grass_top','grass_side']){
   const p=pixels(name);let green=0;
   for(let i=0;i<p.length;i+=4)if(p[i+1]!>p[i]!&&p[i+1]!>p[i+2]!)green++;
   expect(green,name).toBeGreaterThan(900);
  }
 });
 it('binds each material to the intended model faces and preserves derived materials',()=>{
  for(const [key,faces]of Object.entries(manifest.bindings))expect(BLOCKS.byName(key).tiles).toEqual(faces);
  for(const key of ['stone','dirt','grass','cobblestone','brick'])expect(BLOCKS.byName(key+'_slab').tiles).toEqual(BLOCKS.byName(key).tiles);
  for(const key of ['stone','cobblestone','brick'])expect(BLOCKS.byName(key+'_stairs').tiles.side).toBe(key);
 });
 it('uses tinted vegetation on all six cube and slab faces, including undersides',()=>{
  for(const [key,variant]of [['grass',0],['grass_slab',0],['grass_slab',1]] as const){
   const states=new Uint16Array(PAD_VOLUME);states[padIndex(5,5,5)]=BLOCKS.state(key,variant);
   const mesh=buildMesh({states,light:new Uint8Array(PAD_VOLUME).fill(0xf0),climate:new Uint8Array(CHUNK_AREA)});
   const normals=new Set<number>();
   for(const words of mesh)for(let i=0;i<words.length;i+=2){
    const v=decodeVertex(words[i]!,words[i+1]!);normals.add(v.normal);expect(v.tint).toBe(1);
    expect(['grass_top','grass_side']).toContain(TILE_NAMES[v.tile]);
   }
   expect(normals.size).toBe(6);
  }
 });
});
