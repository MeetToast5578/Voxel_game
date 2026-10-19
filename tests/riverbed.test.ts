import { afterEach, describe, expect, it, vi } from 'vitest';
import { riverbedMaterial } from '../src/world/riverbed';
import { BlockId } from '../src/world/blocks';
import { Chunk } from '../src/world/chunk';
import { TerrainGenerator } from '../src/world/generator';
import { TerrainDensity } from '../src/world/density';
import { RegionSampler } from '../src/world/region';
import { ClimateSampler } from '../src/world/shape';
import { hash2 } from '../src/core/random';
import { SHORE_ROOF, DANDELION_CHANCE } from '../src/config';

/** Cave fields that are always open (or always closed) for the four systems, so a test controls carving exactly. */
function caveNoises(open: boolean) {
  const open3 = () => (open ? 1 : -1);
  const closed3 = () => (open ? 0 : 1);
  return { cheese: open3, noodleA: closed3, noodleB: closed3, spaghettiA: closed3, spaghettiB: closed3, ravine: closed3 };
}
afterEach(()=>vi.restoreAllMocks());
function fixture(river: boolean, lake = false) {
  vi.spyOn(ClimateSampler.prototype,'fields').mockReturnValue({continentalness:0.2,erosion:1,peaks:0,temperature:0,humidity:0,weirdness:0});
  vi.spyOn(RegionSampler.prototype,'sample').mockReturnValue({offsetM:9.6,riverDepthM:river?3:0,riverWidthM:river?5:0,
    flowX:river?1:0,flowZ:0,waterLevelM:river||lake?12:9,moisture:0,isRiver:river,isLake:lake});
  vi.spyOn(TerrainDensity.prototype,'isSolid').mockImplementation((_x,y)=>y<=32);
  const g=new TerrainGenerator(42);
  // Force every cave system open below its permitted roof: this proves the roof guard, not luck in the noise.
  Object.assign(g,{caves:caveNoises(true)});
  return g;
}
describe('river sediment (T-D1)',()=>{
  it('includes clay, gravel and sand and reproduces patches at negative coordinates',()=>{
    const materials=new Set<number>();
    for(let z=-64;z<64;z+=8)for(let x=-64;x<64;x+=8){
      const block=riverbedMaterial(42,x,z);materials.add(block);
      expect(riverbedMaterial(42,x,z)).toBe(block);
      expect(riverbedMaterial(42,x+7,z+7)).toBe(block);
    }
    expect([...materials].sort()).toEqual([BlockId.SAND,BlockId.GRAVEL,BlockId.CLAY].sort());
  });
  it('generates deterministic sediment under river water',()=>{
    const g=fixture(true);const materials=new Set<number>();
    for(let cx=-2;cx<2;cx++)for(let cz=-2;cz<2;cz++){
      const c=new Chunk(cx,2,cz);g.generateChunk(c);
      for(let z=0;z<16;z++)for(let x=0;x<16;x++){
        const bed=riverbedMaterial(42,cx*16+x,cz*16+z);materials.add(c.get(x,0,z));
        expect(c.get(x,0,z)).toBe(bed);expect(c.get(x,1,z)).toBe(BlockId.WATER);
      }
      const again=new Chunk(cx,2,cz);new TerrainGenerator(42).generateChunk(again);expect(again.blocks).toEqual(c.blocks);
    }
    expect(materials.has(BlockId.CLAY)).toBe(true);expect(materials.has(BlockId.GRAVEL)).toBe(true);
  });
});
describe('submerged land plants',()=>{
  it('keeps water at actual plant-eligible grass columns when cave noise is closed',()=>{
    const g=fixture(true);Object.assign(g,{caves:caveNoises(false)});
    let eligible=0;
    for(let cx=0;cx<4;cx++)for(let cz=0;cz<4;cz++){
      const c=new Chunk(cx,2,cz);g.generateChunk(c);
      for(let z=0;z<16;z++)for(let x=0;x<16;x++)if(hash2(53,cx*16+x,cz*16+z)<DANDELION_CHANCE){
        eligible++;expect(c.get(x,1,z)).toBe(BlockId.WATER);
      }
    }
    expect(eligible).toBeGreaterThan(0);
  });
});
describe('cave roofs under freshwater (T-D5)',()=>{
  it.each([[true,false],[false,true]] as const)('preserves a roof under river=%s lake=%s even when the cave noise is always open',(river,lake)=>{
    const g=fixture(river,lake);const c=new Chunk(0,1,0);const top=new Chunk(0,2,0);g.generateChunk(c);g.generateChunk(top);
    expect(top.get(0,0,0)).not.toBe(BlockId.AIR);
    for(let y=32-SHORE_ROOF+1;y<32;y++)expect(c.get(0,y-16,0)).not.toBe(BlockId.AIR);
    const caveY=32-SHORE_ROOF;const caveChunk=new Chunk(0,Math.floor(caveY/16),0);g.generateChunk(caveChunk);
    expect(caveChunk.get(0,caveY-Math.floor(caveY/16)*16,0)).toBe(BlockId.AIR);
  });
  it('retains cave openings on dry land',()=>{
    const g=fixture(false);const c=new Chunk(0,2,0);g.generateChunk(c);expect(c.get(0,0,0)).toBe(BlockId.AIR);
  });
});
