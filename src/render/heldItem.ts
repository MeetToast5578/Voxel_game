import * as THREE from 'three';
import { BLOCKS } from '../engine/blocks';
import type { ItemStack } from '../game/inventory';
import { itemTile } from './tilePixels';
import { artworkPixels } from './woodlandArt';

const SIZE = 32;
type Swing = 'slash' | 'chop' | 'push';
const SWING_S: Record<Swing, number> = { slash: 0.26, chop: 0.24, push: 0.18 };

/** Pixels of a tile, top row first, or a plain grey square if it has no art. */
function pixelsOf(tile: string): Uint8ClampedArray {
  return artworkPixels(tile) ?? new Uint8ClampedArray(SIZE * SIZE * 4).fill(160);
}

/**
 * An item as a thin slab of coloured voxels, one per opaque pixel of its icon: front and back faces, and side faces
 * only where a neighbour is clear. Centred, 1 unit across.
 */
export function extrudedItem(tile: string): THREE.BufferGeometry {
  const px = pixelsOf(tile), pos: number[] = [], col: number[] = [];
  const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < SIZE && y < SIZE && px[(y * SIZE + x) * 4 + 3]! >= 128;
  const s = 1 / SIZE, t = s * 0.9;
  const quad = (a: number[], b: number[], c: number[], d: number[], r: number, g: number, bl: number, shade: number) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let k = 0; k < 6; k++) col.push((r / 255) * shade, (g / 255) * shade, (bl / 255) * shade);
  };
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (!opaque(x, y)) continue;
    const i = (y * SIZE + x) * 4, r = px[i]!, g = px[i + 1]!, b = px[i + 2]!;
    const x0 = x * s - 0.5, x1 = x0 + s, y1 = 0.5 - y * s, y0 = y1 - s, z0 = -t / 2, z1 = t / 2;
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], r, g, b, 1);
    quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], r, g, b, 0.7);
    if (!opaque(x - 1, y)) quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], r, g, b, 0.8);
    if (!opaque(x + 1, y)) quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], r, g, b, 0.8);
    if (!opaque(x, y - 1)) quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], r, g, b, 0.95);
    if (!opaque(x, y + 1)) quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], r, g, b, 0.6);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geometry;
}

