import { AUTOSAVE_S, BLOCK_SIZE_M, CHUNK_SIZE, DAY_LENGTH_S, MAX_VIEW_CHUNKS, MIN_VIEW_CHUNKS, SIM_HZ, toCells } from './config';
import { chunkKey, forEachChunkReading, unpackChunkKey } from './core/coords';
import { FixedStepLoop } from './core/loop';
import { BLOCKS } from './engine/blocks';
import { LightEngine } from './engine/light';
import { Streamer } from './engine/streaming';
import { ALL_CONNECTED, visibleChunks } from './engine/visibility';
import { World } from './engine/world';
import { COLLISION } from './game/collision';
import { Input } from './game/input';
import { HOTBAR, Interaction } from './game/interaction';
import { Player } from './game/player';
import { Highlight } from './render/highlight';
import { Renderer } from './render/renderer';
import { Simulation } from './sim/simulation';
import { Saver } from './storage/saver';
import { loadSettings, saveSettings } from './storage/settings';
import { IdbStore, MemoryStore, SAVE_VERSION, type WorldStore } from './storage/store';
import { WorkerPool } from './workers/pool';

/** Composition root of the new engine. Each system gets only what it needs; the order below is the update order. */
const params = new URLSearchParams(location.search);
const settings = loadSettings();
let viewChunks = Math.max(MIN_VIEW_CHUNKS, Math.min(MAX_VIEW_CHUNKS, Number(params.get('view') ?? settings.viewChunks)));

// The world: `world` names it (default 'default'); `new=1` starts it over; `seed` only applies to a new world.
const worldName = params.get('world') ?? 'default';
let store: WorldStore;
try {
  store = await IdbStore.open();
} catch (err) {
  console.warn('IndexedDB is unavailable; this world will not be kept after the page closes.', err);
  store = new MemoryStore();
}
if (params.get('new') === '1') await store.deleteWorld(worldName);
const existed = (await store.getMeta(worldName)) !== undefined;
const saver = await Saver.open(store, {
  version: SAVE_VERSION, name: worldName, seed: Number(params.get('seed') ?? Math.floor(Math.random() * 2 ** 31)),
  created: Date.now(), lastPlayed: Date.now(), revision: 0, dayTime: 0.35,
  player: { x: 0.5, y: NaN, z: 0.5, yaw: 0, pitch: -0.2, flying: false },
});
const seed = saver.worldMeta.seed;

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const overlay = document.querySelector<HTMLDivElement>('#overlay')!;
const hotbar = document.querySelector<HTMLDivElement>('#hotbar')!;
const renderer = new Renderer(canvas);
const world = new World();
const pool = new WorkerPool(seed);
const light = new LightEngine(world);
const streamer = new Streamer(world, pool, renderer.chunks, light, viewChunks);
streamer.saves = saver;
const input = new Input(canvas, settings.mouseSensitivity);
renderer.camera.fov = settings.fov;
renderer.camera.updateProjectionMatrix();
const highlight = new Highlight(renderer.scene);
renderer.setViewDistance(viewChunks * CHUNK_SIZE);

const WATER = BLOCKS.typeIndex[BLOCKS.state('water')]!, FLOWING = BLOCKS.typeIndex[BLOCKS.state('flowing_water')]!;
const boxAt = (x: number, y: number, z: number) => COLLISION[world.get(x, y, z)]!;
const waterAt = (x: number, y: number, z: number) => {
  const t = BLOCKS.typeIndex[world.get(x, y, z)];
  return t === WATER || t === FLOWING;
};

/**
 * The one way the game changes a cell: data, then light, then the meshes that read it, then the block updates it
 * causes. The player's edits are `urgent`: their meshes go before everything else.
 */
