import * as THREE from 'three';
import { Rivers } from './worldgen/rivers';
import { ClimateSampler } from './worldgen/climate';
/** How hard a generated river pushes, as a share of flowing water's push. */
const RIVER_PUSH = 0.6;
import { DEPTHS_TOP_M, REACH_M, DROP_CAP, NIGHT_BEFORE, AUTOSAVE_S, BLOCK_SIZE_M, CAVE_AIR_C, CHUNK_SIZE, DAY_LENGTH_S, DIFFICULTY, HEAT_REACH_M, HEAT_SOURCES_C, cells, type Difficulty, HORIZON_RECENTER_M, MAX_VIEW_CHUNKS, MIN_VIEW_CHUNKS, SIM_HZ, toCells } from './config';
import { Sounds } from './audio/sounds';
import { Ambience, musicPlace, type Surroundings } from './audio/ambience';
import { villageAt } from './worldgen/structures';
import { chunkKey, forEachChunkReading, localIndex, unpackChunkKey } from './core/coords';
import { FixedStepLoop } from './core/loop';
import { BLOCKS } from './engine/blocks';
import { LightEngine } from './engine/light';
import { Streamer } from './engine/streaming';
import { ALL_CONNECTED, visibleChunks } from './engine/visibility';
import { World } from './engine/world';
import { COLLISION, loadedBoxAt } from './game/collision';
import { Input } from './game/input';
import { blockInteractionHint } from './game/interactionHint';
import { Play, type Mode, CHALLENGES, type ChallengeGoal } from './game/play';
import { Player } from './game/player';
import { Highlight } from './render/highlight';
import { Renderer } from './render/renderer';
import { artUrl, installAeroTheme } from './ui/artAssets';
import { Creatures } from './creatures/creatures';
import { WorldEffects, type EffectKind } from './render/worldEffects';
import { SPECIES } from './creatures/species';
import { DecorationMeshes } from './render/decorations';
import { ShapeMobs } from './render/shapeMobs';
import { CombatOverlay } from './ui/combatOverlay';
import { HeldItem } from './render/heldItem';
import { DropMeshes } from './render/dropMeshes';
import { BoatMesh } from './render/boatMesh';
import { FrameGraph } from './ui/frameGraph';
import { mulberry32 } from './core/random';
import { Environment } from './sim/environment';
import { climateTemperature } from './sim/weather';
import { biomeByIndex } from './worldgen/biomes';
import { Simulation, isFire } from './sim/simulation';
import { feltTemperature } from './game/bodyTemperature';
import { drawTitle, drawUi, type UiModel, type WorldsModel } from './ui/app';
import { worldActions } from './ui/worldActions';
import { PadMenu } from './ui/padMenu';
import { bearing, Minimap } from './ui/minimap';
import { stackIconUrl } from './ui/icons';
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
installAeroTheme();
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
  uiRoot.style.setProperty('--gui-scale', String(settings.guiScale));
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
      uiRoot.style.setProperty('--gui-scale', String(settings.guiScale));
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
let debugText = params.get('debug') === '1';
overlay.style.display = frameGraph.canvas.style.display = debugText ? '' : 'none';
const renderer = new Renderer(canvas, seed, viewChunks * CHUNK_SIZE);
const sounds = new Sounds();
const ambience = new Ambience(sounds);
// Menu buttons click.
uiRoot.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('button')) sounds.play('click');
});
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
  if (settings.renderScale > 0) renderer.setResolution(settings.renderScale);
  renderer.camera.updateProjectionMatrix();
  input.sensitivity = settings.mouseSensitivity;
  input.invertY = settings.invertY;
  input.toggleKeys = settings.toggleKeys;
  input.bindings = settings.keys;
  sounds.volume = settings.effectsVolume;
  ambience.musicVolume = settings.musicVolume;
  uiRoot.style.setProperty('zoom', String(settings.guiScale));
  uiRoot.style.setProperty('--gui-scale', String(settings.guiScale));
}
applySettings();
const highlight = new Highlight(renderer.scene);
renderer.setViewDistance(viewChunks * CHUNK_SIZE);

