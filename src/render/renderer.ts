import * as THREE from 'three';
import { CAVE_FOG_M, FOG_START_SHARE, HORIZON_RADIUS_M, NIGHT_DAYLIGHT, UNDERWATER_FOG_M, toCells } from '../config';
import { LAYERS } from '../engine/mesher';
import { ChunkMeshes } from './chunkMeshes';
import { Clouds } from './clouds';
import { Horizon } from './horizon';
import { Precipitation } from './precipitation';
import { Sky } from './sky';
import { terrainMaterial } from './terrainMaterial';
import { TILE_NAMES, TILE_SIZE, tilePixels } from './tilePixels';

// Colors are written and shown as given (gamma space); the terrain shader does no color conversion either.
THREE.ColorManagement.enabled = false;

const CAVE_FOG = new THREE.Color(0.02, 0.02, 0.025);
const WATER_FOG = new THREE.Color(0.06, 0.16, 0.32);
const HORIZON_CELLS = toCells(HORIZON_RADIUS_M);

/** What the atmosphere looks like this frame. */
export interface Atmosphere {
  /** Unit vector towards the sun. */
  sun: [number, number, number];
  moonPhase: number;
  cloudCover: number;
  /** 0..1: how far the camera is under ground (dark fog, short range). */
  underground: number;
  /** Whether the camera is in water. */
  underwater: boolean;
  /** Lightning flash, 0..1. */
  flash: number;
  autumn: number;
  summer: number;
  /** Rotation of the night sky, radians. */
  starAngle: number;
}

/** Scene, camera, terrain passes and the sky around them. World units are cells. */
export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly chunks: ChunkMeshes;
  readonly uniforms: Record<string, THREE.IUniform>;
  readonly sky: Sky;
  readonly clouds: Clouds;
  readonly precipitation: Precipitation;
  readonly horizon: Horizon;
  private viewCells = 192;

  constructor(canvas: HTMLCanvasElement, seed: number, viewCells: number) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, HORIZON_CELLS * 1.2);
    const tiles = new THREE.DataArrayTexture(tilePixels(), TILE_SIZE, TILE_SIZE, TILE_NAMES.length);
    tiles.magFilter = THREE.NearestFilter;
    tiles.minFilter = THREE.NearestMipmapLinearFilter;
    tiles.generateMipmaps = true;
    tiles.needsUpdate = true;
    this.uniforms = {
      tiles: { value: tiles },
      daylight: { value: 1 },
      time: { value: 0 },
      fogColor: { value: new THREE.Color() },
      fogNear: { value: 100 },
      fogFar: { value: 200 },
      autumn: { value: 0 },
      summer: { value: 0 },
    };
    this.sky = new Sky(this.scene, seed);
    this.clouds = new Clouds(this.scene, seed);
    this.precipitation = new Precipitation(this.scene);
    this.chunks = new ChunkMeshes(this.scene, LAYERS.map((layer) => terrainMaterial(layer, this.uniforms, this.renderer.extensions.has('WEBGL_multi_draw'))));
    this.horizon = new Horizon(this.scene, this.uniforms, viewCells * 0.85);
    this.setViewDistance(viewCells);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setViewDistance(cells: number): void {
    this.viewCells = cells;
    // The far terrain starts a little inside the loaded chunks, which cover it where they exist.
    this.horizon.setHole(cells * 0.9);
    this.horizon.setInner(cells * 0.85);
  }

  /** Daylight, sky, fog and the seasons for this frame. */
  setAtmosphere(a: Atmosphere): void {
    const day = Math.min(1, Math.max(0, (a.sun[1] + 0.15) / 0.4));
    this.uniforms.daylight!.value = Math.min(1, (NIGHT_DAYLIGHT + (1 - NIGHT_DAYLIGHT) * day) * (1 - 0.35 * a.cloudCover) + a.flash * 0.5);
    this.sky.update(this.camera, HORIZON_CELLS * 1.1, a.sun, a.moonPhase, a.cloudCover, a.flash, a.starAngle, a.underground);
    this.clouds.visible = a.underground < 0.5;
    // Above ground the fog fades into the sky's horizon colour out to the far terrain; under ground it closes in
    // and turns dark.
    const fog = this.uniforms.fogColor!.value as THREE.Color;
    fog.copy(this.sky.horizon).lerp(CAVE_FOG, a.underground);
    this.uniforms.fogNear!.value = THREE.MathUtils.lerp(this.viewCells * FOG_START_SHARE, toCells(CAVE_FOG_M) * 0.2, a.underground);
    this.uniforms.fogFar!.value = THREE.MathUtils.lerp(HORIZON_CELLS, toCells(CAVE_FOG_M), a.underground);
    if (a.underwater) {
      fog.copy(WATER_FOG).multiplyScalar(0.3 + 0.7 * (this.uniforms.daylight!.value as number));
      this.uniforms.fogNear!.value = 0;
      this.uniforms.fogFar!.value = toCells(UNDERWATER_FOG_M);
    }
    this.renderer.setClearColor(fog);
    this.uniforms.autumn!.value = a.autumn;
    this.uniforms.summer!.value = a.summer;
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
