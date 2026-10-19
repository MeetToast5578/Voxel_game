import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Sky } from '../src/render/sky';
import { Renderer } from '../src/render/renderer';
import { moonPhaseAt, moonIllumination } from '../src/world/moon';
import { daylightAt } from '../src/world/time';

describe('sun/daylight clock alignment', () => {
  it('puts the sun above the horizon at game noon and below it at game midnight', () => {
    const scene=new THREE.Scene(); const sky=new Sky(scene); const camera=new THREE.Object3D();
    const sun=scene.children[1]!;
    try {
      sky.update(0.25,0,camera);
      expect(daylightAt(0.25)).toBe(1);
      expect(sun.position.y).toBeGreaterThan(0);
      expect(sun.visible).toBe(true);
      sky.update(0.75,0,camera);
      expect(sun.position.y).toBeLessThan(0);
      expect(sun.visible).toBe(false);
      sky.update(0,0,camera);
      expect(sun.position.y).toBeCloseTo(0,8);
    } finally {sky.dispose();}
  });
});

describe('sky visibility and lunar phases (T-F1)', () => {
  it('retains enough camera range for the sky when the terrain view distance changes', () => {
    const renderer = Object.create(Renderer.prototype) as Renderer;
    const camera = new THREE.PerspectiveCamera(75,1,0.1,2000);
    Object.assign(renderer,{camera,viewBlocks:128,surfaceDistance:0});
    Reflect.apply(Reflect.get(Renderer.prototype,'updateFar'),renderer,[]);
    expect(camera.far).toBeGreaterThan(1000);
  });
  it('derives repeatable new, quarter and full moons from the saved year clock', () => {
    expect(moonPhaseAt(0)).toBe(0);
    expect(moonPhaseAt(0.0625)).toBe(0.25);
    expect(moonPhaseAt(0.125)).toBe(0.5);
    expect(moonPhaseAt(1)).toBe(0);
    expect(moonPhaseAt(-0.0625)).toBe(0.75);
    expect(moonIllumination(0)).toBe(0);
    expect(moonIllumination(0.25)).toBeCloseTo(0.5,10);
    expect(moonIllumination(0.5)).toBe(1);
    expect(moonIllumination(0.75)).toBeCloseTo(0.5,10);
  });
  it('updates the moon shader on time jumps and hides stars in daylight', () => {
    const scene = new THREE.Scene(); const sky = new Sky(scene); const camera = new THREE.Object3D();
    const moon = scene.children[2] as THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>;
    const stars = scene.children[3] as THREE.Points<THREE.BufferGeometry,THREE.PointsMaterial>;
    try {
      sky.update(0.25,0.125,camera);
      expect(moon.material.uniforms.uPhase.value).toBe(0.5);
      expect(stars.material.opacity).toBe(0);
      sky.update(0.75,0.0625,camera);
      expect(moon.material.uniforms.uPhase.value).toBe(0.25);
      expect(stars.material.opacity).toBe(1);
    } finally {sky.dispose();}
  });
});
