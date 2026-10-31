import { NIGHT_BEFORE, AUTOSAVE_S, BLOCK_SIZE_M, CAVE_AIR_C, CHUNK_SIZE, DAY_LENGTH_S, DIFFICULTY, HEAT_REACH_M, HEAT_SOURCES_C, cells, type Difficulty, HORIZON_RECENTER_M, MAX_VIEW_CHUNKS, MIN_VIEW_CHUNKS, SIM_HZ, toCells } from './config';
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
import { feltTemperature } from './game/bodyTemperature';
import { drawTitle, drawUi, type UiModel, type WorldsModel } from './ui/app';
import { worldActions } from './ui/worldActions';
import { PadMenu } from './ui/padMenu';
import { bearing, Minimap } from './ui/minimap';
import { installTouchControls, wantsTouch } from './ui/touch';
import { Saver } from './storage/saver';
import { keyLabel, loadSettings, saveSettings } from './storage/settings';
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
const uiRoot = document.querySelector<HTMLDivElement>('#ui')!;

// No URL parameters: the title screen. Choosing a world loads the page again with its name, so this never returns.
if (location.search === '') {
  document.body.classList.add('title');
  uiRoot.style.setProperty('zoom', String(settings.guiScale));
  const refresh = () => void store.listWorlds().then((list) => {
    title.worlds = list.sort((a, b) => b.lastPlayed - a.lastPlayed);
    drawTitle(uiRoot, title);
  });
  const title: WorldsModel = {
    worlds: [], worldName: null, settings,
    changeSettings(s) {
      Object.assign(settings, s);
      saveSettings(settings);
      uiRoot.style.setProperty('zoom', String(settings.guiScale));
      drawTitle(uiRoot, title);
    },
    ...worldActions(store, { beforeLeave: async () => undefined, changed: refresh }),
  };
  refresh();
  const pad = new PadMenu(uiRoot, { back: () => undefined, start: () => undefined });
  const frame = (t: number) => {
    pad.poll(t);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  await new Promise<never>(() => undefined);
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
const renderer = new Renderer(canvas, seed, viewChunks * CHUNK_SIZE);
const sounds = new Sounds();
canvas.addEventListener('click', () => sounds.unlock());
const world = new World();
const pool = new WorkerPool(seed);
const light = new LightEngine(world);
const streamer = new Streamer(world, pool, renderer.chunks, light, viewChunks);
streamer.saves = saver;
const input = new Input(canvas, settings.mouseSensitivity, settings.keys);
/** Settings that take effect at once: field of view, mouse, keys, volume and GUI size. */
function applySettings(): void {
  renderer.camera.fov = settings.fov;
  renderer.camera.updateProjectionMatrix();
  input.sensitivity = settings.mouseSensitivity;
  input.invertY = settings.invertY;
  input.bindings = settings.keys;
  sounds.volume = settings.effectsVolume;
  uiRoot.style.setProperty('zoom', String(settings.guiScale));
}
applySettings();
const highlight = new Highlight(renderer.scene);
renderer.setViewDistance(viewChunks * CHUNK_SIZE);

const WATER = BLOCKS.typeIndex[BLOCKS.state('water')]!, FLOWING = BLOCKS.typeIndex[BLOCKS.state('flowing_water')]!;
const LADDER = BLOCKS.typeIndex[BLOCKS.state('ladder')]!, CAMPFIRE = BLOCKS.state('campfire'), ARROW = BLOCKS.state('arrow');
const climbAt = (x: number, y: number, z: number) => BLOCKS.typeIndex[world.get(x, y, z)] === LADDER;
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
// A new world without a start position in the URL starts on dry, open, level ground near the origin.
const start = !params.has('x') && !existed
  ? (await pool.run(pool.leastBusy(), { type: 'spawn', x: 0, z: 0 }).catch(() => ({ at: [0.5, NaN, 0.5] as const }))).at
  : [Number(params.get('x') ?? 0.5), Number(params.get('y') ?? NaN), Number(params.get('z') ?? 0.5)];
const player = new Player(...(usePosition ? start : [saved.x, saved.y, saved.z]) as [number, number, number]);
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
  fertilise: (x, y, z) => simulation.fertilise(x, y, z),
}, (params.get('mode') as Mode | null) ?? 'survival');
const urlDifficulty = params.get('difficulty');
if (urlDifficulty && urlDifficulty in DIFFICULTY) play.difficulty = urlDifficulty as Difficulty;
const creatures = new Creatures(world, mulberry32(seed ^ 0xc0ffee), {
  bite: (damage, by) => {
    if (play.mode === 'survival' && !play.survival.dead) {
      play.survival.hurt(play.protect(damage * DIFFICULTY[play.difficulty].damage), `killed by a ${by.toLowerCase()}`);
      sounds.play('break', 0.6);
      play.version++;
    }
  },
  sound: (name, volume) => sounds.play(name, volume),
  shoot: (c, x, y, z) => play.shootAtPlayer(x, y, z, player, c.species.attack),
  // Calls carry 32 m; pitch follows the species' voice.
  call: (c, kind) => {
    const near = 1 - Math.hypot(c.body.x - player.body.x, c.body.y - player.body.y, c.body.z - player.body.z) * BLOCK_SIZE_M / 32;
    if (near > 0) sounds.call(c.species.voice, kind, near);
  },
});
creatures.load(saver.worldMeta.creatures);
play.creatures = creatures;
const creatureMeshes = new CreatureMeshes(renderer.scene);
const dropMeshes = new DropMeshes(renderer.scene, renderer.uniforms.tiles!.value as ConstructorParameters<typeof DropMeshes>[1]);
play.seed = seed;
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

