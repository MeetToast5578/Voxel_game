import * as THREE from 'three';
import type { Creature } from '../creatures/creatures';
import { Tile } from '../world/blocks';
import { tileUV } from './tiles';

type RGB = readonly [number, number, number];
/** A box part: centre and size in the creature's frame (forward is -z), turned by `rot` (about X, then Z, then Y) about `pivot`. */
export interface Part { c: [number, number, number]; s: [number, number, number]; colour: RGB; pivot?: [number, number, number]; rot?: [number, number, number]; }

// Corners of a unit box, per face, outward winding; face shade as in the world (top light, sides darker).
const FACES: { corners: [number, number, number][]; shade: number }[] = [
  { corners: [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]], shade: 0.8 },
  { corners: [[0, 0, 1], [0, 0, 0], [0, 1, 0], [0, 1, 1]], shade: 0.8 },
  { corners: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]], shade: 1 },
  { corners: [[0, 0, 0], [0, 0, 1], [1, 0, 1], [1, 0, 0]], shade: 0.5 },
  { corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.65 },
  { corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.65 },
];
const UV: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];

/** The model of a creature at its current pose (T-H4): textured cuboids for body, head, legs and so on. */
export function creatureParts(c: Creature, time: number): Part[] {
  const s = c.species, W = s.halfWidth * 2, H = s.height, { body, head, legs } = s.colours;
  const moving = Math.min(1, Math.hypot(c.vx, c.vz) / Math.max(0.01, s.speed * 0.5));
  const swing = Math.sin(c.walk * (6 / Math.max(0.5, H))) * 0.7 * moving;
  if (s.medium === 'water') {
    const wag = Math.sin(time * 8 + c.id) * 0.4;
    return [
      { c: [0, H * 0.5, 0], s: [W * 0.6, H * 0.8, W * 2], colour: body },
      { c: [0, H * 0.5, W * 1.2], s: [W * 0.1, H * 0.9, W * 0.6], colour: legs, pivot: [0, H * 0.5, W * 0.9], rot: [0, 0, wag] },
    ];
  }
  if (s.medium === 'air') {
    const flap = Math.sin(time * 14 + c.id) * 0.8;
    return [
      { c: [0, H * 0.5, 0], s: [W, H * 0.6, W * 1.6], colour: body },
      { c: [0, H * 0.7, -W * 0.9], s: [W * 0.6, H * 0.5, W * 0.6], colour: head },
      { c: [W * 0.9, H * 0.6, 0], s: [W * 1.4, H * 0.1, W * 0.8], colour: legs, pivot: [W * 0.5, H * 0.6, 0], rot: [0, flap, 0] },
      { c: [-W * 0.9, H * 0.6, 0], s: [W * 1.4, H * 0.1, W * 0.8], colour: legs, pivot: [-W * 0.5, H * 0.6, 0], rot: [0, -flap, 0] },
    ];
  }
  if (s.hostile) {
    // Upright, arms held out in front.
    const legH = H * 0.45, torso = H * 0.35, hs = H * 0.2;
    return [
      { c: [-W * 0.22, legH / 2, 0], s: [W * 0.4, legH, W * 0.45], colour: legs, pivot: [0, legH, 0], rot: [swing, 0, 0] },
      { c: [W * 0.22, legH / 2, 0], s: [W * 0.4, legH, W * 0.45], colour: legs, pivot: [0, legH, 0], rot: [-swing, 0, 0] },
      { c: [0, legH + torso / 2, 0], s: [W * 0.9, torso, W * 0.5], colour: body },
      { c: [0, legH + torso + hs / 2, 0], s: [hs, hs, hs], colour: head },
      { c: [-W * 0.6, legH + torso * 0.85, -W * 0.5], s: [W * 0.3, W * 0.3, W * 1.1], colour: head },
      { c: [W * 0.6, legH + torso * 0.85, -W * 0.5], s: [W * 0.3, W * 0.3, W * 1.1], colour: head },
    ];
  }
  // Four legs: body on top, head in front (lowered while grazing), a short tail; folded legs when asleep.
  const sleeping = c.behaviour === 'sleep';
  const legH = H * (sleeping ? 0.12 : 0.42), bodyH = H * 0.36, L = W * 1.7, BW = W * 0.9, hs = H * 0.3;
  const grazing = c.behaviour === 'graze' && !moving;
  const headY = grazing ? legH * 0.4 + hs / 2 + Math.abs(Math.sin(time * 4 + c.id)) * 0.05 : legH + bodyH * 0.9;
  const leg = (x: number, z: number, sw: number): Part => ({ c: [x, legH / 2, z], s: [BW * 0.28, legH, BW * 0.28], colour: legs, pivot: [x, legH, z], rot: [sw, 0, 0] });
  return [
    { c: [0, legH + bodyH / 2, 0], s: [BW, bodyH, L], colour: body },
    { c: [0, headY, -L / 2 - hs * 0.3], s: [hs * 0.9, hs, hs * 1.1], colour: head },
    leg(-BW * 0.32, -L * 0.35, swing), leg(BW * 0.32, -L * 0.35, -swing), leg(-BW * 0.32, L * 0.35, -swing), leg(BW * 0.32, L * 0.35, swing),
    { c: [0, legH + bodyH * 0.8, L / 2 + W * 0.05], s: [W * 0.15, W * 0.15, W * 0.2], colour: body },
  ];
}

