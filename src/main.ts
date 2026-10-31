import { AUTOSAVE_S, BLOCK_SIZE_M, CHUNK_SIZE, DAY_LENGTH_S, HORIZON_RECENTER_M, MAX_VIEW_CHUNKS, MIN_VIEW_CHUNKS, SIM_HZ, toCells } from './config';
import { Sounds } from './audio/sounds';
import { chunkKey, forEachChunkReading, localIndex, unpackChunkKey } from './core/coords';
import { FixedStepLoop } from './core/loop';
import { BLOCKS } from './engine/blocks';
import { LightEngine } from './engine/light';
import { Streamer } from './engine/streaming';
import { ALL_CONNECTED, visibleChunks } from './engine/visibility';
import { World } from './engine/world';
import { COLLISION } from './game/collision';
import { Input } from './game/input';
import { Play, type Mode } from './game/play';
import { Player } from './game/player';
import { Highlight } from './render/highlight';
import { Renderer } from './render/renderer';
import { Creatures } from './creatures/creatures';
import { CreatureMeshes } from './render/creatureMeshes';
import { DropMeshes } from './render/dropMeshes';
import { FrameGraph } from './ui/frameGraph';
import { mulberry32 } from './core/random';
import { Environment } from './sim/environment';
import { climateTemperature } from './sim/weather';
import { biomeByIndex } from './worldgen/biomes';
import { Simulation } from './sim/simulation';
import { drawUi, type UiModel } from './ui/app';
import { installTouchControls, wantsTouch } from './ui/touch';
import { exportWorld, importWorld } from './storage/archive';
import { Saver } from './storage/saver';
import { loadSettings, saveSettings } from './storage/settings';
import { IdbStore, MemoryStore, SAVE_VERSION, type WorldStore } from './storage/store';
import { WorkerPool } from './workers/pool';

/** Composition root of the new engine. Each system gets only what it needs; the order below is the update order. */
// Offline play once installed; production only, so development always loads current source modules.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register(new URL('sw.js', document.baseURI), { scope: './' })
    .catch((error) => console.warn('Offline support could not be enabled.', error));
}
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
const frameGraph = new FrameGraph();
document.body.append(frameGraph.canvas);
const uiRoot = document.querySelector<HTMLDivElement>('#ui')!;
const renderer = new Renderer(canvas, seed, viewChunks * CHUNK_SIZE);
const sounds = new Sounds();
canvas.addEventListener('click', () => sounds.unlock());
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
const play = new Play(world, (x, y, z, s) => setBlock(x, y, z, s, true), {
  sound: (name) => sounds.play(name),
  // Sleeping: only at night, and the night passes.
  sleep: () => {
    const night = env.clock.dayTime < 0.23 || env.clock.dayTime > 0.77;
    if (night) env.clock.advance(((1.25 - env.clock.dayTime) % 1) * DAY_LENGTH_S);
    return night;
  },
}, (params.get('mode') as Mode | null) ?? (existed ? 'survival' : 'creative'));
const creatures = new Creatures(world, mulberry32(seed ^ 0xc0ffee), {
  bite: (damage, by) => {
    if (play.mode === 'survival' && !play.survival.dead) {
      play.survival.hurt(damage, `killed by a ${by.toLowerCase()}`);
      sounds.play('break', 0.6);
      play.version++;
    }
  },
  sound: (name, volume) => sounds.play(name, volume),
});
creatures.load(saver.worldMeta.creatures);
play.creatures = creatures;
const creatureMeshes = new CreatureMeshes(renderer.scene);
const dropMeshes = new DropMeshes(renderer.scene, renderer.uniforms.tiles!.value as ConstructorParameters<typeof DropMeshes>[1]);
if (saver.worldMeta.play) play.load(saver.worldMeta.play);
else if (play.mode === 'creative') play.creativeHotbar();
/** Where the player starts: where they first stood, or their bed. */
let worldSpawn: [number, number, number] | null = null;
const env = new Environment(seed, Number(params.get('time') ?? saver.worldMeta.dayTime),
  Number(params.get('year') ?? saver.worldMeta.yearTime ?? 0), () => sounds.play('thunder'));

function save(): Promise<void> {
  const b = player.body;
  return saver.save(world, {
    dayTime: env.clock.dayTime, yearTime: env.clock.yearTime, play: play.save(), creatures: creatures.save(), ticks: simulation.ticks.save(), simTick: simulation.ticks.now, player: { x: b.x, y: b.y, z: b.z, yaw: player.yaw, pitch: player.pitch, flying: player.flying },
  }).catch((err) => console.error('Saving failed:', err));
}
setInterval(() => void save(), AUTOSAVE_S * 1000);
addEventListener('pagehide', () => void save());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void save();
});