let walked = 0, wasWet = false, walkedTotal = 0, hintClock = 0, wasNight = false;

/** Heat felt from fires, lava, furnaces and torches around (x, y, z): the strongest, falling off with distance. */
const HEAT_BY_TYPE = BLOCKS.types.map((t) => HEAT_SOURCES_C[t.key] ?? 0);
const HEAT_CELLS = cells(HEAT_REACH_M);
function heatAround(x: number, y: number, z: number): number {
  let heat = 0;
  for (let dy = -HEAT_CELLS; dy <= HEAT_CELLS; dy++) for (let dz = -HEAT_CELLS; dz <= HEAT_CELLS; dz++) for (let dx = -HEAT_CELLS; dx <= HEAT_CELLS; dx++) {
    const c = HEAT_BY_TYPE[BLOCKS.typeIndex[world.get(x + dx, y + dy, z + dz)]!]!;
    if (c > 0) heat = Math.max(heat, c * (1 - Math.hypot(dx, dy, dz) / (HEAT_CELLS + 1)));
  }
  return heat;
}

/** The temperature the player feels, worked out twice a second; wet for a while after swimming or rain. */
let feltC = 20, exposureClock = 0, wetS = 0;
function updateExposure(dt: number): void {
  const x = Math.floor(player.body.x), y = Math.floor(player.eyeY), z = Math.floor(player.body.z);
  const column = world.column(x >> 4, z >> 4), chunk = world.chunkAt(x, y, z);
  if (!column || !chunk) return;
  const i = ((z & 15) << 4) | (x & 15);
  const sheltered = column.skyTop[i]! > y;
  if (player.submerged > 0.05 || (!sheltered && env.falling === 'rain')) wetS = 30;
  else wetS = Math.max(0, wetS - dt);
  const underground = chunk.skyLight(localIndex(x & 15, y & 15, z & 15)) === 0 && y < column.surface[i]! - 8;
  const airC = underground ? CAVE_AIR_C : climateTemperature(column.climate[i]!) + (env.sample?.seasonC ?? 0);
  const night = env.clock.dayTime > 1 - NIGHT_BEFORE || env.clock.dayTime < NIGHT_BEFORE;
  feltC = feltTemperature({
    airC, night: night && !underground, sheltered: sheltered || underground, wet: wetS > 0, windM_S: env.sample?.windSpeed ?? 3,
    heatC: heatAround(x, y, z), insulationC: play.warmth,
  });
}
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
  player.update(dt, active ? input : idleInput, boxAt, waterAt, climbAt);
  if (active) play.update(dt, input, player);
  play.tickFurnaces(dt);
  play.tickCampfires(dt);
  play.tickProjectiles(dt, boxAt, player);
  creatures.update(dt, {
    player: player.body, survival: play.mode === 'survival', day: env.atmosphere.sun[1] > -0.05, hostiles: DIFFICULTY[play.difficulty].hostiles, boxAt, waterAt,
  });
  if (play.drops.update(dt, boxAt, play.survival.dead ? null : player.body, play.inventory)) play.version++;
  if (play.mode === 'survival' && !play.survival.dead) {
    if (player.body.onGround && falling > 0 && player.submerged < 0.2) play.survival.land(falling * BLOCK_SIZE_M);
    const eye = world.get(Math.floor(player.body.x), Math.floor(player.eyeY), Math.floor(player.body.z));
    const feet = world.get(Math.floor(player.body.x), Math.floor(player.body.y + 0.2), Math.floor(player.body.z));
    exposureClock += dt;
    if (exposureClock >= 0.5) {
      updateExposure(exposureClock);
      exposureClock = 0;
    }
    play.survival.update(dt, {
      feltC, sprinting: input.sprint && player.body.onGround, inWater: player.submerged > 0.3,
      inFire: feet === CAMPFIRE || world.get(Math.floor(player.body.x), Math.floor(player.body.y - 0.05), Math.floor(player.body.z)) === CAMPFIRE, headInWater: waterAt(Math.floor(player.body.x), Math.floor(player.eyeY), Math.floor(player.body.z)),
      inLava: BLOCKS.type(eye).key.endsWith('lava') || BLOCKS.type(feet).key.endsWith('lava'),
    });
    if (play.survival.dead) {
      play.stats.deaths++;
      play.dropAll();
      input.stop();
      play.version++;
    }
  }
  if (player.body.onGround && !player.flying) {
    const step = Math.hypot(player.body.x - before.x, player.body.z - before.z);
    walked += step;
    walkedTotal += step * BLOCK_SIZE_M;
    if (play.mode === 'survival') play.stats.walkedM += step * BLOCK_SIZE_M;
    if (walked > toCells(1.8)) {
      walked = 0;
      sounds.play('step');
    }
  }
  hintClock += dt;
  if (hintClock >= 0.25 && play.mode === 'survival' && !play.survival.dead) {
    // The journal: a day survived at each dawn, the deepest point, biomes walked in, then milestones.
    const night = env.clock.dayTime > 1 - NIGHT_BEFORE || env.clock.dayTime < NIGHT_BEFORE;
    if (wasNight && !night) play.stats.days++;
    wasNight = night;
    play.deepestM = Math.min(play.deepestM, player.body.y * BLOCK_SIZE_M);
    const column = world.column(Math.floor(player.body.x) >> 4, Math.floor(player.body.z) >> 4);
    if (column) play.biomesSeen.add(column.biome[((Math.floor(player.body.z) & 15) << 4) | (Math.floor(player.body.x) & 15)]!);
    play.checkJournal();
  }
  if (hintClock >= 0.25) {
    if (play.mode === 'survival' && settings.hints && !play.survival.dead) {
      const changed = play.hints.update(hintClock, {
        walkedM: walkedTotal, has: (k) => play.hasItem(k), screen: play.screen, craftSize: play.craftSize,
        night: env.clock.dayTime > 1 - NIGHT_BEFORE || env.clock.dayTime < NIGHT_BEFORE, hunger: play.survival.hunger,
      }, (b) => keyLabel(settings.keys[b]));
      if (changed) play.version++;
    } else if (play.hints.text) {
      play.hints.text = '';
      play.version++;
    }
    hintClock = 0;
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
  // The beacon was lit: free the pointer for the ending screen.
  if (play.beaconLit && !play.endingSeen && input.playing) input.stop();
  if (input.consume('pause') && input.playing) {
    input.stop();
    ui.refreshWorlds();
  }
  if (input.consume('hint')) {
    play.hints.dismiss();
    play.version++;
  }
  const up = input.consume('viewUp'), down = input.consume('viewDown');
  if (up || down) {
    viewChunks = Math.max(MIN_VIEW_CHUNKS, Math.min(MAX_VIEW_CHUNKS, viewChunks + (up ? 2 : -2)));
    streamer.viewChunks = viewChunks;
    streamer.replan();
    renderer.setViewDistance(viewChunks * CHUNK_SIZE);
    saveSettings({ ...settings, viewChunks });
  }
}

