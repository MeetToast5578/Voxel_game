import * as THREE from 'three';
import { type WeatherSample } from '../world/weather';
import { BLOCK_SIZE_M } from '../config';

/** Number of precipitation particles. */
const PARTICLE_COUNT = 1500;
/** Particle spread around the camera, in blocks. */
const PARTICLE_SPREAD = 30;
/** Particle fall speed, in blocks per second. */
const FALL_SPEED = 8;
/** Lightning: base chance per second of a flash when storming. */
const LIGHTNING_CHANCE_PER_S = 0.3;
/** Lightning flash duration, in seconds. */
const LIGHTNING_FLASH_S = 0.2;

/**
 * Weather rendering: precipitation particles and lightning flashes.
 * All visuals are derived from the WeatherModel sample — nothing is saved.
 */
export class WeatherRenderer {
  private readonly scene: THREE.Scene;

  /** Precipitation particle system. */
  private readonly particles: THREE.Points;
  private readonly particlePositions: Float32Array;
  private readonly particleVelocities: Float32Array;

  /** Lightning state. */
  private lightningFlash = 0; // seconds remaining in current flash
  private lightningTimer = 0; // seconds until next lightning check

  /** Current wetness (0..1) for the current precipitation. Exposed for the game to use. */
  wetness = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    this.particlePositions = new Float32Array(PARTICLE_COUNT * 3);
    this.particleVelocities = new Float32Array(PARTICLE_COUNT * 3);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xaaaaee,
      size: 0.15,
      transparent: true,
      depthWrite: false,
    });
    this.particles = new THREE.Points(geometry, material);
    this.particles.frustumCulled = false;
    scene.add(this.particles);

    // Initialize particles at random positions.
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this.resetParticle(i);
    }
  }

  private resetParticle(i: number): void {
    this.particlePositions[i * 3] = (Math.random() - 0.5) * 2 * PARTICLE_SPREAD;
    this.particlePositions[i * 3 + 1] = Math.random() * 40 + 10; // 10..50 blocks up
    this.particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 2 * PARTICLE_SPREAD;
    this.particleVelocities[i * 3] = 0;
    this.particleVelocities[i * 3 + 1] = -FALL_SPEED;
    this.particleVelocities[i * 3 + 2] = 0;
  }

  /**
   * Update weather visuals. `wx, wz` is the camera position. `sample` is the current
   * weather sample. `dt` is seconds since last update. `getColumnTop` returns the
   * highest sky-blocking block at a cell, used to cull particles under solid blocks
   * (no precipitation under a roof).
   */
  update(
    wx: number,
    wz: number,
    sample: WeatherSample,
    dt: number,
    getColumnTop: (x: number, z: number) => number | undefined,
  ): void {
    // Wetness: lerp toward target based on precipitation type.
    const targetWetness =
      sample.precipitation === 'rain' ? Math.min(1, sample.cloudCover * 0.8) : 0;
    this.wetness += (targetWetness - this.wetness) * dt * 3;

    // Lightning: random flashes during storms.
    if (sample.isStorm && this.lightningFlash <= 0) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        if (Math.random() < LIGHTNING_CHANCE_PER_S * dt) {
          this.lightningFlash = LIGHTNING_FLASH_S;
        }
        this.lightningTimer = 0.5 + Math.random();
      }
    }
    if (this.lightningFlash > 0) {
      this.lightningFlash -= dt;
    }

    // Precipitation active?
    const precipActive = sample.precipitation !== 'none';
    const particleColor = sample.precipitation === 'snow' ? 0xeeeeff : 0xaaaaee;
    (this.particles.material as THREE.PointsMaterial).color.setHex(particleColor);
    (this.particles.material as THREE.PointsMaterial).opacity = precipActive ? sample.cloudCover : 0;

    if (!precipActive) {
      this.particles.visible = false;
      return;
    }
    this.particles.visible = true;

    // Move and cull particles.
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this.particlePositions[i * 3] += this.particleVelocities[i * 3] * dt;
      this.particlePositions[i * 3 + 1] += this.particleVelocities[i * 3 + 1] * dt;
      this.particlePositions[i * 3 + 2] += this.particleVelocities[i * 3 + 2] * dt;

      // World position of this particle.
      const pwx = wx + this.particlePositions[i * 3];
      const pwz = wz + this.particlePositions[i * 3 + 2];

      // Cull particle if there's a solid block above it (no rain under a roof).
      const top = getColumnTop(Math.floor(pwx / BLOCK_SIZE_M), Math.floor(pwz / BLOCK_SIZE_M));
      const py = this.particlePositions[i * 3 + 1];
      if (top !== undefined && py > top * BLOCK_SIZE_M) {
        // Particle is above a solid block — reset it high above the camera.
        this.resetParticle(i);
        this.particlePositions[i * 3 + 1] = 60;
        continue;
      }

      // Reset particle when it falls too far.
      if (this.particlePositions[i * 3 + 1] < -10) {
        this.resetParticle(i);
      }
    }

    this.particles.geometry.attributes.position.needsUpdate = true;
    this.particles.position.set(wx, 0, wz);
  }

  /** Lightning flash intensity (0..1) for this frame. */
  getFlashIntensity(): number {
    return this.lightningFlash > 0 ? this.lightningFlash / LIGHTNING_FLASH_S : 0;
  }

  dispose(): void {
    this.scene.remove(this.particles);
    (this.particles.geometry as THREE.BufferGeometry).dispose();
    (this.particles.material as THREE.Material).dispose();
  }
}