/**
 * All creatures as one dynamic mesh, rebuilt each frame on the CPU (T-H4): a single draw call however many there are,
 * so a hundred creatures stay within the frame budget.
 */
export class CreatureMeshes {
  private readonly geometry = new THREE.BufferGeometry();
  private readonly mesh: THREE.Mesh;
  private capacity = 0;
  private positions = new Float32Array(0);
  private uvs = new Float32Array(0);
  private colours = new Float32Array(0);
  private light = new Float32Array(0);

  constructor(scene: THREE.Scene, material: THREE.Material) {
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false; // its bounds change every frame
    scene.add(this.mesh);
  }

  /** `lightAt` gives each creature's [sky, block] light, 0..1. */
  sync(creatures: readonly Creature[], time: number, lightAt: (c: Creature) => readonly [number, number]): void {
    const parts = creatures.map((c) => creatureParts(c, time));
    const boxes = parts.reduce((n, p) => n + p.length, 0);
    this.mesh.visible = boxes > 0;
    if (boxes === 0) return; // nothing to draw, and no buffers before the first creature
    this.ensure(boxes);
    const uv = tileUV(Tile.CREATURE);
    let v = 0;
    creatures.forEach((c, n) => {
      const cos = Math.cos(c.yaw), sin = Math.sin(c.yaw);
      const [sky, block] = lightAt(c);
      const hurt = c.hurtS > 0;
      for (const p of parts[n]!) {
        const [px, py, pz] = p.pivot ?? p.c, [ax, az, ay] = p.rot ?? [0, 0, 0];
        const ca = Math.cos(ax), sa = Math.sin(ax), cz = Math.cos(az), sz = Math.sin(az), cy = Math.cos(ay), sy = Math.sin(ay);
        for (const face of FACES) {
          face.corners.forEach((k, i) => {
            // Box corner, swung about its pivot (X then Z), turned by the yaw, moved to the creature.
            let x = p.c[0] + (k[0] - 0.5) * p.s[0], y = p.c[1] + (k[1] - 0.5) * p.s[1], z = p.c[2] + (k[2] - 0.5) * p.s[2];
            if (ax) { const dy = y - py, dz = z - pz; y = py + dy * ca - dz * sa; z = pz + dy * sa + dz * ca; }
            if (az) { const dx = x - px, dy = y - py; x = px + dx * cz - dy * sz; y = py + dx * sz + dy * cz; }
            if (ay) { const dx = x - px, dz = z - pz; x = px + dx * cy + dz * sy; z = pz - dx * sy + dz * cy; }
            // Written in place: tens of thousands of vertices a frame must not allocate.
            const P = this.positions, U = this.uvs, C = this.colours, L = this.light, shade = face.shade / 255;
            P[v * 3] = c.x + x * cos + z * sin; P[v * 3 + 1] = c.y + y; P[v * 3 + 2] = c.z - x * sin + z * cos;
            U[v * 2] = uv.u0 + UV[i]![0] * (uv.u1 - uv.u0); U[v * 2 + 1] = uv.v0 + UV[i]![1] * (uv.v1 - uv.v0);
            C[v * 3] = p.colour[0] * shade * (hurt ? 1.6 : 1); C[v * 3 + 1] = p.colour[1] * shade * (hurt ? 0.5 : 1); C[v * 3 + 2] = p.colour[2] * shade * (hurt ? 0.5 : 1);
            L[v * 2] = sky; L[v * 2 + 1] = block;
            v++;
          });
        }
      }
    });
    this.geometry.setDrawRange(0, boxes * 36);
    for (const name of ['position', 'uv', 'color', 'aLight']) this.geometry.getAttribute(name).needsUpdate = true;
  }

  private ensure(boxes: number): void {
    if (boxes <= this.capacity) return;
    this.capacity = Math.max(64, boxes * 2);
    const verts = this.capacity * 24;
    this.positions = new Float32Array(verts * 3);
    this.uvs = new Float32Array(verts * 2);
    this.colours = new Float32Array(verts * 3);
    this.light = new Float32Array(verts * 2);
    const index = new Uint32Array(this.capacity * 36);
    for (let q = 0; q < this.capacity * 6; q++) index.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colours, 3));
    this.geometry.setAttribute('aLight', new THREE.BufferAttribute(this.light, 2));
    this.geometry.setIndex(new THREE.BufferAttribute(index, 1));
  }
}
