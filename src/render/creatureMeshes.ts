import * as THREE from 'three';
import { CREATURE_CAP } from '../config';
import type { Creature } from '../creatures/creatures';

const PARTS = 7;
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3();
const tmpC = new THREE.Color(), UP = new THREE.Vector3(0, 1, 0);

/**
 * Creatures as boxes in one instanced mesh: four-legged animals (body, head, legs), upright monsters (torso, head, two
 * legs) and fish (one long box). Legs swing with the walk; colour is the species' times the light where it stands.
 */
export class CreatureMeshes {
  private readonly mesh: THREE.InstancedMesh;

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), CREATURE_CAP * PARTS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  /** Poses every creature; `lightAt` gives the brightness (0..1) where a creature stands. */
  update(list: readonly Creature[], lightAt: (c: Creature) => number): void {
    let n = 0;
    const box = (c: Creature, ox: number, oy: number, oz: number, sx: number, sy: number, sz: number, rgb: readonly number[], light: number) => {
      // Offsets are in the creature's own frame (z forward), turned by its yaw.
      const cos = Math.cos(c.yaw), sin = Math.sin(c.yaw);
      tmpP.set(c.body.x + ox * cos + oz * sin, c.body.y + oy, c.body.z - ox * sin + oz * cos);
      tmpQ.setFromAxisAngle(UP, c.yaw);
      tmpS.set(sx, sy, sz);
      this.mesh.setMatrixAt(n, tmpM.compose(tmpP, tmpQ, tmpS));
      tmpC.setRGB((rgb[0]! / 255) * light, (rgb[1]! / 255) * light, (rgb[2]! / 255) * light);
      if (c.hurt > 0) tmpC.lerp(new THREE.Color(1, 0.1, 0.1), 0.6);
      this.mesh.setColorAt(n++, tmpC);
    };
    for (const c of list) {
      const s = c.species, w = c.body.halfWidth * 2, h = c.body.height, light = lightAt(c);
      const swing = Math.sin(c.walk) * 0.35 * h;
      const { body, head, legs } = s.colours;
      if (s.medium === 'water') {
        box(c, 0, h * 0.5, 0, w * 0.8, h, w * 2.2, body, light);
      } else if (s.hostile && !s.climbs) {
        box(c, 0, h * 0.62, 0, w, h * 0.38, w * 0.55, body, light);
        box(c, 0, h * 0.9, 0, w * 0.6, h * 0.2, w * 0.6, head, light);
        box(c, -w * 0.25, h * 0.22, swing * 0.3, w * 0.4, h * 0.44, w * 0.4, legs, light);
        box(c, w * 0.25, h * 0.22, -swing * 0.3, w * 0.4, h * 0.44, w * 0.4, legs, light);
      } else {
        const len = Math.max(w * 1.8, h * 0.6), legH = h * 0.42;
        box(c, 0, legH + h * 0.18, 0, w, h * 0.36, len, body, light);
        box(c, 0, h * 0.82, -len * 0.55, w * 0.6, h * 0.3, h * 0.3, head, light);
        for (const [lx, lz, k] of [[-1, -1, 1], [1, -1, -1], [-1, 1, -1], [1, 1, 1]] as const) {
          box(c, lx * w * 0.32, legH / 2, lz * len * 0.38 + k * swing * 0.25, w * 0.22, legH, w * 0.22, legs, light);
        }
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    // Only the part of the buffers in use is uploaded.
    this.mesh.instanceMatrix.clearUpdateRanges();
    this.mesh.instanceMatrix.addUpdateRange(0, n * 16);
    this.mesh.instanceColor?.clearUpdateRanges();
    this.mesh.instanceColor?.addUpdateRange(0, n * 3);
  }
}