function setBlock(x: number, y: number, z: number, state: number, urgent = false): void {
  const previous = world.get(x, y, z);
  if (!world.set(x, y, z, state)) return;
  light.onBlockChanged(x, y, z, previous);
  if (urgent) streamer.markCell(x, y, z);
  else forEachChunkReading(x, y, z, (cx, cy, cz) => streamer.markChunks([chunkKey(cx, cy, cz)]));
  streamer.markChunks(light.drainChanged(), urgent);
  simulation.onCellChanged(x, y, z, previous);
}
const simulation = new Simulation(world, setBlock, seed);
simulation.ticks.now = saver.worldMeta.simTick ?? 0;
simulation.ticks.load(saver.worldMeta.ticks);
streamer.onLoad = (c) => simulation.ticks.resume(c.cx, c.cy, c.cz);
streamer.onUnload = (c) => simulation.ticks.park(c.cx, c.cy, c.cz);

const saved = saver.worldMeta.player;
const usePosition = params.has('x') || !existed;
const player = new Player(
  usePosition ? Number(params.get('x') ?? 0.5) : saved.x,
  usePosition ? Number(params.get('y') ?? NaN) : saved.y,
  usePosition ? Number(params.get('z') ?? 0.5) : saved.z,
);
player.yaw = usePosition ? Number(params.get('yaw') ?? 0) : saved.yaw;
player.pitch = usePosition ? Number(params.get('pitch') ?? -0.2) : saved.pitch;
player.flying = usePosition ? params.get('fly') === '1' : saved.flying;
let placed = Number.isFinite(player.body.y);
if (!placed) player.body.y = toCells(60);
const interaction = new Interaction(world, (x, y, z, s) => setBlock(x, y, z, s, true));
/** Time of day in [0, 1): 0 is midnight, 0.5 noon. */
let dayTime = Number(params.get('time') ?? saver.worldMeta.dayTime);

function save(): Promise<void> {
  const b = player.body;
  return saver.save(world, {
    dayTime, ticks: simulation.ticks.save(), simTick: simulation.ticks.now, player: { x: b.x, y: b.y, z: b.z, yaw: player.yaw, pitch: player.pitch, flying: player.flying },
  }).catch((err) => console.error('Saving failed:', err));
}
setInterval(() => void save(), AUTOSAVE_S * 1000);
addEventListener('pagehide', () => void save());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void save();
});

function update(dt: number): void {
  dayTime = (dayTime + dt / DAY_LENGTH_S) % 1;
  if (!placed) {
    const ground = world.surfaceAt(Math.floor(player.body.x), Math.floor(player.body.z));
    if (ground === undefined) return;
    player.body.y = ground + 1;
    placed = true;
  }
  // Physics waits for the ground under the player to load.
  if (!world.isLoaded(Math.floor(player.body.x), Math.floor(player.body.y), Math.floor(player.body.z))) return;
  player.update(dt, input, boxAt, waterAt);
  interaction.update(dt, input, player);
  simAccumulator += dt;
  while (simAccumulator >= 1 / SIM_HZ) {
    simAccumulator -= 1 / SIM_HZ;
    simulation.step(player.body.x, player.body.z);
  }
}
let simAccumulator = 0;

function handleActions(): void {
  if (input.consume('time')) dayTime = (dayTime + 1 / 24) % 1;
  const up = input.consume('viewUp'), down = input.consume('viewDown');
  if (up || down) {
    viewChunks = Math.max(MIN_VIEW_CHUNKS, Math.min(MAX_VIEW_CHUNKS, viewChunks + (up ? 2 : -2)));
    streamer.viewChunks = viewChunks;
    streamer.replan();
    renderer.setViewDistance(viewChunks * CHUNK_SIZE);
    saveSettings({ ...settings, viewChunks });
  }
}

function drawHotbar(): void {
  hotbar.textContent = HOTBAR.map((key, i) => (i === interaction.slot ? `[${i + 1} ${key}]` : ` ${i + 1} ${key} `)).join(' ');
}

