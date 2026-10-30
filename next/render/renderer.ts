import * as THREE from 'three';
import { NIGHT_DAYLIGHT } from '../config';
import { smoothstep } from '../worldgen/climate';
import { LAYERS } from '../engine/mesher';
import { TILE_NAMES, TILE_SIZE, tilePixels } from './tilePixels';
import { ChunkMeshes } from './chunkMeshes';
import { terrainMaterial } from './terrainMaterial';

// Colors are written and shown as given (gamma space); the terrain shader does no color conversion either.
THREE.ColorManagement.enabled = false;

const DAY_SKY = new THREE.Color(0x9cc8f0);
const NIGHT_SKY = new THREE.Color(0x0b1020);

/** Scene, camera and terrain passes. World units are cells. */
export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly chunks: ChunkMeshes;
  readonly uniforms: Record<string, THREE.IUniform>;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setClearColor(DAY_SKY);
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 1000);
    const tiles = new THREE.DataArrayTexture(tilePixels(), TILE_SIZE, TILE_SIZE, TILE_NAMES.length);
    tiles.magFilter = THREE.NearestFilter;
    tiles.minFilter = THREE.NearestMipmapLinearFilter;
    tiles.generateMipmaps = true;
    tiles.needsUpdate = true;
    this.uniforms = {
      tiles: { value: tiles },
      daylight: { value: 1 },
      time: { value: 0 },
      fogColor: { value: DAY_SKY.clone() },
      fogNear: { value: 100 },
      fogFar: { value: 200 },
    };
    this.chunks = new ChunkMeshes(this.scene, LAYERS.map((layer) => terrainMaterial(layer, this.uniforms)));
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Fog fades terrain out over the last fifth of the view distance (in cells). */
  setViewDistance(cells: number): void {
    this.uniforms.fogNear!.value = cells * 0.8;
    this.uniforms.fogFar!.value = cells;
    this.camera.far = cells * 1.5;
    this.camera.updateProjectionMatrix();
  }

  /** Sets daylight and the sky colour for a time of day in [0, 1) (0 is midnight). */
  setDayTime(t: number): void {
    const sun = Math.sin((t - 0.25) * Math.PI * 2);
    const day = smoothstep(-0.15, 0.25, sun);
    this.uniforms.daylight!.value = NIGHT_DAYLIGHT + (1 - NIGHT_DAYLIGHT) * day;
    const sky = (this.uniforms.fogColor!.value as THREE.Color).copy(NIGHT_SKY).lerp(DAY_SKY, day);
    this.renderer.setClearColor(sky);
  }

  resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(time: number): void {
    this.uniforms.time!.value = time;
    this.renderer.render(this.scene, this.camera);
  }
}
