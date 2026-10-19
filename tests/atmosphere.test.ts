import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { atmosphericFogStrength } from '../src/world/atmosphere';
import { Renderer } from '../src/render/renderer';
import { Game } from '../src/game';
import { skyColorAt } from '../src/world/time';
import { metersToBlocks, UNDERWATER_FAR_M } from '../src/config';

function atmosphereGame() {
  const game=Object.create(Game.prototype) as Game;
  const renderer={camera:new THREE.Object3D(),setSkyColor:vi.fn(),setDaylight:vi.fn(),setWetness:vi.fn(),setAtmosphericFog:vi.fn()};
  const weather={precipitation:'rain',humidity:1,cloudCover:1,isStorm:false,pressure:0,windSpeed:0};
  const model={sample:vi.fn(()=>weather)};
  const particles={update:vi.fn(),wetness:0.5};
  const generator={sampleColumn:vi.fn((x:number,z:number)=>({offsetM:x===100&&z===-100?30:42}))};
  Object.assign(game,{renderer,sky:{update:vi.fn()},weather:model,weatherRenderer:particles,world:{topAt:()=>123},generator,
    timeOfDay:0,calendar:{timeOfYear:0.25},fogSampleTimer:0,fogValleyDepthM:0});
  return {game,renderer,model,particles,generator};
}
function update(game:Game,dt:number) {
  Reflect.apply(Reflect.get(Game.prototype,'updateAtmosphere'),game,[{x:100,y:100,z:-100},dt]);
}
describe('atmospheric integration (T-F3/T-F4)',()=>{
  it('samples weather in metres, renders particles in blocks, and propagates wetness and sky colour',()=>{
    const {game,renderer,model,particles}=atmosphereGame();update(game,0.1);
    expect(model.sample).toHaveBeenCalledWith(30,-30,0,0.25,30);
    const args=particles.update.mock.calls[0] as unknown as [number,number,unknown,number,(x:number,z:number)=>number,number];
    expect(args.slice(0,2)).toEqual([100,-100]);expect(args[5]).toBe(100);expect(args[4](0,0)).toBe(123);
    expect(renderer.setWetness).toHaveBeenCalledWith(0.5);
    expect(renderer.setSkyColor).toHaveBeenCalledWith(skyColorAt(0));
    expect(renderer.setAtmosphericFog.mock.calls[0]![0]).toBeGreaterThan(0.7);
  });
  it('clears valley fog when flying above the valley walls',()=>{
    const {game,renderer}=atmosphereGame();update(game,0.1);
    Reflect.apply(Reflect.get(Game.prototype,'updateAtmosphere'),game,[{x:100,y:300,z:-100},0.1]);
    expect(renderer.setAtmosphericFog.mock.lastCall![0]).toBeCloseTo(0.12);
  });
  it('caches the surrounding terrain samples rather than querying them every frame',()=>{
    const {game,generator}=atmosphereGame();update(game,0.1);expect(generator.sampleColumn).toHaveBeenCalledTimes(5);
    update(game,0.1);expect(generator.sampleColumn).toHaveBeenCalledTimes(5);
    update(game,2.1);expect(generator.sampleColumn).toHaveBeenCalledTimes(10);
  });
  it('adds humidity haze and dawn fog in valleys, fading outside morning or on ridges',()=>{
    const valley=atmosphericFogStrength(0,1,12);
    expect(valley).toBeGreaterThan(atmosphericFogStrength(0.25,1,12));
    expect(valley).toBeGreaterThan(atmosphericFogStrength(0,1,0));
    expect(atmosphericFogStrength(0,0,12)).toBe(0);
    expect(atmosphericFogStrength(1,1,12)).toBe(valley);
    expect(atmosphericFogStrength(-0.01,1,12)).toBeCloseTo(atmosphericFogStrength(0.99,1,12));
  });
  it('keeps fog ranges ordered, retains underwater fog priority, and updates fog colour at night',()=>{
    const renderer=Object.create(Renderer.prototype) as Renderer;
    Object.assign(renderer,{fog:new THREE.Fog(0,50,100),background:new THREE.Color(),skyColor:0x87ceeb,underwater:false,viewBlocks:128,atmosphericFog:0});
    renderer.setAtmosphericFog(1);
    expect(renderer.fog.near).toBeGreaterThan(0);expect(renderer.fog.far).toBeGreaterThan(renderer.fog.near);
    expect(renderer.fog.far).toBeLessThan(128*0.95);
    renderer.setSkyColor(skyColorAt(0.75));expect(renderer.fog.color.getHex()).toBe(skyColorAt(0.75));
    renderer.setUnderwater(true);renderer.setAtmosphericFog(0);
    expect(renderer.fog.far).toBe(metersToBlocks(UNDERWATER_FAR_M));expect(renderer.fog.near).toBe(0.1);
  });
});
