import {describe,it,expect} from 'vitest';
import {BLOCKS} from '../engine/blocks';
import {buildMesh,decodeVertex,PAD_VOLUME,padIndex} from '../engine/mesher';
import {CHUNK_AREA} from '../config';
import {TILE_NAMES} from '../render/tilePixels';
import {artworkPixels} from '../render/woodlandArt';
describe('assembled door material',()=>{
 it('selects one continuous four-part texture in every facing/open state, including chunk crossings',()=>{
  for(let variant=0;variant<8;variant++)for(let start=-3;start<16;start++){
   const states=new Uint16Array(PAD_VOLUME);
   for(let part=0;part<4;part++){const y=start+part;if(y>=-1&&y<=16)states[padIndex(5,y,5)]=BLOCKS.state('door',variant);}
   const mesh=buildMesh({states,light:new Uint8Array(PAD_VOLUME).fill(0xf0),climate:new Uint8Array(CHUNK_AREA)});
   for(const words of mesh)for(let i=0;i<words.length;i+=8){
    const v=decodeVertex(words[i]!,words[i+1]!);
    const cellY=v.normal===2?v.y-1:v.y;
    expect(TILE_NAMES[v.tile],`door variant ${variant}, bottom ${start}, cell ${cellY}`).toBe('door_segment_'+(cellY-start));
   }
  }
 });
 it('keeps the pillow at the head end in all four bed facings and leaves the foot blanket clear',()=>{
  for(let facing=0;facing<4;facing++){
   const pixels=artworkPixels('bed_head_'+facing)!;let cx=0,cy=0,count=0;
   for(let y=0;y<32;y++)for(let x=0;x<32;x++){const at=(y*32+x)*4;if(pixels[at]!>160&&pixels[at+1]!>140&&pixels[at+2]!>100){cx+=x;cy+=y;count++;}}
   expect(count).toBeGreaterThan(30);cx/=count;cy/=count;
   if(facing===0)expect(cx).toBeGreaterThan(21);
   if(facing===1)expect(cx).toBeLessThan(11);
   if(facing===2)expect(cy).toBeLessThan(11);
   if(facing===3)expect(cy).toBeGreaterThan(21);
   for(const head of [false,true]){
    const states=new Uint16Array(PAD_VOLUME);states[padIndex(5,5,5)]=BLOCKS.state('bed',facing+(head?4:0));
    const mesh=buildMesh({states,light:new Uint8Array(PAD_VOLUME).fill(0xf0),climate:new Uint8Array(CHUNK_AREA)});
    for(const words of mesh)for(let i=0;i<words.length;i+=8){const v=decodeVertex(words[i]!,words[i+1]!);if(v.normal===2)expect(TILE_NAMES[v.tile]).toBe(head?'bed_head_'+facing:'bed_top');}
   }
  }
 });
});