const WATER = BLOCKS.typeIndex[BLOCKS.state('water')]!, FLOWING = BLOCKS.typeIndex[BLOCKS.state('flowing_water')]!;
const LADDER = BLOCKS.typeIndex[BLOCKS.state('ladder')]!, CAMPFIRE = BLOCKS.state('campfire'), ARROW = BLOCKS.state('arrow'), MAGIC_BOLT = BLOCKS.state('ember_crystal');
const climbAt = (x: number, y: number, z: number) => BLOCKS.typeIndex[world.get(x, y, z)] === LADDER;
const COBWEB = BLOCKS.typeIndex[BLOCKS.state('cobweb')];
const FLOWING_ID = BLOCKS.state('flowing_water'), LEVELS = 8;
/** Level of water in a cell for working out flow (a source is full, air is empty, anything else blocks: -1). */
const levelAt = (x: number, y: number, z: number) => {
  const s = world.get(x, y, z);
  if (BLOCKS.typeIndex[s] === WATER) return LEVELS;
  if (BLOCKS.typeIndex[s] === FLOWING) return ((s - FLOWING_ID) % LEVELS) + 1;
  return COLLISION[s] === 0 ? 0 : -1;
};
/** Flow of flowing water: down where it falls, otherwise toward lower neighbours; still water in a river follows it. */
// Generated rivers run downhill: their still water carries swimmers and boats along the channel.
let rivers: Rivers | null = null;
const currentAt = (x: number, y: number, z: number): [number, number, number] | null => {
  const s = world.get(x, y, z);
  if (BLOCKS.typeIndex[s] === WATER) {
    const flow = (rivers ??= new Rivers(seed, new ClimateSampler(seed))).flowAt((x + 0.5) * BLOCK_SIZE_M, (z + 0.5) * BLOCK_SIZE_M);
    return flow && [flow[0] * RIVER_PUSH, 0, flow[1] * RIVER_PUSH];
  }
  if (BLOCKS.typeIndex[s] !== FLOWING) return null;
  if (s - FLOWING_ID >= LEVELS) return [0, -1, 0];
  const here = levelAt(x, y, z);
  let fx = 0, fz = 0;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const n = levelAt(x + dx, y, z + dz);
    if (n >= 0 && n < here) {
      fx += dx * (here - n);
      fz += dz * (here - n);
    }
  }
  const len = Math.hypot(fx, fz);
  return len ? [fx / len, 0, fz / len] : null;
};
const boxAt = (x: number, y: number, z: number) => COLLISION[world.get(x, y, z)]!;
const dropBoxAt = loadedBoxAt(world);
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
  if (previous !== state && ['sign','item_frame'].includes(BLOCKS.type(previous).key) && BLOCKS.type(previous).key !== BLOCKS.type(state).key) {
    const item=play.decorations.remove(`${x},${y},${z}`);
    if(item)play.drops.spawn(item,x+.5,y+.5,z+.5);
  }
  if (!world.set(x, y, z, state)) return;
  light.onBlockChanged(x, y, z, previous);
  if (urgent) streamer.markCell(x, y, z);
  else forEachChunkReading(x, y, z, (cx, cy, cz) => streamer.markChunks([chunkKey(cx, cy, cz)]));
  streamer.markChunks(light.drainChanged(), urgent);
  simulation.onCellChanged(x, y, z, previous);
}
const simulation = new Simulation(world, setBlock, seed);
simulation.popped = (x, y, z, s) => play.drops.spawn({ state: BLOCKS.state(BLOCKS.type(s).key), count: 1 }, x + 0.5, y + 0.5, z + 0.5);
simulation.ticks.now = saver.worldMeta.simTick ?? 0;
simulation.ticks.load(saver.worldMeta.ticks);
streamer.onLoad = (c) => {
  simulation.ticks.resume(c.cx, c.cy, c.cz);
  simulation.catchUp(c);
};
streamer.onUnload = (c) => {
  simulation.ticks.park(c.cx, c.cy, c.cz);
  simulation.parkGrowth(c);
};
simulation.loadGrowth(saver.worldMeta.growth);

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
  sound: (name, volume) => sounds.play(name, volume),
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
// A new challenge world starts its timer at zero; a saved one brings its own back when loaded.
const urlChallenge = params.get('challenge');
if (urlChallenge && urlChallenge in CHALLENGES) play.challenge = { goal: urlChallenge as ChallengeGoal, time: 0 };
let lastBite = -Infinity;
/** What a boss's named attacks are called on screen, with the way to dodge. */
const BOSS_CALLS = { slam: 'Slam! Jump or step away', dive: 'Dive! Step aside', stomp: 'Stomp! Step back', boulder: 'Boulder! Dodge it', spit: 'Venom! Dodge it', burrow: 'It burrows! Keep moving', flame: 'Ember bolt! Dodge it' } as const;
const creatures = new Creatures(world, mulberry32(seed ^ 0xc0ffee), {
  bite: (damage, by, species, biter) => {
    // A moment of safety after each bite, so a crowd cannot take the player down all at once.
    if (performance.now() - lastBite < 500) return;
    lastBite = performance.now();
    if (play.mode === 'survival' && !play.survival.dead) sounds.play('break', 0.6);
    play.bitten(damage, by, species, Math.random, biter);
  },
  sound: (name, volume) => sounds.play(name, volume),
  shoot: (c, x, y, z, item) => play.shootAtPlayer(x, y, z, player, c.species.attack, c.species.name, item),
  boss: (c, what) => {
    if (what === 'land') {
      sounds.play('break', 1);
      caption(`${c.species.name} lands ${direction(c.body.x, c.body.z)}`);
    } else play.toast(what === 'enraged' ? `${c.species.name} is enraged!` : `${c.species.name}: ${BOSS_CALLS[what]}`, 2.5);
  },
  // Calls carry 32 m; pitch follows the species' voice.
  call: (c, kind) => {
    const near = 1 - Math.hypot(c.body.x - player.body.x, c.body.y - player.body.y, c.body.z - player.body.z) * BLOCK_SIZE_M / 32;
    if (near > 0) {
      sounds.call(c.species.voice, kind, near);
      caption(`${c.species.name} ${kind === 'death' ? 'dies' : 'calls'} ${direction(c.body.x, c.body.z)}`);
    }
  },
});
creatures.load(saver.worldMeta.creatures);
play.creatures = creatures;
const creatureMeshes = new ShapeMobs(renderer.scene, renderer.uniforms);
const effects = new WorldEffects(renderer.scene, renderer.uniforms);
const decorationMeshes = new DecorationMeshes(renderer.scene, renderer.uniforms);
const boatMesh = new BoatMesh(renderer.scene, renderer.uniforms);
// Subtitles: a caption for each sound heard, for a few seconds, when the setting is on.
const subtitles = document.createElement('ul');
subtitles.id = 'subtitles';
subtitles.setAttribute('aria-live', 'polite');
document.body.append(subtitles);
const CAPTIONS: Partial<Record<string, string>> = { break: 'Something breaks', place: 'Block placed', splash: 'Splash', thunder: 'Thunder rumbles', hurt: 'You are hurt', eat: 'Eating' };
function caption(text: string): void {
  if (!settings.subtitles) return;
  const same = [...subtitles.children].find((li) => li.textContent === text);
  if (same) same.remove();
  const li = document.createElement('li');
  li.textContent = text;
  subtitles.append(li);
  while (subtitles.children.length > 5) subtitles.firstElementChild!.remove();
  setTimeout(() => li.remove(), 2500);
}
/** Which way something is from where the player looks: ahead, behind, to the left or right. */
function direction(x: number, z: number): string {
  const a = Math.atan2(-(x - player.body.x), -(z - player.body.z)) - player.yaw, r = Math.atan2(Math.sin(a), Math.cos(a));
  return Math.abs(r) < 0.8 ? 'ahead' : Math.abs(r) > 2.3 ? 'behind' : r > 0 ? 'to the left' : 'to the right';
}
sounds.onPlay = (name) => { const c = CAPTIONS[name]; if (c) caption(c); };
// The grappling hook's rope: from just below and right of the eye to where the hook holds.
const rope = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0x3a2818 }));
rope.frustumCulled = false;
renderer.scene.add(rope);
/** The boat turns to where it is going, not where the rider looks. */
let boatYaw = 0;
const dropMeshes = new DropMeshes(renderer.scene, renderer.uniforms.tiles!.value as ConstructorParameters<typeof DropMeshes>[1], renderer.uniforms);
play.seed = seed;
if (saver.worldMeta.play) play.load(saver.worldMeta.play);
else if (play.mode === 'creative') play.creativeHotbar();
player.boating = play.boating;
/** Where the player starts: where they first stood, or their bed. */
let worldSpawn: [number, number, number] | null = null;
const env = new Environment(seed, Number(params.get('time') ?? saver.worldMeta.dayTime),
  Number(params.get('year') ?? saver.worldMeta.yearTime ?? 0), () => sounds.play('thunder'), (x,z)=>{play.strike(x,z,player);const y=world.surfaceAt(x,z);if(y!==undefined)effects.burst('lightning',x,y+10,z,4);});

