import * as THREE from 'three';
import {
  CAMERA_FAR_M, CHUNK_SIZE, DEFAULT_FOV, DEFAULT_RENDER_DISTANCE, metersToBlocks, SKY_COLOR, UNDERWATER_COLOR,
  UNDERWATER_FAR_M, WATER_OPACITY,
} from '../config';
import { createAtlasCanvas, createAtlasTexture } from './atlas';
import { patchLightMaterial, type LightUniforms } from './lightMaterial';

export class Renderer {
  readonly webgl: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  /** The block in hand, drawn after the world with the depth buffer cleared (spec 24). */
  readonly handScene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly atlasCanvas: HTMLCanvasElement;
  readonly solidMaterial: THREE.MeshBasicMaterial;
  readonly waterMaterial: THREE.MeshBasicMaterial;
  /** Dropped items and the block in hand: double-sided, lit like the world. */
  readonly itemMaterial: THREE.MeshBasicMaterial;
  /** The crack overlay on a block being broken. */
  readonly crackMaterial: THREE.MeshBasicMaterial;
  readonly fog: THREE.Fog;
  /** Shared by both block materials; uDaylight is 1 at noon and MIN_DAYLIGHT at midnight. */
  readonly lightUniforms: LightUniforms = { uDaylight: { value: 1 }, uWetness: { value: 0 } };
  private readonly background = new THREE.Color(SKY_COLOR);
  private skyColor = SKY_COLOR;
  private underwater = false;
  private atmosphericFog = 0;
  private viewBlocks = DEFAULT_RENDER_DISTANCE * CHUNK_SIZE;
  /** Vertical distance to the farthest visible surface (from the loaded column tops), in blocks. */
  private surfaceDistance = 0;
  private horizonDistance = 0;
  /** Draw calls of the world pass in the last frame (the hand pass is not counted). */
  drawCalls = 0;

  constructor(private readonly container: HTMLElement) {
    this.webgl = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.webgl.domElement);

    this.camera = new THREE.PerspectiveCamera(DEFAULT_FOV, 1, 0.1, metersToBlocks(CAMERA_FAR_M));
    this.camera.rotation.order = 'YXZ'; // yaw around Y first, then pitch around X
    this.handScene.add(this.camera); // the held block hangs off the camera

    this.scene.background = this.background;
    this.fog = new THREE.Fog(SKY_COLOR, 50, 100);
    this.scene.fog = this.fog;

    this.atlasCanvas = createAtlasCanvas();
    const atlas = createAtlasTexture(this.atlasCanvas);
    this.solidMaterial = new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true, alphaTest: 0.5 });
    this.waterMaterial = new THREE.MeshBasicMaterial({
      map: atlas,
      vertexColors: true,
      transparent: true,
      opacity: WATER_OPACITY,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.itemMaterial = new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide });
    this.crackMaterial = new THREE.MeshBasicMaterial({
      map: atlas, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    patchLightMaterial(this.solidMaterial, this.lightUniforms, true);
    patchLightMaterial(this.waterMaterial, this.lightUniforms);
    patchLightMaterial(this.itemMaterial, this.lightUniforms);

    window.addEventListener('resize', this.resize);
    this.resize();
  }

  get canvas(): HTMLCanvasElement {
    return this.webgl.domElement;
  }

  /** Fog hides the edge of the loaded world. renderDistance is in chunks. */
  setViewDistance(renderDistance: number): void {
    this.viewBlocks = renderDistance * CHUNK_SIZE;
    this.updateFar();
    this.applyFog();
  }

  /**
   * The far plane covers the horizontal view distance plus the vertical distance to the farthest loaded surface,
   * so hills seen from a valley (or the valley seen from a mountain) are not clipped. Fog is horizontal only.
   */
  setSurfaceDistance(blocks: number): void {
    const rounded = Math.ceil(blocks / CHUNK_SIZE) * CHUNK_SIZE; // avoid a projection update every frame
    if (rounded === this.surfaceDistance) return;
    this.surfaceDistance = rounded;
    this.updateFar();
  }

  setHorizonDistance(blocks: number): void {
    if (blocks === this.horizonDistance) return;
    this.horizonDistance = blocks; this.updateFar(); this.applyFog();
  }

  get horizonEnvironment(): { daylight: number; sky: number; haze: number } {
    return { daylight: this.lightUniforms.uDaylight.value, sky: this.skyColor, haze: this.atmosphericFog };
  }

  private updateFar(): void {
    this.camera.far = Math.max(this.horizonDistance * 1.5, metersToBlocks(CAMERA_FAR_M), Math.hypot(this.viewBlocks, this.surfaceDistance) + 64);
    this.camera.updateProjectionMatrix();
  }

  /** Sky and fog color (changes with the time of day). */
  setSkyColor(color: number): void {
    if (color === this.skyColor) return;
    this.skyColor = color;
    this.applyFog();
  }

  /** Short-range blue fog while the camera is inside water. */
  setUnderwater(underwater: boolean): void {
    if (underwater === this.underwater) return;
    this.underwater = underwater;
    this.applyFog();
  }

  setDaylight(daylight: number): void {
    this.lightUniforms.uDaylight.value = daylight;
  }

  setAtmosphericFog(strength: number): void {
    const next = Math.max(0, Math.min(1, strength));
    if (Math.abs(next - this.atmosphericFog) < 0.005) return;
    this.atmosphericFog = next;
    this.applyFog();
  }

  setWetness(wetness: number): void {
    this.lightUniforms.uWetness.value = Math.max(0, Math.min(1, wetness));
  }

  setFov(fov: number): void {
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  setCamera(x: number, y: number, z: number, yaw: number, pitch: number): void {
    this.camera.position.set(x, y, z);
    this.camera.rotation.set(pitch, yaw, 0); // order is YXZ (set in the constructor)
  }

  render(): void {
    this.camera.updateMatrixWorld(); // the camera is in handScene, so it is not updated by the world pass
    this.webgl.autoClear = true;
    this.webgl.render(this.scene, this.camera);
    this.drawCalls = this.webgl.info.render.calls;
    this.webgl.autoClear = false; // keep the world; clear only the depth so the hand is never inside a wall
    this.webgl.clearDepth();
    this.webgl.render(this.handScene, this.camera);
  }

  private applyFog(): void {
    const color = this.underwater ? UNDERWATER_COLOR : this.skyColor;
    this.fog.color.setHex(color);
    this.background.setHex(color);
    this.fog.near = this.underwater ? 0.1 : this.viewBlocks * 0.6 * (1 - this.atmosphericFog * 0.85);
    this.fog.far = this.underwater ? metersToBlocks(UNDERWATER_FAR_M) : (this.horizonDistance || this.viewBlocks * 0.95) * (1 - this.atmosphericFog * 0.65);
  }

  private readonly resize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.webgl.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };
}
