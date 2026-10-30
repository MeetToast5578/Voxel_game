import * as THREE from 'three';
import { CHUNK_SIZE, DAY_LENGTH_S, DEFAULT_VIEW_CHUNKS, EYE_HEIGHT_M, FLY_FAST_FACTOR, FLY_SPEED_M_S, MAX_VIEW_CHUNKS, MIN_VIEW_CHUNKS, toCells, BLOCK_SIZE_M } from './config';
import { FixedStepLoop } from './core/loop';
import { LightEngine } from './engine/light';
import { Streamer } from './engine/streaming';
import { World } from './engine/world';
import { Renderer } from './render/renderer';
import { WorkerPool } from './workers/pool';

/** Composition root of the new engine: world, workers, streaming, renderer and a fly camera. */
const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') ?? 1);
let viewChunks = Math.max(MIN_VIEW_CHUNKS, Math.min(MAX_VIEW_CHUNKS, Number(params.get('view') ?? DEFAULT_VIEW_CHUNKS)));

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const overlay = document.querySelector<HTMLDivElement>('#overlay')!;
const renderer = new Renderer(canvas);
const world = new World();
const pool = new WorkerPool(seed);
const light = new LightEngine(world);
const streamer = new Streamer(world, pool, renderer.chunks, light, viewChunks);
renderer.setViewDistance(viewChunks * CHUNK_SIZE);

const camera = renderer.camera;
camera.rotation.order = 'YXZ';
const pos = new THREE.Vector3(Number(params.get('x') ?? 0.5), Number(params.get('y') ?? NaN), Number(params.get('z') ?? 0.5));
let placed = Number.isFinite(pos.y);
if (!placed) pos.y = toCells(60);
let yaw = Number(params.get('yaw') ?? 0), pitch = Number(params.get('pitch') ?? -0.2);
/** Time of day in [0, 1): 0 is midnight, 0.5 noon. */
let dayTime = Number(params.get('time') ?? 0.35);

const keys = new Set<string>();
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'KeyT') dayTime = (dayTime + 1 / 24) % 1;
  if (e.code === 'Equal' || e.code === 'Minus') {
    viewChunks = Math.max(MIN_VIEW_CHUNKS, Math.min(MAX_VIEW_CHUNKS, viewChunks + (e.code === 'Equal' ? 2 : -2)));
    streamer.viewChunks = viewChunks;
    streamer.replan();
    renderer.setViewDistance(viewChunks * CHUNK_SIZE);
  }
});
addEventListener('keyup', (e) => keys.delete(e.code));
canvas.addEventListener('click', () => canvas.requestPointerLock());
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  yaw -= e.movementX * 0.0025;
  pitch = Math.max(-1.55, Math.min(1.55, pitch - e.movementY * 0.0025));
});

const forward = new THREE.Vector3(), right = new THREE.Vector3(), move = new THREE.Vector3();
function update(dt: number): void {
  dayTime = (dayTime + dt / DAY_LENGTH_S) % 1;
  if (!placed) {
    const ground = world.surfaceAt(Math.floor(pos.x), Math.floor(pos.z));
    if (ground !== undefined) {
      pos.y = ground + 1 + toCells(EYE_HEIGHT_M) + 2;
      placed = true;
    }
  }
  forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  right.set(-forward.z, 0, forward.x);
  move.set(0, 0, 0);
  if (keys.has('KeyW')) move.add(forward);
  if (keys.has('KeyS')) move.sub(forward);
  if (keys.has('KeyD')) move.add(right);
  if (keys.has('KeyA')) move.sub(right);
  if (keys.has('Space')) move.y += 1;
  if (keys.has('ShiftLeft')) move.y -= 1;
  if (move.lengthSq() > 0) {
    const speed = toCells(FLY_SPEED_M_S) * (keys.has('ControlLeft') ? FLY_FAST_FACTOR : 1);
    pos.addScaledVector(move.normalize(), speed * dt);
  }
}

let frames = 0, fps = 0, fpsTime = performance.now();
const loop = new FixedStepLoop(1 / 60, 0.25, update, () => {
  const now = performance.now();
  streamer.update(pos.x, pos.y, pos.z, now);
  camera.position.copy(pos);
  camera.rotation.set(pitch, yaw, 0);
  renderer.setDayTime(dayTime);
  renderer.render(now / 1000);
  frames++;
  if (now - fpsTime >= 500) {
    fps = Math.round((frames * 1000) / (now - fpsTime));
    frames = 0;
    fpsTime = now;
    const info = renderer.renderer.info;
    overlay.textContent = [
      `${fps} fps  time ${String(Math.floor(dayTime * 24)).padStart(2, '0')}:${String(Math.floor((dayTime * 1440) % 60)).padStart(2, '0')} [T]  view ${viewChunks} chunks (${Math.round(viewChunks * CHUNK_SIZE * BLOCK_SIZE_M)} m)  [+/-]`,
      `pos ${(pos.x * BLOCK_SIZE_M).toFixed(1)} ${(pos.y * BLOCK_SIZE_M).toFixed(1)} ${(pos.z * BLOCK_SIZE_M).toFixed(1)} m`,
      `chunks ${world.chunks.size}  meshes ${renderer.chunks.count}  quads ${renderer.chunks.quads}`,
      `draw calls ${info.render.calls}  triangles ${info.render.triangles}`,
      `jobs ${streamer.pendingChunks}  columns ${streamer.pendingColumns}  dirty ${streamer.dirtyCount}  failures ${streamer.failures}`,
    ].join('\n');
  }
});
loop.start();

/** For browser tests. */
(window as unknown as { __next: unknown }).__next = {
  world, streamer, renderer, pool, light,
  setTime(t: number) { dayTime = t; },
  get fps() { return fps; },
  get idle() { return placed && streamer.pendingChunks === 0 && streamer.pendingColumns === 0 && streamer.dirtyCount === 0; },
  setView(x: number, y: number, z: number, newYaw: number, newPitch: number) {
    pos.set(x, y, z);
    yaw = newYaw;
    pitch = newPitch;
    placed = true;
  },
};