/** Saves the world; a small "Saving" note shows while it writes. */
const savingNote = document.querySelector<HTMLDivElement>('#saving')!;
/** A lost hardcore world is never saved again. */
let lost = false;
function save(): Promise<void> {
  if (lost) return Promise.resolve();
  const b = player.body;
  savingNote.style.opacity = '1';
  return saver.save(world, {
    dayTime: env.clock.dayTime, yearTime: env.clock.yearTime, play: play.save(), creatures: creatures.save(), ticks: simulation.ticks.save(), simTick: simulation.ticks.now, growth: simulation.saveGrowth(), atlas: minimap.atlas.save(), player: { x: b.x, y: b.y, z: b.z, yaw: player.yaw, pitch: player.pitch, flying: player.flying },
  }).catch((err) => console.error('Saving failed:', err)).finally(() => (savingNote.style.opacity = '0'));
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
/** What the ambience plays, from the same look around. */
let surroundings: Surroundings = { wind: 0, rain: 0, water: 0, underground: false, day: true, wildlife: false };
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
  let water = 0;
  for (let dz = -6; dz <= 6; dz += 2) for (let dx = -6; dx <= 6; dx += 2) if (waterAt(x + dx, y - 2, z + dz) || waterAt(x + dx, y - 1, z + dz)) water++;
  const groundKey = BLOCKS.type(world.get(x, column.surface[i]!, z)).key;
  surroundings = {
    wind: sheltered || underground ? 0.1 : Math.min(1, (env.sample?.windSpeed ?? 3) / 12 + Math.max(0, y * BLOCK_SIZE_M) / 200),
    rain: env.falling === 'rain' && !underground ? (sheltered ? 0.35 : 1) : 0,
    water: Math.min(1, water / 6), underground, day: !night,
    wildlife: !underground && (groundKey === 'grass' || column.skyTop[i]! > column.surface[i]! + 2),
    place: musicPlace({
      boss: creatures.list.some((c) => c.species.boss && Math.hypot(c.body.x - x, c.body.z - z) < 48), depthM: y * BLOCK_SIZE_M, depthsTopM: DEPTHS_TOP_M, underground,
      town: (play.town !== null && Math.hypot(play.town[0] - x, play.town[2] - z) < 40) || villageAt(seed, x, z) !== null, day: !night,
    }),
  };
  feltC = feltTemperature({
    airC, night: night && !underground, sheltered: sheltered || underground, wet: wetS > 0, windM_S: env.sample?.windSpeed ?? 3,
    heatC: heatAround(x, y, z), insulationC: play.warmth,
  });
}
/** The eye at the start of the latest tick: frames between ticks draw the camera part way from here, so motion is smooth at any refresh rate. */
const prevEye = [0, 0, 0];
function update(dt: number): void {
  prevEye[0] = player.body.x; prevEye[1] = player.eyeY; prevEye[2] = player.body.z;
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
  const falling = -player.body.vy, bonus = play.bonus;
  // Cobwebs hold the player: a quarter of the speed, and a slow fall.
  const pb = player.body, webbed = [pb.y + 0.1, pb.y + pb.height / 2].some((y) => BLOCKS.typeIndex[world.get(Math.floor(pb.x), Math.floor(y), Math.floor(pb.z))] === COBWEB);
  if (webbed) pb.vy = Math.max(pb.vy, -toCells(1));
  player.speedBonus = webbed ? -0.75 : bonus.speed;
  player.airJumps = bonus.jumps;
  player.glide = bonus.featherfall;
  player.dash = bonus.dash;
  player.wings = bonus.wings;
  player.rocket = bonus.rocket;
  player.update(dt, active ? input : idleInput, boxAt, waterAt, climbAt, currentAt);
  if (active) play.update(dt, input, player);
  if (play.pendingTeleport) {
    const [tx, ty, tz] = play.pendingTeleport;
    play.pendingTeleport = null;
    player.hook = null;
    player.body.x = tx; player.body.y = ty; player.body.z = tz;
    player.body.vx = player.body.vy = player.body.vz = 0;
    sounds.play('place', 0.6);
  }
  if (player.dashed) {
    // A dash: a puff of dust, and a moment no bite can land.
    player.dashed = false;
    lastBite = performance.now();
    play.particles.burst(BLOCKS.state('dirt'), player.body.x - 0.5, player.body.y, player.body.z - 0.5, 8);
    sounds.play('place', 0.3);
  }
  if (player.airJumped) {
    player.airJumped = false;
    play.particles.burst(BLOCKS.state('snow'), player.body.x - 0.5, player.body.y - 0.6, player.body.z - 0.5, 10);
    sounds.play('place', 0.4);
  }
  play.tickFurnaces(dt);
  play.tickCampfires(dt);
  play.tickProjectiles(dt, boxAt, player);
  play.particles.update(dt);
  creatures.update(dt, {
    player: player.body, survival: play.mode === 'survival', day: env.atmosphere.sun[1] > -0.05, hostiles: play.hostileShare, boxAt, waterAt,
    playerHolds: play.held ? BLOCKS.type(play.held.state).key : null,
  });
  if (play.drops.update(dt, dropBoxAt, play.survival.dead ? null : player.body, play.inventory)) play.version++;
  exposureClock += dt;
  if (exposureClock >= 0.5) {
    updateExposure(exposureClock);
    play.wakeGuardians(player);
    play.wakeVillagers(player);
    play.noteSeen(player.body.x, player.body.z);
    play.tickEvent(exposureClock, player);
    play.tickChallenge(exposureClock);
    exposureClock = 0;
  }
  if (play.mode === 'survival' && !play.survival.dead) {
    if (player.body.onGround && falling > 0 && player.submerged < 0.2 && !bonus.featherfall) play.survival.land(falling * BLOCK_SIZE_M);
    const eye = world.get(Math.floor(player.body.x), Math.floor(player.eyeY), Math.floor(player.body.z));
    const feet = world.get(Math.floor(player.body.x), Math.floor(player.body.y + 0.2), Math.floor(player.body.z));

    play.survival.update(dt, {
      feltC, sprinting: input.sprint && player.body.onGround, inWater: player.submerged > 0.3,
      inFire: feet === CAMPFIRE || isFire(feet) || BLOCKS.type(world.get(Math.floor(player.body.x), Math.floor(player.body.y - 0.05), Math.floor(player.body.z))).key === 'meteorite' || world.get(Math.floor(player.body.x), Math.floor(player.body.y - 0.05), Math.floor(player.body.z)) === CAMPFIRE, headInWater: waterAt(Math.floor(player.body.x), Math.floor(player.eyeY), Math.floor(player.body.z)),
      inLava: BLOCKS.type(eye).key.endsWith('lava') || BLOCKS.type(feet).key.endsWith('lava'),
      breath: bonus.breath, fireproof: bonus.fireproof, regen: bonus.regen,
    });
    if (play.survival.dead) {
      play.stats.deaths++;
      play.leaveBoat(player);
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
      const under = BLOCKS.type(world.get(Math.floor(player.body.x), Math.floor(player.body.y - 0.05), Math.floor(player.body.z)));
      sounds.step(under.key === 'snow' ? 'snow' : under.falls ? 'sand' : under.mineWith === 'pickaxe' ? 'stone' : under.mineWith === 'axe' ? 'wood' : 'soft');
    }
  }
  hintClock += dt;
  if (hintClock >= 0.25 && play.mode === 'survival' && !play.survival.dead) {
    // The journal: a day survived at each dawn, the deepest point, biomes walked in, then milestones.
    const night = env.clock.dayTime > 1 - NIGHT_BEFORE || env.clock.dayTime < NIGHT_BEFORE;
    if (wasNight && !night) play.stats.days++;
    if (wasNight !== night) play.turnOfDay(night);
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
        night: env.clock.dayTime > 1 - NIGHT_BEFORE || env.clock.dayTime < NIGHT_BEFORE, hunger: play.survival.hunger, homes: play.homes.size,
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
  if(play.screen!=='none'&&input.playing)input.stop();
  if (input.consume('pause')) {
    if(play.screen!=='none'){play.closeScreen();input.start();return;}
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
  loseWorld() {
    // Hardcore: the world goes for good; nothing is saved again on the way out.
    lost = true;
    void actions.deleteWorld(worldName).then(() => (location.search = ''));
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
let bobPhase = 0, bobAmount = 0;
/** The first-person hand: the held item's picture (or a fist), swinging with each break, place or hit. */
const hand = document.querySelector<HTMLDivElement>('#hand')!, handImg = hand.querySelector('img')!;
const interactionHint=document.createElement('div');interactionHint.id='interaction-hint';interactionHint.hidden=true;document.body.append(interactionHint);
let handSwings = 0;
const combat = new CombatOverlay();
const heldItem = new HeldItem();
/**
 * Automatic resolution: with frames slower than about 45 fps for a couple of seconds, render fewer pixels; with plenty
 * of headroom, more again. Drawing, not the main thread, is what limits most machines.
 */
let frameMs = 16, resolutionClock = 0;
function autoResolution(dt: number): void {
  if (settings.renderScale > 0 || dt <= 0 || dt > 0.25) return;
  frameMs += (dt * 1000 - frameMs) * 0.05;
  if ((resolutionClock += dt) < 2) return;
  resolutionClock = 0;
  const now = renderer.resolutionScale;
  if (frameMs > 22) renderer.setResolution(now - 0.15);
  else if (frameMs < 13) renderer.setResolution(now + 0.1);
}
function updateHand():void {
  const state=play.held?.state??-1;
  const armour=play.armour[1],key=armour?BLOCKS.type(armour.state).key:'bare';
  const material=key.startsWith('diamond')?'diamond':key.startsWith('iron')?'iron':key.startsWith('leather')?'leather':'bare';
  hand.style.display=input.playing&&!player.flying&&play.screen==='none'&&!play.held?'':'none';
  if(play.swings!==handSwings||(play.breaking>0&&!hand.classList.contains('swing'))){
    handSwings=play.swings;hand.classList.remove('swing');void hand.offsetWidth;hand.classList.add('swing');
  }
  const desired=state>=0?stackIconUrl(play.held!):artUrl('hands',`${material}_${hand.classList.contains('swing')?'swing':input.placing?'use':'idle'}`);
  if(handImg.getAttribute('src')!==desired)handImg.src=desired;
 handImg.style.display='';hand.classList.remove('fist');
}
hand.addEventListener('animationend',()=>hand.classList.remove('swing'));
let lastHealth = play.survival.health, kick = 0, milestones = play.journal.done.size;
const compass = document.querySelector<HTMLDivElement>('#compass')!, minimap = new Minimap();
document.body.append(minimap.canvas);
minimap.atlas.load(saver.worldMeta.atlas);
let mapClock = 0;
/** Held compass: a needle to the bed (or where the world began). Held map: the land around, redrawn a few times a second. */
function updateHeldTools(now: number): void {
  const key = play.held ? BLOCKS.type(play.held.state).key : '';
  const visible = input.playing && play.screen === 'none' && !play.survival.dead;
  // The compass points to the last marker, else to where the player wakes.
  const marker = play.markers.at(-1), target = marker ? [marker.x, marker.y, marker.z] : play.spawn ?? worldSpawn;
  compass.style.display = visible && key === 'compass' && target ? '' : 'none';
  if (key === 'compass' && target) compass.style.transform = `rotate(${bearing(player.body.x, player.body.z, player.yaw, target[0], target[2])}rad)`;
  minimap.canvas.style.display = visible && key === 'map' ? 'block' : 'none';
  if (visible && key === 'map' && now - mapClock > 300) {
    mapClock = now;
    minimap.draw(world, player.body.x, player.body.z, player.yaw);
  } else if (now - mapClock > 3000) {
    // The map keeps a record of the land walked through even while it is not held.
    mapClock = now;
    minimap.atlas.record(world, player.body.x, player.body.z, 64);
  }
}
let effectScan=0, effectWet=false;
let emitters:{kind:EffectKind;x:number;y:number;z:number;size:number}[]=[];
let frames = 0, fps = 0, fpsTime = performance.now(), lastVersion = -1, lastUiDraw = 0;
/** Main-thread time of this frame's fixed steps, and when the previous frame started (for the F3 graph). */
let updateMs = 0, lastFrame = performance.now();
const timedUpdate = (dt: number) => {
  const t = performance.now();
  update(dt);
  updateMs += performance.now() - t;
};
const loop = new FixedStepLoop(1 / 60, 0.25, timedUpdate, (alpha, frameDt) => {
  const now = performance.now();
  input.poll(frameDt);
  if (!input.playing) padMenu.poll(now);
  const [dyaw, dpitch] = input.takeLook();
  player.yaw += dyaw;
  player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch + dpitch));
  handleActions();
  streamer.update(player.body.x, player.body.y, player.body.z, now);
  // The view bobs with each step and widens a little while sprinting (unless turned off).
  const speed = Math.hypot(player.body.vx, player.body.vz), walking = player.body.onGround && !player.flying && speed > 0.5;
  // The bob fades in and out with walking rather than snapping back when the player stops.
  bobPhase += speed * frameDt * 1.1;
  bobAmount += ((walking ? 1 : 0) - bobAmount) * Math.min(1, frameDt * 10);
  const bob = settings.viewBob ? Math.sin(bobPhase) * 0.05 * bobAmount : 0;
  const wantFov = settings.fov * (settings.viewBob && input.sprint && walking ? 1.1 : 1);
  if (Math.abs(renderer.camera.fov - wantFov) > 0.05) {
    renderer.camera.fov += (wantFov - renderer.camera.fov) * Math.min(1, frameDt * 8);
    renderer.camera.updateProjectionMatrix();
  }
  const lerp = (a: number, b: number) => a + (b - a) * alpha;
  renderer.camera.position.set(lerp(prevEye[0]!, player.body.x), lerp(prevEye[1]!, player.eyeY) + Math.abs(bob), lerp(prevEye[2]!, player.body.z));
  // Taking damage: a red flash, a hurt sound and a kick of the view. Slow harm (burning, cold) flashes every half point.
  const health = play.survival.health, lost = lastHealth - health;
  if (lost >= 0.5 && play.mode === 'survival') {
    hurtFlash.style.transition = 'none';
    hurtFlash.style.opacity = String(Math.min(settings.reduceMotion ? 0.25 : 0.6, 0.15 + lost * 0.08));
    void hurtFlash.offsetWidth;
    hurtFlash.style.transition = 'opacity 0.5s';
    hurtFlash.style.opacity = '0';
    sounds.play('hurt', Math.min(1, lost / 2));
    if (!settings.reduceMotion) kick = Math.min(0.12, kick + 0.03 * lost);
    lastHealth = health;
  } else if (lost < 0) lastHealth = health;
  kick *= Math.max(0, 1 - frameDt * 8);
  burnGlow.style.opacity = play.survival.burning > 0 ? '1' : '0';
  updateHeldTools(now);
  updateHand();
  autoResolution(frameDt);
  combat.update(frameDt, renderer.camera, play.hits, creatures.list, play.slashes, play.screen === 'none' && !play.survival.dead);
  ambience.update(frameDt, surroundings);
  if (play.journal.done.size > milestones) {
    [523, 659, 784].forEach((f, k) => setTimeout(() => sounds.chime(f, 0.25), k * 120));
  }
  milestones = play.journal.done.size;
  renderer.camera.rotation.set(player.pitch + kick, player.yaw, 0, 'YXZ');
  highlight.set(play.target, play.breaking, play.target ? world.get(play.target.x, play.target.y, play.target.z) : 0);
  let hint='';
  if(input.playing&&play.screen==='none'&&!play.survival.dead){
    const heldBlock=play.held&&!BLOCKS.type(play.held.state).item;
    if(play.target)hint=blockInteractionHint(world.get(play.target.x,play.target.y,play.target.z),heldBlock?{crouchKey:keyLabel(settings.keys.descend),crouching:input.descend}:undefined);
    const [dx,dy,dz]=player.direction();
    const hit=creatures.raycast(player.body.x,player.eyeY,player.body.z,dx,dy,dz,toCells(REACH_M));
    if(hit&&(!play.target||hit.distance<play.target.distance||!BLOCKS.type(world.get(play.target.x,play.target.y,play.target.z)).solid)&&!(heldBlock&&input.descend&&play.target)){
      const s=hit.creature.species,held=play.held?BLOCKS.type(play.held.state).key:null;
      hint=s.trader?`${s.name} · Right click: Trade`:held&&s.food?.includes(held)?`${s.name} · Right click: Feed`:`${s.name} · Left click: Attack`;
    }
  }
  interactionHint.hidden=!hint;
  if(interactionHint.textContent!==hint)interactionHint.textContent=hint;
  document.querySelector<HTMLElement>('#crosshair')!.style.background=`url("${artUrl('ui',play.target?'prompt_target':'prompt_idle')}") center/contain no-repeat`;
  document.querySelector<HTMLElement>('#crosshair')!.hidden = !input.playing || play.screen !== 'none' || play.survival.dead;
  const atmosphereCamera = renderer.camera.position;
  renderer.setAtmosphere(env.frame(frameDt, atmosphereCamera.x, atmosphereCamera.y, atmosphereCamera.z, world));
  const daylight = renderer.uniforms.daylight!.value as number;
  play.daylight = daylight;
  play.raining = env.falling === 'rain';
  /** Brightness (0..1) of a cell for things drawn outside the terrain. */
  const lightAt = (cx: number, cy: number, cz: number) => {
    const x = Math.floor(cx), y = Math.floor(cy), z = Math.floor(cz);
    const chunk = world.chunkAt(x, y, z);
    if (!chunk) return daylight;
    const i = localIndex(x & 15, y & 15, z & 15), sky = chunk.skyLight(i) / 15, block = chunk.blockLight(i) / 15;
    return 0.07 + 0.93 * Math.max(sky * sky * daylight, block * block);
  };
  for(const event of play.visualEvents.splice(0))effects.burst(event.kind,event.x,event.y,event.z,.8);
  const wet=player.submerged>.2;
  if(wet!==effectWet)effects.burst('splash',player.body.x,player.body.y+.5,player.body.z,1.7);
  effectWet=wet;effectScan-=frameDt;
  if(effectScan<=0){
    effectScan=.5;emitters=[];
    const px=Math.floor(player.body.x),py=Math.floor(player.body.y),pz=Math.floor(player.body.z);
    for(let y=py-3;y<=py+5;y++)for(let z=pz-7;z<=pz+7;z++)for(let x=px-7;x<=px+7;x++){
      if(!world.isLoaded(x,y,z))continue;
      const key=BLOCKS.type(world.get(x,y,z)).key;
      if(key==='campfire'){emitters.push({kind:'fire',x:x+.5,y:y+.6,z:z+.5,size:1});emitters.push({kind:'smoke',x:x+.5,y:y+1.7,z:z+.5,size:.8});}
      else if(key==='lit_furnace'||key==='ember_forge')emitters.push({kind:key==='ember_forge'?'sparks':'smoke',x:x+.5,y:y+1.3,z:z+.5,size:.7});
    }
  }
  const burning=creatures.list.filter(c=>c.burning>0).map(c=>({kind:'fire' as const,x:c.body.x,y:c.body.y+c.body.height*.45,z:c.body.z,size:c.body.height*.7}));
  const bolts=play.projectiles.list.filter(p=>p.magic&&!p.item).map(p=>({kind:'sparks' as const,x:p.x,y:p.y,z:p.z,size:.5}));
  // A wisp circles the player's head and lights the blocks around it; night vision lifts every shadow.
  const wisp = play.bonus.wisp ? { kind: 'sparks' as const, x: player.body.x + Math.cos(now / 700) * 0.9, y: player.eyeY + 0.4 + Math.sin(now / 450) * 0.2, z: player.body.z + Math.sin(now / 700) * 0.9, size: 0.35 } : null;
  (renderer.uniforms.glowPos!.value as THREE.Vector3).set(wisp?.x ?? 0, wisp?.y ?? 0, wisp?.z ?? 0);
  renderer.uniforms.glowRadius!.value = wisp ? 9 : 0;
  renderer.uniforms.nightVision!.value = play.survival.has('night_vision') ? 1 : 0;
  effects.update(frameDt,now/1000,[...burning,...emitters,...bolts,...(wisp ? [wisp] : [])]);
  decorationMeshes.update(play.decorations,world,renderer.camera,lightAt);
  for (const d of creatures.dying) if (!d.puffed) {
    d.puffed = true;
    if (d.c.species.boss) ambience.sting();
    effects.burst('smoke', d.c.body.x, d.c.body.y + d.c.body.height * 0.4, d.c.body.z, Math.max(0.8, d.c.body.height * 0.8));
  }
  creatureMeshes.update(creatures.list, (c) => lightAt(c.body.x, c.body.y + c.body.height * 0.6, c.body.z), now / 1000, creatures.dying);
  // Arrows in flight and bits of broken blocks are drawn like dropped items, smaller.
  const flying = [
    ...play.projectiles.list.map((p) => ({ state: p.item ? BLOCKS.state(p.item) : p.magic ? MAGIC_BOLT : ARROW, x: p.x, y: p.y, z: p.z, size: p.magic ? 0.3 : 0.4 })),
    ...play.particles.list.map((p) => ({ state: p.state, x: p.x, y: p.y, z: p.z, size: 0.15 })),
  ].map((f) => ({ stack: { state: f.state, count: 1 }, age: 0, wait: 0,
    body: { x: f.x, y: f.y, z: f.z, vx: 0, vy: 0, vz: 0, halfWidth: f.size / 2, height: f.size, onGround: false } }));
  // Real drops first: when over the cap, arrows and bits are what is left out.
  const drawn = flying.length ? [...play.drops.list, ...flying].slice(0, DROP_CAP) : play.drops.list;
  if (Math.hypot(player.body.vx, player.body.vz) > 0.5) boatYaw = Math.atan2(-player.body.vx, -player.body.vz);
  // A red moon colours the night sky and the fog with it, fading in and out.
  const redMoon = renderer.sky.redMoon + ((play.event === 'red_night' ? 1 : 0) - renderer.sky.redMoon) * Math.min(1, frameDt * 0.5);
  renderer.sky.redMoon = redMoon;
  rope.visible = player.hook !== null;
  if (player.hook) {
    const at = rope.geometry.getAttribute('position') as THREE.BufferAttribute, cam = renderer.camera;
    const hand = new THREE.Vector3(0.35, -0.4, -0.6).applyQuaternion(cam.quaternion).add(cam.position);
    at.setXYZ(0, hand.x, hand.y, hand.z);
    at.setXYZ(1, ...player.hook);
    at.needsUpdate = true;
  }
  boatMesh.update(player.boating, player.body.x, player.body.y, player.body.z, boatYaw, lightAt(player.body.x, player.body.y + 0.5, player.body.z));
  dropMeshes.update(drawn, now / 1000, (d) => lightAt(d.body.x, d.body.y + d.body.height / 2, d.body.z));
  cull();
  const cam = renderer.camera.position;
  const sample = env.sample;
  simulation.weather = sample && { precipitation: sample.precipitation, seasonC: sample.seasonC };
  renderer.clouds.update(cam.x, cam.z, frameDt, sample?.windSpeed ?? 3, env.atmosphere.cloudCover,
    (renderer.uniforms.daylight!.value as number) * (1 - 0.4 * env.atmosphere.cloudCover));
  renderer.precipitation.update(cam.x, cam.y, cam.z, frameDt, env.atmosphere.underground > 0.5 ? 'none' : env.falling,
    env.atmosphere.cloudCover, sample?.windSpeed ?? 3, (x, z) => world.column(x >> 4, z >> 4)?.skyTop[((z & 15) << 4) | (x & 15)] ?? -Infinity);
  updateHorizon(cam.x, cam.z);
  renderer.render(now / 1000);
  // A held item is drawn in 3D; the flat hand picture shows only for an empty hand (decided above, in the same frame).
  heldItem.update(frameDt, play.held, {
    swings: play.swings, slashes: play.slashes, breaking: play.breaking > 0, bob: bobPhase, bobAmount: settings.viewBob ? bobAmount : 0,
    light: lightAt(player.body.x, player.eyeY, player.body.z), fov: renderer.camera.fov, aspect: renderer.camera.aspect,
    visible: input.playing && !player.flying && play.screen === 'none' && !play.survival.dead,
  });
  heldItem.render(renderer.renderer);
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
  species:SPECIES,effects,
  spawnMob(key:string,x:number,y:number,z:number){const s=SPECIES.find(s=>s.key===key);if(!s)throw new Error('Unknown mob');return creatures.add(s,x,y,z,s.health).id;},
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
