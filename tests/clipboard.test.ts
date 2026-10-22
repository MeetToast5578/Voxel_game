import { describe, expect, it } from 'vitest';
import { CLIPBOARD_MAX_EDGE } from '../src/config';
import { BuildClipboard } from '../src/player/clipboard';
import { BlockId, slabState } from '../src/world/blocks';
const source={isLoadedAt:()=>true,getBlock:(x:number,y:number,z:number)=>x===-1&&y===2&&z===-3?slabState(BlockId.STONE,true):BlockId.AIR};
describe('building clipboard',()=>{
  it('snapshots negative corners in either order, preserves variants and omits air',()=>{
    let state=slabState(BlockId.STONE,true);
    const live={...source,getBlock:(x:number,y:number,z:number)=>x===-1&&y===2&&z===-3?state:BlockId.AIR};
    const c=new BuildClipboard();c.select({x:0,y:3,z:-2},live);
    expect(c.preview({x:-1,y:2,z:-3})).toEqual({min:{x:-1,y:2,z:-3},max:{x:0,y:3,z:-2}});
    expect(c.select({x:-1,y:2,z:-3},live)).toBe(true);
    expect(c.count).toBe(1);
    expect(c.paste({x:16,y:32,z:-16})).toEqual([{x:16,y:32,z:-16,id:slabState(BlockId.STONE,true),clear:false}]);
    state=BlockId.BRICK; // editing the source after copying must not alter the captured state
    expect(c.paste({x:0,y:0,z:0})[0]!.id).toBe(slabState(BlockId.STONE,true));
    expect(c.bounds({x:16,y:32,z:-16})).toEqual({min:{x:16,y:32,z:-16},max:{x:17,y:33,z:-15}});
  });
  it('rejects oversized/unloaded selections without replacing a previous clipboard',()=>{
    const c=new BuildClipboard(),p={x:-1,y:2,z:-3};c.select(p,source);c.select(p,source);
    c.select(p,source);expect(c.select({...p,x:p.x+CLIPBOARD_MAX_EDGE},source)).toBe(false);expect(c.count).toBe(1);
    expect(c.select(p,{...source,isLoadedAt:()=>false})).toBe(false);expect(c.count).toBe(1);
    c.cancel();expect(c.anchor).toBeNull();expect(c.count).toBe(1);
  });
  it('replaces an old clipboard with an empty selection instead of pasting stale blocks',()=>{
    const c=new BuildClipboard(),p={x:-1,y:2,z:-3};c.select(p,source);c.select(p,source);
    c.select({x:0,y:0,z:0},source);c.select({x:0,y:0,z:0},source);expect(c.paste(p)).toEqual([]);
  });
});