let walked = 0, wasWet = false;
function update(dt: number): void {
  env.tick(dt);
  if (!placed) {
    const ground = world.surfaceAt(Math.floor(player.body.x), Math.floor(player.body.z));
    if (ground === undefined) return;
    player.body.y = ground + 1;
    placed = true;
  }
  worldSpawn ??= [player.body.x, player.body.y, player.body.z];
  // Physics waits for the ground under the player to load.
  if (!world.isLoaded(Math.floor(player.body.x), Math.floor(player.body.y), Math.floor(player.body.z))) return;
  const before = { x: player.body.x, z: player.body.z };
  const active = input.playing && play.screen === 'none' && !play.survival.dead;
  if (play.mode === 'survival') player.flying = false;
  else if (!active) input.consume('fly');
  const falling = -player.body.vy;
  player.update(dt, active ? input : idleInput, boxAt, waterAt);
  if (active) play.update(dt, input, player);
  play.tickFurnaces(dt);
  creatures.update(dt, { player: player.body, survival: play.mode === 'survival', day: env.atmosphere.sun[1] > -0.05, boxAt, waterAt });
  if (play.drops.update(dt, boxAt, play.survival.dead ? null : player.body, play.inventory)) play.version++;
  if (play.mode === 'survival' && !play.survival.dead) {
    if (player.body.onGround && falling > 0 && player.submerged < 0.2) play.survival.land(falling * BLOCK_SIZE_M);
    const eye = world.get(Math.floor(player.body.x), Math.floor(player.eyeY), Math.floor(player.body.z));
    const feet = world.get(Math.floor(player.body.x), Math.floor(player.body.y + 0.2), Math.floor(player.body.z));
    play.survival.update(dt, {
      sprinting: input.sprint && player.body.onGround, headInWater: waterAt(Math.floor(player.body.x), Math.floor(player.eyeY), Math.floor(player.body.z)),
      inLava: BLOCKS.type(eye).key.endsWith('lava') || BLOCKS.type(feet).key.endsWith('lava'),
    });
    if (play.survival.dead) {
      play.dropAll();
      input.stop();
      play.version++;
    }
  }
  if (player.body.onGround && !player.flying) {
    walked += Math.hypot(player.body.x - before.x, player.body.z - before.z);
    if (walked > toCells(1.8)) {
      walked = 0;
      sounds.play('step');
    }
  }
  const wet = player.submerged > 0.3;
  if (wet && !wasWet) sounds.play('splash');
  wasWet = wet;
  simAccumulator += dt;
  while (simAccumulator >= 1 / SIM_HZ) {
    simAccumulator -= 1 / SIM_HZ;
    simulation.step(player.body.x, player.body.z);
  }
}
let simAccumulator = 0;

/** The player's controls while a screen or menu is open: nothing pressed. */
const idleInput = Object.assign(Object.create(Input.prototype) as Input, {
  moveX: 0, moveZ: 0, jump: false, sprint: false, descend: false, consume: () => false,
});

function respawn(): void {
  play.inventory.clear();
  play.survival.reset();
  const at = play.spawn ?? worldSpawn ?? [0.5, NaN, 0.5];
  Object.assign(player.body, { x: at[0], y: at[1], z: at[2], vx: 0, vy: 0, vz: 0 });
  if (!Number.isFinite(at[1])) placed = false;
  play.version++;
  input.start();
}

let debugText = true;
function handleActions(): void {
  if (input.consume('inventory')) {
    if (play.screen !== 'none') {
      play.closeScreen();
      input.start();
    } else if (input.playing) {
      play.openScreen('inventory', 2);
      input.stop();
    }
  }
  if (input.consume('debug')) {
    debugText = !debugText;
    overlay.style.display = frameGraph.canvas.style.display = debugText ? '' : 'none';
  }
  if (input.consume('time')) env.clock.advance(DAY_LENGTH_S / 24);
  const up = input.consume('viewUp'), down = input.consume('viewDown');
  if (up || down) {
    viewChunks = Math.max(MIN_VIEW_CHUNKS, Math.min(MAX_VIEW_CHUNKS, viewChunks + (up ? 2 : -2)));
    streamer.viewChunks = viewChunks;
    streamer.replan();
    renderer.setViewDistance(viewChunks * CHUNK_SIZE);
    saveSettings({ ...settings, viewChunks });
  }
}

