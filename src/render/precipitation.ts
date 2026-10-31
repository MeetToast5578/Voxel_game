import * as THREE from 'three';
import { PRECIP_BOX_M, RAIN_SPEED_M_S, SNOW_SPEED_M_S, toCells } from '../config';
import { mulberry32 } from '../core/random';

const COUNT = 2000;
const BOX = toCells(PRECIP_BOX_M);
const STREAK = 0.5; // cells a raindrop is drawn long

/** Falling rain (short streaks) or snow (points) in a box around the camera, only where the sky is open. */
export class Precipitation {
  private readonly rain: THREE.LineSegments;
  private readonly snow: THREE.Points;
  private readonly drops = new Float32Array(COUNT * 3);
  private readonly rand = mulberry32(5);

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < COUNT * 3; i++) this.drops[i] = (this.rand() - 0.5) * BOX;
    this.rain = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({
      color: 0xa8b8d0, transparent: true, opacity: 0.55, depthWrite: false,
    }));
    this.rain.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 6), 3));
    this.snow = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({
      color: 0xffffff, size: 0.12, transparent: true, opacity: 0.9, depthWrite: false,
    }));
    this.snow.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
    for (const o of [this.rain, this.snow]) {
      o.frustumCulled = false;
      o.renderOrder = 6;
      o.visible = false;
      scene.add(o);
    }
  }

  /**
   * Moves the particles. `kind` is what falls ('none' hides both), `intensity` 0..1 how many fall, and `skyTop` gives
   * the highest sky-blocking cell of a column, so nothing falls under a roof.
   */
  update(cx: number, cy: number, cz: number, dt: number, kind: 'none' | 'rain' | 'snow', intensity: number, wind: number,
    skyTop: (x: number, z: number) => number): void {
    this.rain.visible = kind === 'rain';
    this.snow.visible = kind === 'snow';
    if (kind === 'none') return;
    const fall = toCells(kind === 'rain' ? RAIN_SPEED_M_S : SNOW_SPEED_M_S) * dt;
    const n = Math.floor(COUNT * Math.min(1, Math.max(0.1, intensity)));
    const half = BOX / 2;
    const target = (kind === 'rain' ? this.rain : this.snow).geometry.getAttribute('position') as THREE.BufferAttribute;
    const out = target.array as Float32Array;
    for (let i = 0; i < COUNT; i++) {
      const o = i * 3;
      this.drops[o + 1]! -= fall;
      if (kind === 'snow') {
        this.drops[o]! += Math.sin(this.drops[o + 1]! * 0.7 + i) * dt * 0.6 + toCells(wind) * 0.05 * dt;
      }
      if (this.drops[o + 1]! < -half) this.drops[o + 1]! += BOX;
      // Positions wrap around the camera, so the box never empties as it moves.
      const x = cx + wrap(this.drops[o]! - cx, half), y = cy + this.drops[o + 1]!, z = cz + wrap(this.drops[o + 2]! - cz, half);
      const hidden = i >= n || y <= skyTop(Math.floor(x), Math.floor(z)) + 1;
      if (kind === 'rain') {
        out.set(hidden ? [0, -1e6, 0, 0, -1e6, 0] : [x, y, z, x, y + STREAK, z], i * 6);
      } else {
        out.set(hidden ? [0, -1e6, 0] : [x, y, z], o);
      }
    }
    target.needsUpdate = true;
  }
}

/** v into [-half, half) by whole box widths. */
function wrap(v: number, half: number): number {
  const w = half * 2;
  return ((((v + half) % w) + w) % w) - half;
}