const actions = worldActions(store, { beforeLeave: save, changed: () => ui.refreshWorlds() });
const ui: UiModel & { refreshWorlds(): void } = {
  play, settings, worldName, worlds: [],
  get paused() { return !input.playing && placed; },
  get dead() { return play.survival.dead; },
  get loading() { return loadingText(); },
  get ending() { return play.beaconLit && !play.endingSeen; },
  closeEnding() {
    play.endingSeen = true;
    input.start();
    redraw();
  },
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
    applySettings();
    redraw();
  },
  setDifficulty(d) {
    play.difficulty = d;
    redraw();
  },
  quitToTitle() {
    void save().then(() => (location.search = ''));
  },
  openWorld: (name, create) => void actions.openWorld(name, create),
  deleteWorld: (name) => void actions.deleteWorld(name),
  async exportWorld(name) {
    if (name === worldName) await save();
    await actions.exportWorld(name);
  },
  importWorld: (file) => void actions.importWorld(file),
  refreshWorlds() {
    void store.listWorlds().then((list) => {
      ui.worlds = list.sort((a, b) => b.lastPlayed - a.lastPlayed);
      redraw();
    });
  },
};
if (wantsTouch()) {
  installTouchControls(document.body, input, () => {
    input.stop();
    ui.refreshWorlds();
  });
}