/** A block as a small cube, each face painted pixel by pixel from its tile, lit from above. */
function blockCube(state: number): THREE.BufferGeometry {
  const t = BLOCKS.type(state), faces = t.variantFaces?.[state - t.id] ?? t.tiles;
  const pos: number[] = [], col: number[] = [];
  // [tile, shade, origin, u axis, v axis] per face; v runs down the picture.
  const sides: [string, number, number[], number[], number[]][] = [
    [faces.top, 1, [-0.5, 0.5, -0.5], [1, 0, 0], [0, 0, 1]],
    [faces.bottom, 0.55, [-0.5, -0.5, 0.5], [1, 0, 0], [0, 0, -1]],
    [t.front ?? faces.side, 0.8, [-0.5, 0.5, 0.5], [1, 0, 0], [0, -1, 0]],
    [faces.side, 0.7, [0.5, 0.5, -0.5], [-1, 0, 0], [0, -1, 0]],
    [faces.side, 0.88, [0.5, 0.5, 0.5], [0, 0, -1], [0, -1, 0]],
    [faces.side, 0.62, [-0.5, 0.5, -0.5], [0, 0, 1], [0, -1, 0]],
  ];
  const step = 2, s = step / SIZE;
  for (const [tile, shade, o, u, v] of sides) {
    const px = pixelsOf(tile);
    for (let y = 0; y < SIZE; y += step) for (let x = 0; x < SIZE; x += step) {
      const i = (y * SIZE + x) * 4;
      if (px[i + 3]! < 128) continue;
      const at = (a: number, b: number) => [0, 1, 2].map((k) => o[k]! + u[k]! * a + v[k]! * b);
      const a = x / SIZE, b = y / SIZE;
      const p = [at(a, b), at(a + s, b), at(a + s, b + s), at(a, b + s)];
      pos.push(...p[0]!, ...p[2]!, ...p[1]!, ...p[0]!, ...p[3]!, ...p[2]!);
      for (let k = 0; k < 6; k++) col.push((px[i]! / 255) * shade, (px[i + 1]! / 255) * shade, (px[i + 2]! / 255) * shade);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geometry;
}

const ease = (t: number) => 1 - (1 - t) ** 3;

/**
 * The held item in first person, drawn over the world in its own scene: tools and items as extruded pixel art, blocks
 * as little cubes. It sways while walking and swings to match what the player does: a wide slash for swords and axes,
 * a chop while digging, a push when placing or using.
 */
export class HeldItem {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(70, 1, 0.01, 10);
  private readonly pivot = new THREE.Group();
  private readonly mesh: THREE.Mesh;
  private readonly material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  private readonly cache = new Map<string, THREE.BufferGeometry>();
  private shown = '';
  private block = false;
  private swing: Swing = 'push';
  private progress = 1;
  private swings = 0;
  private slashes = 0;
  /** Eases the item down and up again when it changes. */
  private lower = 0;

  constructor() {
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.pivot.add(this.mesh);
    this.scene.add(this.pivot);
  }

  /**
   * One frame. `swings` and `slashes` count the player's actions; `breaking` is true while digging. Returns whether an
   * item is shown (the flat hand picture is then hidden).
   */
  update(dt: number, held: ItemStack | null, o: { swings: number; slashes: number; breaking: boolean; light: number; bob: number; bobAmount: number; fov: number; aspect: number; visible: boolean }): boolean {
    this.pivot.visible = o.visible && held !== null;
    if (!held || !o.visible) {
      this.swings = o.swings;
      this.slashes = o.slashes;
      return false;
    }
    const t = BLOCKS.type(held.state), tool = t.tool?.kind;
    const key = `${held.state}:${held.upgrade ?? 0}`;
    if (key !== this.shown) {
      if (this.shown) this.lower = 1;
      this.shown = key;
      this.block = !t.item && t.shape === 'cube';
      let g = this.cache.get(key);
      if (!g) {
        g = this.block ? blockCube(held.state) : extrudedItem(itemTile(held.state, held.upgrade ?? 0));
        this.cache.set(key, g);
      }
      this.mesh.geometry = g;
    }
    if (o.slashes !== this.slashes) this.start('slash');
    else if (o.swings !== this.swings) this.start(tool === 'sword' ? 'slash' : tool || o.breaking ? 'chop' : 'push');
    else if (o.breaking && this.progress >= 1) this.start('chop');
    this.swings = o.swings;
    this.slashes = o.slashes;
    this.progress = Math.min(1, this.progress + dt / SWING_S[this.swing]);
    this.lower = Math.max(0, this.lower - dt * 5);
    const p = this.progress, arc = Math.sin(Math.PI * p), e = ease(p);
    // Rest pose: tools held up and forward on the right; blocks as a cube lower down.
    let x = this.block ? 0.4 : 0.5, y = this.block ? -0.36 : -0.38, z = this.block ? -0.75 : -0.82;
    let rx = 0, ry = this.block ? 0.75 : -1.15, rz = this.block ? 0 : 0.18;
    if (p < 1) {
      if (this.swing === 'slash') {
        // From up and right across and down to the left, in time with the slash trail.
        rz += 1.0 - 2.4 * e;
        rx -= 0.5 * arc;
        x += 0.12 - 0.42 * e;
        y += 0.18 * arc - 0.06 * e;
        z -= 0.12 * arc;
      } else if (this.swing === 'chop') {
        rx -= 1.15 * arc;
        y += 0.06 * arc;
        z -= 0.14 * arc;
      } else {
        z -= 0.16 * arc;
        y += 0.04 * arc;
      }
    }
    x += Math.sin(o.bob) * 0.018 * o.bobAmount;
    y += -Math.abs(Math.cos(o.bob)) * 0.022 * o.bobAmount - this.lower * 0.35;
    this.pivot.position.set(x, y, z);
    this.pivot.rotation.set(rx, ry, rz, 'YXZ');
    this.mesh.scale.setScalar(this.block ? 0.19 : 0.38);
    // Handles sit in the hand: tool pictures put the handle at the bottom left.
    this.mesh.position.set(this.block ? 0 : 0.09, this.block ? 0 : 0.11, 0);
    // The view model is lit like the terrain around the player, never quite black.
    this.material.color.setScalar(Math.min(1, 0.35 + 0.8 * o.light));
    this.camera.fov = o.fov;
    this.camera.aspect = o.aspect;
    this.camera.updateProjectionMatrix();
    return true;
  }

  private start(kind: Swing): void {
    this.swing = kind;
    this.progress = 0;
  }

  /** Draws over what is already on screen, after clearing depth so the world never cuts into the item. */
  render(renderer: THREE.WebGLRenderer): void {
    if (!this.pivot.visible) return;
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = auto;
  }
}
