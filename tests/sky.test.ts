import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { WORLD_LATITUDE_DEG } from '../src/config';
import { Sky } from '../src/render/sky';

function fixture() {
  const scene = new THREE.Scene();
  const sky = new Sky(scene);
  const camera = new THREE.Object3D();
  const stars = scene.children.find((child) => child instanceof THREE.Points) as THREE.Points;
  return { sky, camera, stars };
}

describe('rotating stars (T-F2)', () => {
  it('turns around the celestial pole and returns to its starting orientation after one day', () => {
    const { sky, camera, stars } = fixture();
    try {
      const pole = new THREE.Vector3(0, Math.sin(WORLD_LATITUDE_DEG * Math.PI / 180), Math.cos(WORLD_LATITUDE_DEG * Math.PI / 180));
      sky.update(0, 0, camera);
      const initial = stars.quaternion.clone();
      sky.update(0.25, 0, camera);
      expect(stars.quaternion.angleTo(initial)).toBeCloseTo(Math.PI / 2, 8);
      expect(pole.clone().applyQuaternion(stars.quaternion).distanceTo(pole)).toBeLessThan(1e-10);
      sky.update(1, 0, camera);
      expect(stars.quaternion.angleTo(initial)).toBeCloseTo(0, 8);
    } finally {
      sky.dispose();
    }
  });

  it('reproduces the same orientation after time jumps, recentres on the camera, and never rewrites geometry', () => {
    const { sky, camera, stars } = fixture();
    try {
      const positions = stars.geometry.getAttribute('position');
      const before = Array.from(positions.array);
      sky.update(0.75, 0, camera);
      const expected = stars.quaternion.clone();
      sky.update(0.1, 0.5, camera);
      camera.position.set(100, -20, 35);
      sky.update(0.75, 0, camera);
      expect(stars.quaternion.angleTo(expected)).toBeCloseTo(0, 7);
      expect(stars.position).toEqual(camera.position);
      expect(stars.geometry.getAttribute('position')).toBe(positions);
      expect(Array.from(positions.array)).toEqual(before);
    } finally {
      sky.dispose();
    }
  });
});
