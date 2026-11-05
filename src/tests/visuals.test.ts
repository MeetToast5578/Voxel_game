import {describe, expect, it} from 'vitest';
import * as THREE from 'three';
import {BLOCKS} from '../engine/blocks';
import {Highlight, highlightBoxes} from '../render/highlight';
import {worldFogUniforms} from '../render/worldFog';

describe('visual geometry and atmosphere', () => {
  it('matches partial block shapes and thin fittings, including an open door', () => {
    expect(highlightBoxes(BLOCKS.state('stone_slab'))).toEqual([[0,0,0,1,.5,1]]);
    expect(highlightBoxes(BLOCKS.state('stone_slab',1))).toEqual([[0,.5,0,1,1,1]]);
    expect(highlightBoxes(BLOCKS.state('snow',2))).toEqual([[0,0,0,1,3/8,1]]);
    expect(highlightBoxes(BLOCKS.state('stone_stairs',2))).toHaveLength(2);
    expect(highlightBoxes(BLOCKS.state('torch'))).toEqual([[7/16,0,7/16,9/16,10/16,9/16]]);
    const open = BLOCKS.state('door',4);
    expect(highlightBoxes(open)).toEqual(BLOCKS.type(open).boxes!(4).map(b=>b.map(n=>n/16)));
    expect(highlightBoxes(BLOCKS.state('campfire'))).toHaveLength(4);
  });

  it('moves and resizes outlines and cracks together without leaving old shape components visible', () => {
    const scene=new THREE.Scene(), highlight=new Highlight(scene);
    const hit={x:2,y:3,z:4,nx:0,ny:1,nz:0,distance:2};
    highlight.set(hit,.5,BLOCKS.state('stone_slab'));
    const [lines,cracks]=scene.children;
    const bounds=new THREE.Box3().setFromObject(lines!);
    expect(bounds.min.y).toBeCloseTo(2.998);expect(bounds.max.y).toBeCloseTo(3.502);
    const breakingBounds=new THREE.Box3().setFromObject(cracks!);
    expect(breakingBounds.max.y).toBeCloseTo(3.503);expect(cracks!.visible).toBe(true);
    highlight.set(hit,.7,BLOCKS.state('stone_stairs'));
    expect(lines!.children.filter(c=>c.visible)).toHaveLength(2);
    highlight.set(hit,0,BLOCKS.state('stone_slab',1));
    expect(lines!.children.filter(c=>c.visible)).toHaveLength(1);expect(cracks!.visible).toBe(false);
    // Box3 includes hidden children, so inspect the active component only.
    const topBounds=new THREE.Box3().setFromObject(lines!.children[0]!);
    expect(topBounds.min.y).toBeCloseTo(3.498);expect(topBounds.max.y).toBeCloseTo(4.002);
    highlight.set(null);expect(lines!.visible).toBe(false);
  });

  it('keeps fog uniform references live when day, cave and underwater conditions change', () => {
    const source={fogColor:{value:new THREE.Color(.1,.2,.3)},fogNear:{value:40},fogFar:{value:80}};
    const uniforms=worldFogUniforms(source);
    expect(uniforms.worldFogColor).toBe(source.fogColor);
    source.fogNear.value=0;source.fogFar.value=12;source.fogColor.value.setRGB(.05,.1,.2);
    expect(uniforms.worldFogNear!.value).toBe(0);expect(uniforms.worldFogFar!.value).toBe(12);
    expect(uniforms.worldFogColor!.value).toBe(source.fogColor.value);
  });
});