let worlds: Awaited<ReturnType<WorldStore['listWorlds']>> = [];
const ui: UiModel = {
  play, settings, worldName, worlds,
  get paused() { return !input.playing && placed; },
  get dead() { return play.survival.dead; },
  resume: () => {
    input.start();
    redraw();
  },
  respawn,
  changeSettings(s) {
    Object.assign(settings, s);
    saveSettings(settings);
    if (s.viewChunks !== viewChunks) {
      viewChunks = s.viewChunks;
      streamer.viewChunks = viewChunks;
      streamer.replan();
      renderer.setViewDistance(viewChunks * CHUNK_SIZE);
    }
    renderer.camera.fov = s.fov;
    renderer.camera.updateProjectionMatrix();
    input.sensitivity = s.mouseSensitivity;
    redraw();
  },
  async openWorld(name, create) {
    await save();
    const q = new URLSearchParams({ world: name, view: String(viewChunks) });
    if (create) Object.entries({ new: '1', seed: String(create.seed), mode: create.mode }).forEach(([k, v]) => q.set(k, v));
    location.search = q.toString();
  },
  async deleteWorld(name) {
    await store.deleteWorld(name);
    ui.refreshWorlds();
if (wantsTouch()) {
  installTouchControls(document.body, input, () => {
    input.stop();
    ui.refreshWorlds();
  });
}
  },
  async exportWorld(name) {
    if (name === worldName) await save();
    const text = await exportWorld(store, name);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = `${name}.world.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  },
  async importWorld(file) {
    try {
      const name = await importWorld(store, await file.text());
      alert(`Imported world '${name}'.`);
    } catch (err) {
      alert(`Could not import: ${(err as Error).message}`);
    }
    ui.refreshWorlds();
  },
  refreshWorlds() {
    void store.listWorlds().then((list) => {
      ui.worlds = list.sort((a, b) => b.lastPlayed - a.lastPlayed);
      redraw();
    });
  },
};
input.canLock = () => play.screen === 'none' && !play.survival.dead;
document.addEventListener('pointerlockchange', () => {
  if (!input.locked) ui.refreshWorlds();
  redraw();
});
function redraw(): void {
  drawUi(uiRoot, ui);
}
ui.refreshWorlds();

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
  // The walk stays between the camera (or the highest terrain) and a fixed depth below it.
  let top = cy;
  for (const column of world.columns.values()) top = Math.max(top, Math.floor(column.maxTop / CHUNK_SIZE) + 1);
  const visible = visibleChunks(cx, cy, cz, viewChunks + 1, cy - 64, top, (k) => {
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

/** Biome, temperature and light where the player stands, for the debug text. */
function describeHere(): string {
  const x = Math.floor(player.body.x), y = Math.floor(player.eyeY), z = Math.floor(player.body.z);
  const column = world.column(x >> 4, z >> 4);
  const chunk = world.chunkAt(x, y, z);
  if (!column || !chunk) return '';
  const i = ((z & 15) << 4) | (x & 15), cell = localIndex(x & 15, y & 15, z & 15);
  const temp = climateTemperature(column.climate[i]!) + (env.sample?.seasonC ?? 0);
  return `${biomeByIndex(column.biome[i]!).name}  ${temp.toFixed(0)} °C  light sky ${chunk.skyLight(cell)} block ${chunk.blockLight(cell)}`;
}

/** Far terrain: rebuilt in a worker when the player has moved far enough from where it was built. */
let horizonPending = false;
function updateHorizon(x: number, z: number): void {
  const h = renderer.horizon;
  if (horizonPending || (h.center && Math.hypot(x - h.center[0], z - h.center[1]) < toCells(HORIZON_RECENTER_M))) return;
  const worker = pool.leastBusy();
  if (worker < 0) return;
  horizonPending = true;
  const cx = Math.round(x), cz = Math.round(z);
  pool.run(worker, { type: 'horizon', x: cx, z: cz, radii: h.radii.slice(), segments: h.segments }).then((r) => {
    h.set(cx, cz, r.heights, r.colors);
  }).catch((err) => console.warn('Far terrain failed:', err)).finally(() => {
    horizonPending = false;
  });
}

let frames = 0, fps = 0, fpsTime = performance.now(), lastVersion = -1, lastUiDraw = 0;
/** Main-thread time of this frame's fixed steps, and when the previous frame started (for the F3 graph). */
let updateMs = 0, lastFrame = performance.now();
const timedUpdate = (dt: number) => {
  const t = performance.now();
  update(dt);
  updateMs += performance.now() - t;
};
const loop = new FixedStepLoop(1 / 60, 0.25, timedUpdate, (_alpha, frameDt) => {
  const now = performance.now();
  input.poll(frameDt);
  const [dyaw, dpitch] = input.takeLook();
  player.yaw += dyaw;
  player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch + dpitch));
  handleActions();
  streamer.update(player.body.x, player.body.y, player.body.z, now);
  renderer.camera.position.set(player.body.x, player.eyeY, player.body.z);
  renderer.camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  highlight.set(play.target, play.breaking);
  const daylight = renderer.uniforms.daylight!.value as number;
  /** Brightness (0..1) of a cell for things drawn outside the terrain. */
  const lightAt = (cx: number, cy: number, cz: number) => {
    const x = Math.floor(cx), y = Math.floor(cy), z = Math.floor(cz);
    const chunk = world.chunkAt(x, y, z);
    if (!chunk) return daylight;
    const i = localIndex(x & 15, y & 15, z & 15), sky = chunk.skyLight(i) / 15, block = chunk.blockLight(i) / 15;
    return 0.07 + 0.93 * Math.max(sky * sky * daylight, block * block);
  };
  creatureMeshes.update(creatures.list, (c) => lightAt(c.body.x, c.body.y + c.body.height * 0.6, c.body.z));
  dropMeshes.update(play.drops.list, now / 1000, (d) => lightAt(d.body.x, d.body.y + d.body.height / 2, d.body.z));
  cull();
  const cam = renderer.camera.position;
  renderer.setAtmosphere(env.frame(frameDt, cam.x, cam.y, cam.z, world));
  const sample = env.sample;
  simulation.weather = sample && { precipitation: sample.precipitation, seasonC: sample.seasonC };
  renderer.clouds.update(cam.x, cam.z, frameDt, sample?.windSpeed ?? 3, env.atmosphere.cloudCover,
    (renderer.uniforms.daylight!.value as number) * (1 - 0.4 * env.atmosphere.cloudCover));
  renderer.precipitation.update(cam.x, cam.y, cam.z, frameDt, env.atmosphere.underground > 0.5 ? 'none' : env.falling,
    env.atmosphere.cloudCover, sample?.windSpeed ?? 3, (x, z) => world.column(x >> 4, z >> 4)?.skyTop[((z & 15) << 4) | (x & 15)] ?? -Infinity);
  updateHorizon(cam.x, cam.z);
  renderer.render(now / 1000);
  // The UI redraws when the play state changes, and a few times a second for the survival bars.
  if (play.version !== lastVersion || (play.mode === 'survival' && now - lastUiDraw > 250)) {
    lastVersion = play.version;
    lastUiDraw = now;
    redraw();
  }
  frameGraph.push(now - lastFrame, updateMs + performance.now() - now);
  lastFrame = now;
  updateMs = 0;
  if (debugText) frameGraph.draw();
  frames++;
  if (now - fpsTime >= 500) {
    fps = Math.round((frames * 1000) / (now - fpsTime));
    frames = 0;
    fpsTime = now;
    const info = renderer.renderer.info;
    const m = (v: number) => (v * BLOCK_SIZE_M).toFixed(1);
    const b = player.body;
    overlay.textContent = [
      `${fps} fps  ${env.clock.season} day ${env.clock.day}  ${String(Math.floor(env.clock.dayTime * 24)).padStart(2, '0')}:${String(Math.floor((env.clock.dayTime * 1440) % 60)).padStart(2, '0')} [T]  ${env.sample?.storm ? 'storm' : env.sample?.precipitation ?? ''}  view ${viewChunks} chunks (${Math.round(viewChunks * CHUNK_SIZE * BLOCK_SIZE_M)} m) [+/-]`,
      `pos ${m(b.x)} ${m(b.y)} ${m(b.z)} m  ${player.flying ? 'flying' : b.onGround ? 'ground' : player.submerged > 0.05 ? 'swimming' : 'air'} [F]`,
      `chunks ${world.chunks.size}  meshes ${renderer.chunks.count}  quads ${renderer.chunks.quads}  culled ${culled}  draw calls ${info.render.calls}`,
      `world ${worldName} (seed ${seed})${saver.conflict ? '  NOT SAVING: opened in another tab' : ''}`,
      describeHere(),
      `creatures ${creatures.list.length}  block updates ${simulation.ticks.size} (${simulation.ticks.dormantCount} waiting)  jobs ${streamer.pendingChunks}  columns ${streamer.pendingColumns}  dirty ${streamer.dirtyCount}  failures ${streamer.failures}`,
      frameGraph.summary(),
      `${play.mode} [F3 hides this]`,
    ].join('\n');
  }
});
loop.start();

/** For browser tests. */
(window as unknown as { __game: unknown }).__game = {
  world, streamer, renderer, pool, light, player, play, setBlock, creatures, blocks: BLOCKS, saver, save, seed, simulation,
  get fps() { return fps; },
  get idle() { return placed && streamer.idle; },
  env,
  setTime(t: number) { env.clock.dayTime = t; },
  setView(x: number, y: number, z: number, yaw: number, pitch: number) {
    Object.assign(player.body, { x, y, z, vx: 0, vy: 0, vz: 0 });
    player.yaw = yaw;
    player.pitch = pitch;
    placed = true;
  },
};
