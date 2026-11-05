import {describe,it,expect} from 'vitest';
import manifest from '../../assets/woodland-ember/rework/manifest.json';
import index from '../../assets/woodland-ember/rework/texture-index.json';
import packed from '../render/reworkArt.json';
import {decodeArtTile,type PackedArtTile} from '../render/artCodec';
import {artworkPixels} from '../render/woodlandArt';
import {TILE_NAMES,tileIndex,itemTile} from '../render/tilePixels';
import {BLOCKS,WOOD_SPECIES,TOOL_TIERS,TOOL_KINDS,ARMOUR_PIECES} from '../engine/blocks';
const data=packed as Record<string,PackedArtTile>;
const pixels=(name:string)=>decodeArtTile(data[name]!);
const height=(p:Uint8ClampedArray)=>{let lo=32,hi=-1;for(let y=0;y<32;y++)for(let x=0;x<32;x++)if(p[(y*32+x)*4+3]){lo=Math.min(lo,y);hi=Math.max(hi,y);}return hi-lo+1;};
describe('full world texture rework',()=>{
 it('covers the world, all equipment tiers and harvested crops with separate active files',()=>{
  expect(manifest.sources.length).toBeGreaterThan(70);
  expect(index.length).toBeGreaterThan(270);
  expect(new Set(index.map(e=>e.file)).size).toBe(index.length);
  for(const e of index){expect(TILE_NAMES,e.name).toContain(e.name);expect([...artworkPixels(e.name)!],e.name).toEqual([...pixels(e.name)]);}
  for(const s of WOOD_SPECIES){for(const suffix of ['bark','end'])expect(data[s+'_'+suffix]).toBeDefined();if(s!=='dead_snag')for(const suffix of ['leaves','planks'])expect(data[s+'_'+suffix]).toBeDefined();}
  for(const tier of TOOL_TIERS)for(const kind of TOOL_KINDS)expect(data[tier+'_'+kind]).toBeDefined();
  for(const tier of ['leather','iron','diamond'])for(const part of ARMOUR_PIECES)expect(data[tier+'_'+part]).toBeDefined();
  for(const [key,name]of [['wheat','harvested_wheat'],['carrots','harvested_carrot'],['potatoes','harvested_potato']])for(let v=0;v<4;v++)expect(itemTile(BLOCKS.state(key!,v))).toBe(name);
 });
 it('preserves opacity, transparent silhouettes and declared repeat boundaries',()=>{
  for(const e of index){
   const p=pixels(e.name),alpha=Array.from(p).filter((_,i)=>i%4===3);
   expect(alpha.some(a=>a===255),e.name).toBe(true);
   if(e.alpha==='opaque')expect(alpha.every(a=>a===255),e.name).toBe(true);
   else expect(alpha.includes(0),e.name).toBe(true);
   if(e.name.endsWith('_leaves')||e.name==='leaves'){
    let matte=0;for(let i=0;i<p.length;i+=4)if(p[i+3]&&p[i]!>=224&&p[i+1]!>=224&&p[i+2]!>=224)matte++;
    expect(matte,e.name+' contains painted white background holes').toBe(0);
   }
   for(const axis of e.repeatAxes)for(let t=0;t<32;t++){
    const a=axis==='x'?t*128:t*4,b=axis==='x'?t*128+124:3968+t*4;
    expect([...p.subarray(a,a+4)],e.name).toEqual([...p.subarray(b,b+4)]);
   }
  }
  for(const crop of ['wheat','carrots','potatoes']){
   const sizes=Array.from({length:4},(_,v)=>height(pixels(crop+'_'+v)));
   expect(sizes[0]!,crop).toBeLessThan(sizes[3]!);
   for(let i=1;i<4;i++)expect(sizes[i]!,crop).toBeGreaterThanOrEqual(sizes[i-1]!);
  }
 });
 it('plays contiguous eight-frame loops while keeping station geometry and frame surfaces stable',()=>{
  expect(manifest.animations).toHaveLength(6);
  for(const a of manifest.animations){
   expect(a.frames).toHaveLength(8);const start=tileIndex(a.frames[0]!);
   for(let i=0;i<8;i++)expect(tileIndex(a.frames[i]!)).toBe(start+i);
   expect(new Set(a.frames.map(n=>data[n]!.indices)).size,a.tile).toBeGreaterThanOrEqual(3);
   if(a.tile==='water'||a.tile==='lava'){
    const edges=a.frames.map(name=>{const p=pixels(name);return Array.from(p.subarray(0,128)).join(',');});
    expect(new Set(edges).size,a.tile+' has a frozen border that creates stripes').toBeGreaterThanOrEqual(3);
   }
   if(a.opening){
    const [x0,y0,w,h]=a.opening,base=pixels(a.frames[0]!);
    for(const name of a.frames.slice(1)){
     const p=pixels(name);
     for(let y=0;y<32;y++)for(let x=0;x<32;x++)if(x<x0!||x>=x0!+w!||y<y0!||y>=y0!+h!){const at=(y*32+x)*4;expect([...p.subarray(at,at+4)],name).toEqual([...base.subarray(at,at+4)]);}
    }
   }
  }
 });
 it('anchors upright world plants to the ground rather than inheriting inventory padding',()=>{
  const upright=['tall_grass','fern','poppy','dandelion','brown_mushroom','red_mushroom','reed',
   ...['wheat','carrots','potatoes'].flatMap(c=>Array.from({length:4},(_,v)=>c+'_'+v)),
   ...['oak','birch','spruce','maple','pine','acacia','jungle_giant','palm'].map(s=>s+'_sapling')];
  for(const name of upright){const p=pixels(name);expect(Array.from(p.subarray(31*128)).some((v,i)=>i%4===3&&v===255),name).toBe(true);}
 });
});