/** Cave culling: recomputed when the camera changes chunk or new meshes arrive, at most every few frames. */
let cullKey = '', cullFrame = 0;
const OPAQUE_UNIFORM = 0;
function cull(): void {
  const c = renderer.camera.position;
  const cx = Math.floor(c.x / CHUNK_SIZE), cy = Math.floor(c.y / CHUNK_SIZE), cz = Math.floor(c.z / CHUNK_SIZE);
  const key = `${cx},${cy},${cz},${streamer.meshesApplied},${viewChunks}`;
  if (key === cullKey || ++cullFrame < 6) return;
  cullKey = key;
  cullFrame = 0;
  const visible = visibleChunks(cx, cy, cz, viewChunks + 1, (k) => {
    const chunk = world.chunks.get(k);
    if (!chunk) {
      // Unloaded space is open sky above its column's highest generated cell, and unknown (closed) below it.
      const [x, y, z] = unpackChunkKey(k);
      const column = world.column(x!, z!);
      return column && y! * CHUNK_SIZE > column.maxTop ? ALL_CONNECTED : 0;
    }
    if (chunk.uniform) return BLOCKS.isOpaque(chunk.get(0)) ? OPAQUE_UNIFORM : ALL_CONNECTED;
    return streamer.visibility.get(k) ?? ALL_CONNECTED;
  });
  renderer.chunks.applyVisibility(visible);
  culled = renderer.chunks.count - [...renderer.chunks.keys()].filter((k) => visible.has(k)).length;
}
let culled = 0;

let frames = 0, fps = 0, fpsTime = performance.now(), lastSlot = -1;
const loop = new FixedStepLoop(1 / 60, 0.25, update, (_alpha, frameDt) => {
  const now = performance.now();
  input.poll(frameDt);
  const [dyaw, dpitch] = input.takeLook();
  player.yaw += dyaw;
  player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch + dpitch));
  handleActions();
  streamer.update(player.body.x, player.body.y, player.body.z, now);
  renderer.camera.position.set(player.body.x, player.eyeY, player.body.z);
  renderer.camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  highlight.set(interaction.target);
  cull();
  renderer.setDayTime(dayTime);
  renderer.render(now / 1000);
  if (interaction.slot !== lastSlot) {
    lastSlot = interaction.slot;
    drawHotbar();
  }
  frames++;
  if (now - fpsTime >= 500) {
    fps = Math.round((frames * 1000) / (now - fpsTime));
    frames = 0;
    fpsTime = now;
    const info = renderer.renderer.info;
    const m = (v: number) => (v * BLOCK_SIZE_M).toFixed(1);
    const b = player.body;
    overlay.textContent = [
      `${fps} fps  time ${String(Math.floor(dayTime * 24)).padStart(2, '0')}:${String(Math.floor((dayTime * 1440) % 60)).padStart(2, '0')} [T]  view ${viewChunks} chunks (${Math.round(viewChunks * CHUNK_SIZE * BLOCK_SIZE_M)} m) [+/-]`,
      `pos ${m(b.x)} ${m(b.y)} ${m(b.z)} m  ${player.flying ? 'flying' : b.onGround ? 'ground' : player.submerged > 0.05 ? 'swimming' : 'air'} [F]`,
      `chunks ${world.chunks.size}  meshes ${renderer.chunks.count}  quads ${renderer.chunks.quads}  culled ${culled}  draw calls ${info.render.calls}`,
      `world ${worldName} (seed ${seed})${saver.conflict ? '  NOT SAVING: opened in another tab' : ''}`,
      `block updates ${simulation.ticks.size} (${simulation.ticks.dormantCount} waiting)  jobs ${streamer.pendingChunks}  columns ${streamer.pendingColumns}  dirty ${streamer.dirtyCount}  failures ${streamer.failures}`,
      input.locked ? '' : 'click to play: WASD, space, shift, ctrl sprint, F fly, mouse break/place, 1-9 / wheel',
    ].join('\n');
  }
});
loop.start();

/** For browser tests. */
(window as unknown as { __next: unknown }).__next = {
  world, streamer, renderer, pool, light, player, interaction, setBlock, blocks: BLOCKS, saver, save, seed, simulation,
  get fps() { return fps; },
  get idle() { return placed && streamer.idle; },
  setTime(t: number) { dayTime = t; },
  setView(x: number, y: number, z: number, yaw: number, pitch: number) {
    Object.assign(player.body, { x, y, z, vx: 0, vy: 0, vz: 0 });
    player.yaw = yaw;
    player.pitch = pitch;
    placed = true;
  },
};