/** Until the chunks around the player are meshed: a line of progress for the loading screen; then null for good. */
let ready = false;
function loadingText(): string | null {
  if (ready) return null;
  const [near, nearWanted] = streamer.progress(2), [all, wanted] = streamer.progress();
  if (placed && (streamer.idle || (nearWanted > 0 && near === nearWanted))) {
    ready = true;
    return null;
  }
  return `Building the world… ${wanted ? Math.floor((100 * all) / wanted) : 0}%`;
}
input.canLock = () => play.screen === 'none' && !play.survival.dead;
document.addEventListener('pointerlockchange', () => {
  if (!input.locked) ui.refreshWorlds();
  redraw();
});
/** Gamepad in menus: B closes a screen or resumes, Start resumes. */
const padMenu = new PadMenu(uiRoot, {
  back() {
    if (play.screen !== 'none') {
      play.closeScreen();
      input.start();
    } else if (ui.paused && !ui.dead) ui.resume();
  },
  start() {
    if (ui.paused && !ui.dead && play.screen === 'none') ui.resume();
  },
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

const hurtFlash = document.querySelector<HTMLDivElement>('#hurt')!, burnGlow = document.querySelector<HTMLDivElement>('#burn')!;
let lastHealth = play.survival.health, kick = 0;
const compass = document.querySelector<HTMLDivElement>('#compass')!, minimap = new Minimap();
document.body.append(minimap.canvas);
let mapClock = 0;
/** Held compass: a needle to the bed (or where the world began). Held map: the land around, redrawn a few times a second. */
function updateHeldTools(now: number): void {
  const key = play.held ? BLOCKS.type(play.held.state).key : '';
  const target = play.spawn ?? worldSpawn;
  compass.style.display = key === 'compass' && target ? '' : 'none';
  if (key === 'compass' && target) compass.style.transform = `rotate(${bearing(player.body.x, player.body.z, player.yaw, target[0], target[2])}rad)`;
  minimap.canvas.style.display = key === 'map' ? 'block' : 'none';
  if (key === 'map' && now - mapClock > 300) {
    mapClock = now;
    minimap.draw(world, player.body.x, player.body.z, player.yaw);
  }
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
  if (!input.playing) padMenu.poll(now);
  const [dyaw, dpitch] = input.takeLook();
  player.yaw += dyaw;
  player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch + dpitch));
  handleActions();
  streamer.update(player.body.x, player.body.y, player.body.z, now);
  renderer.camera.position.set(player.body.x, player.eyeY, player.body.z);
  // Taking damage: a red flash, a hurt sound and a kick of the view. Slow harm (burning, cold) flashes every half point.
  const health = play.survival.health, lost = lastHealth - health;
  if (lost >= 0.5 && play.mode === 'survival') {
    hurtFlash.style.transition = 'none';
    hurtFlash.style.opacity = String(Math.min(0.6, 0.15 + lost * 0.08));
    void hurtFlash.offsetWidth;
    hurtFlash.style.transition = 'opacity 0.5s';
    hurtFlash.style.opacity = '0';
    sounds.play('hurt', Math.min(1, lost / 2));
    kick = Math.min(0.12, kick + 0.03 * lost);
    lastHealth = health;
  } else if (lost < 0) lastHealth = health;
  kick *= Math.max(0, 1 - frameDt * 8);
  burnGlow.style.opacity = play.survival.burning > 0 ? '1' : '0';
  updateHeldTools(now);
  renderer.camera.rotation.set(player.pitch + kick, player.yaw, 0, 'YXZ');
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
  // Arrows in flight are drawn like dropped arrows.
  const flying = play.projectiles.list.map((p) => ({ stack: { state: ARROW, count: 1 }, age: 0, wait: 0,
    body: { x: p.x, y: p.y, z: p.z, vx: 0, vy: 0, vz: 0, halfWidth: 0.2, height: 0.4, onGround: false } }));
  dropMeshes.update(flying.length ? [...play.drops.list, ...flying] : play.drops.list, now / 1000, (d) => lightAt(d.body.x, d.body.y + d.body.height / 2, d.body.z));
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
  if (!ready && loadingText() === null) {
    // A new world's meta record has no position until its first save, and is not listed until then.
    void save();
    play.version++;
  }
  if (play.version !== lastVersion || ((play.mode === 'survival' || !ready) && now - lastUiDraw > 250)) {
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
