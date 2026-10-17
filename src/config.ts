/**
 * Every tunable number in the game lives here.
 * Do not hard-code these values anywhere else; import them.
 */

// ---- Scale ----
export const BLOCK_SIZE_M = 0.3; // one block is 0.3 m; the player is about 6 blocks tall

/** Converts a length in meters to blocks. Speeds (m/s) and accelerations (m/s²) convert the same way. */
export function metersToBlocks(meters: number): number {
  return meters / BLOCK_SIZE_M;
}

/** A length in meters as a whole number of blocks. */
export function roundBlocks(meters: number): number {
  return Math.round(metersToBlocks(meters));
}

// ---- World ----
export const CHUNK_SIZE = 16; // blocks along each axis; chunks are cubes and the world has no height limit
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE;
export const DEFAULT_SEED = 1337;

// World sizes are written in meters, the same numbers as before the 0.6 m block, and converted to whole blocks.
// A finer block then fills the same land with more detail.
export const SEA_LEVEL_M = 0; // sea level is y = 0, as in the roadmap
export const SEA_LEVEL = roundBlocks(SEA_LEVEL_M); // air at y <= SEA_LEVEL becomes water during generation
export const TERRAIN_MAX_M = 232; // highest terrain surface: 150 m spline + 60 m mountains + 22 m detail (src/world/shape.ts)
export const TERRAIN_MAX_BLOCKS = roundBlocks(TERRAIN_MAX_M);
/** Chunks below this cy are solid stone (about -400 m). */
export const TERRAIN_CHUNK_BOTTOM = Math.floor(roundBlocks(-400) / CHUNK_SIZE);
/** Top of the terrain band, in whole chunks (about 2,600 m). Chunks from here up are air. The name is from phase 1. */
export const LEGACY_HEIGHT = Math.ceil(roundBlocks(2600) / CHUNK_SIZE) * CHUNK_SIZE;
export const LEGACY_CHUNKS = LEGACY_HEIGHT / CHUNK_SIZE;

// Terrain shape comes from src/world/shape.ts, in meters. Caves and surface layers:
export const CAVE_SCALE_H_M = 40; // horizontal size of cave noise features
export const CAVE_SCALE_V_M = 24; // vertical size of cave noise features
export const SOIL_DEPTH_M = 1.8; // dirt under the grass
export const GEOLOGY_LAYER_M = 12; // thickness of one rock layer (seven strata rocks, spec 20), before the warp
export const GEOLOGY_WARP_M = 400; // horizontal size of the noise that bends the rock layers
export const DEEPSLATE_DEPTH_M = -100; // stone below this height is deepslate, not a strata rock (spec 20)
export const TALL_GRASS_CHANCE = 0.3; // chance a grass surface grows tall grass on top (spec 18)
export const POPPY_CHANCE = 0.01; // chance a grass surface grows a poppy, checked before tall grass
export const DANDELION_CHANCE = 0.01; // chance a grass surface grows a dandelion, checked first (spec 19)
export const FERN_CHANCE = 0.1; // chance a grass surface grows a fern, checked after the others (spec 19)
export const BROWN_MUSHROOM_CHANCE = 0.005; // chance a grass surface grows a brown mushroom, checked after the fern (spec 21)
export const RED_MUSHROOM_CHANCE = 0.005; // chance a grass surface grows a red mushroom, checked last (spec 21)
export const BARE_ROCK_AMP_M = 12; // columns with at least this much detail amplitude have no soil: bare rock

// ---- Ores (spec 26: ores by depth and rock type) ----
/** One ore type's generation: the depth band it appears in, and how its veins are placed. */
export interface OreGenDef {
  /** Registry key, e.g. 'coal_ore'. Matches a block type in `src/world/blocks.ts`. */
  readonly key: string;
  /** Top of the depth band, in meters below sea level (negative). The shallowest it spawns. */
  readonly topM: number;
  /** Bottom of the depth band, in meters below sea level (negative). The deepest it spawns. */
  readonly bottomM: number;
  /** Chance each column gets a cluster of this ore. */
  readonly chancePerColumn: number;
  /** Attempted blocks per cluster. Some attempts miss (air, surface, wrong rock). */
  readonly clusterTries: number;
}

/** Ores from shallow to deep. The bands do not overlap the surface; below -100 m the host rock is deepslate. */
export const ORE_GEN: readonly OreGenDef[] = Object.freeze([
  { key: 'coal_ore', topM: -4, bottomM: -40, chancePerColumn: 0.6, clusterTries: 10 },
  { key: 'iron_ore', topM: -32, bottomM: -96, chancePerColumn: 0.5, clusterTries: 8 },
  { key: 'gold_ore', topM: -64, bottomM: -160, chancePerColumn: 0.4, clusterTries: 6 },
  { key: 'redstone_ore', topM: -96, bottomM: -224, chancePerColumn: 0.35, clusterTries: 6 },
  { key: 'lapis_ore', topM: -128, bottomM: -320, chancePerColumn: 0.3, clusterTries: 8 },
  { key: 'diamond_ore', topM: -160, bottomM: -480, chancePerColumn: 0.25, clusterTries: 5 },
  { key: 'emerald_ore', topM: -160, bottomM: -480, chancePerColumn: 0.15, clusterTries: 4 },
] as const);

export const BEACH_BAND_M = 1; // land this close above sea level is beach
export const SHORE_CAVE_BAND_M = 3; // no caves are carved this close above sea level
export const SHORE_ROOF_M = 5; // the surface stays solid this far below a beach or shore
export const BEACH_BAND = roundBlocks(BEACH_BAND_M);
export const SHORE_CAVE_BAND = roundBlocks(SHORE_CAVE_BAND_M);
export const SHORE_ROOF = roundBlocks(SHORE_ROOF_M);
export const SOIL_DEPTH = roundBlocks(SOIL_DEPTH_M);

// Trees, in meters. Density is per square metre, so it doesn't change with the block size.
export const TREE_DENSITY_PER_M2 = 0.012;
/** Chance a 1-block column holds a tree anchor. */
export const TREE_CHANCE = TREE_DENSITY_PER_M2 * BLOCK_SIZE_M * BLOCK_SIZE_M;
export const TREE_HEIGHT_MIN_M = 8;
export const TREE_HEIGHT_MAX_M = 12;
/** The most a tree's blocks sit horizontally from its trunk. */
export const TREE_REACH_M = 4.8;
/** Branch length (horizontal) and the leaf cluster radius at a branch end, in meters. */
export const TREE_BRANCH_MIN_M = 1.2;
export const TREE_BRANCH_MAX_M = 2.4;
export const TREE_BLOB_RADIUS_M = 1.2;
export const TREE_REACH = roundBlocks(TREE_REACH_M);

// Spawn search, in meters.
export const SPAWN_RADIUS_M = 512;
export const SPAWN_STEP_M = 8;

// Surface band cap, in meters: columns whose top is further than this are not kept in the surface band.
export const SURFACE_MAX_DISTANCE_M = 2000;
// How far below a column top the spawn search looks for the ground, in meters.
export const SURFACE_SCAN_M = 150;

// ---- Chunk streaming ----
export const DEFAULT_RENDER_DISTANCE = 8; // radius, in chunks (a chunk is 4.8 m wide)
export const MIN_RENDER_DISTANCE = 2;
export const MAX_RENDER_DISTANCE = 16;
export const GEN_BUDGET_MS = 4; // max time per frame spent generating terrain
export const MESH_BUDGET_MS = 4; // max time per frame spent building meshes
export const SPAWN_READY_RADIUS = 1; // the 3x3x3 chunks around the spawn point must be meshed before the player spawns
export const VERTICAL_RENDER_DISTANCE = 4; // chunks above and below the player's chunk that are always loaded
export const SURFACE_BAND = 1; // extra chunks loaded below each column's lowest top, so the surface is always shown
export const MAX_JOBS_IN_FLIGHT = 16; // with Web Workers: at most this many tops/generate/mesh jobs at once

// ---- Player ----
// Distances, speeds and accelerations are written in meters (m/s, m/s²) and converted to blocks.
export const PLAYER_HALF_WIDTH = metersToBlocks(0.24); // 0.4 blocks
export const PLAYER_HEIGHT = metersToBlocks(1.75); // ~2.917 blocks
export const EYE_HEIGHT = metersToBlocks(1.62); // 2.7 blocks
export const WALK_SPEED = metersToBlocks(4.3);
export const SPRINT_SPEED = metersToBlocks(6.0);
export const FLY_SPEED = metersToBlocks(12);
export const GRAVITY = metersToBlocks(28);
export const JUMP_SPEED = metersToBlocks(8.7); // jump height ~1.35 m (~2.25 blocks)
export const TERMINAL_VELOCITY = metersToBlocks(50);
export const GROUND_ACCEL = 20; // how quickly velocity reaches the target speed (per second)
export const AIR_ACCEL = 5;
export const REACH = metersToBlocks(6); // max distance for breaking/placing blocks
export const BREAK_REPEAT_S = 0.25; // holding a mouse button repeats break/place this often
export const DEFAULT_MOUSE_SENSITIVITY = 0.0025; // radians per pixel of mouse movement
export const FOOTSTEP_DISTANCE = metersToBlocks(1.8); // a footstep sound every this far walked on the ground
export const FOOTSTEP_MIN_SPEED = metersToBlocks(1); // no footsteps below this horizontal speed
export const STEP_HEIGHT = roundBlocks(0.6); // highest ledge the player walks up onto without jumping (0.6 m)
export const STEP_SMOOTH_S = 0.12; // seconds the camera takes to catch up after a full 1-block step

// ---- Swimming (spec 16: buoyancy and quadratic drag) ----
export const WATER_DENSITY = 1000; // kg/m^3
export const PLAYER_DENSITY = 800; // kg/m^3: the body floats with about 80% under water, chin at the surface
export const WATER_DRAG_PER_M = 0.9; // quadratic drag in water: a = -k |v| v, in 1/m
/** The same drag in blocks: a = -WATER_DRAG |v| v with v in blocks per second. */
export const WATER_DRAG = WATER_DRAG_PER_M * BLOCK_SIZE_M;
export const SWIM_THRUST = metersToBlocks(6); // swim stroke, m/s^2 in the wish direction
export const SWIM_UP_ACCEL = metersToBlocks(6); // extra upward push while holding jump in water, m/s^2
export const WADE_SLOWDOWN = 0.5; // walking speed lost per unit of submerged fraction, while not swimming (spec 17)
export const SPLASH_MIN_SPEED = metersToBlocks(4); // downward speed (m/s) that makes a splash on entering water
export const SWIM_WAIST_HEIGHT = metersToBlocks(0.6); // "in water" is checked this far above the feet
export const FEET_WATER_HEIGHT = metersToBlocks(0.1); // "feet in water" is checked this far above the feet

// ---- Game loop ----
export const FIXED_DT = 1 / 60; // physics step, seconds
export const MAX_FRAME_DT = 0.25; // longer frames are clamped (tab was hidden, debugger, ...)

// ---- Rendering ----
export const DEFAULT_FOV = 75;
export const MIN_FOV = 50;
export const MAX_FOV = 110;
export const SKY_COLOR = 0x87ceeb;
export const NIGHT_SKY_COLOR = 0x0b1026;
export const UNDERWATER_COLOR = 0x1f4f99;
export const WATER_OPACITY = 0.7;

// Clouds, in meters.
export const CLOUD_HEIGHT_M = 100;
export const CLOUD_TEXEL_M = 12; // one cloud texel covers this much ground
export const CLOUD_PLANE_M = 768; // beyond the fog anyway
export const CLOUD_DRIFT_M_S = 1.5; // toward +X

// View ends, in meters. Fog near and far follow the view distance.
export const CAMERA_FAR_M = 600;
export const UNDERWATER_FAR_M = 8.4;

// ---- Time of day ----
export const DAY_LENGTH_S = 600; // seconds for a full day + night
export const START_TIME_OF_DAY = 0.3; // 0 sunrise, 0.25 noon, 0.5 sunset, 0.75 midnight
export const MIN_DAYLIGHT = 0.15;

// ---- Calendar and seasons (spec 29) ----
export const DAYS_PER_SEASON = 7; // days per season; a year is 4 * this
export const WORLD_LATITUDE_DEG = 45; // world latitude, drives day length variation

// ---- Climate at block resolution (spec 31) ----
export const TEMPERATURE_MIN_C = -30; // coldest biome temperature
export const TEMPERATURE_MAX_C = 30; // hottest biome temperature
export const TEMPERATURE_LAPSE_C_PER_KM = 6.5; // degrees C lost per km of height
export const PRECIPITATION_MIN_MM = 0; // driest biome precipitation, mm/year
export const PRECIPITATION_MAX_MM = 2000; // wettest biome precipitation, mm/year
export const OROGRAPHIC_LIFT = 0.3; // precipitation boost per unit of max detail amplitude

// ---- UI ----
export const HOTBAR_SIZE = 9;

// ---- Inventory, held block and dropped items (spec 24) ----
export const INVENTORY_SIZE = 36; // 9 hotbar slots, then 27 in the grid
export const MAX_STACK = 64;
export const STARTING_STACK = 64; // each default hotbar block starts with this many
export const ITEM_SIZE_M = 0.15; // edge of a dropped item (about half a block)
export const ITEM_SIZE = metersToBlocks(ITEM_SIZE_M);
export const ITEM_LIFETIME_S = 300; // a dropped item disappears after this long
export const MAX_ITEMS = 256; // at most this many dropped items; a new one removes the oldest
export const ITEM_POP_SPEED_M_S = 1.5; // upward speed when a block drops
export const ITEM_SPREAD_M_S = 0.8; // sideways speed when a block drops (random, up to this)
export const ITEM_FRICTION = 8; // per second: how fast an item slows down while it rests on the ground
export const ITEM_PICKUP_RADIUS_M = 0.9; // walk within this distance (horizontally) to pick an item up
export const ITEM_PICKUP_BELOW_M = 0.3; // and an item this far below the feet still counts, so one dug under you is reachable
export const ITEM_PICKUP_DELAY_S = 0.6; // a new item cannot be picked up for this long
export const HAND_BLOCK_SIZE = 0.3; // edge of the block in hand, in blocks (0.09 m)
// Position in view space (right, up, forward of the eye, in blocks). Far enough forward and low enough that the block
// stays on screen when the player looks straight down.
export const HAND_X = 0.3;
export const HAND_Y = -0.28;
export const HAND_Z = -1;
export const HAND_SWING_S = 0.25; // one swing of the hand when a block is broken or placed
export const HAND_BOB = 0.025; // how far the block in hand bobs while the player walks, in blocks

// ---- Volumetric tools (boxes, spheres, planes, walls, floors, flatten, undo) ----
export const VOLUME_MAX_SIZE = 32; // blocks per side that one action can change (about 9.6 m)
export const VOLUME_MAX_THICKNESS = 16; // blocks; 0 means solid for boxes and spheres
export const VOLUME_DEFAULT_SIZE = 3;
export const EDIT_CELLS_PER_STEP = 4096; // cells written per fixed step, so a large volume spans a few frames
export const UNDO_LIMIT = 20; // actions kept for Ctrl+Z, in memory only

// ---- Storage ----
export const SAVE_DB_NAME = 'voxel-game'; // IndexedDB database holding the world save
// localStorage keys of old saves. v1 (128-high columns) is never read, written or deleted; the interim v2 key
// (cubic chunks, development builds only) is deleted on start.
export const INTERIM_SAVE_KEY = 'voxel-game-save-v2';
export const SETTINGS_KEY = 'voxel-game-settings-v1';
export const AUTOSAVE_INTERVAL_S = 10;

// ---- Tick system (spec 25, slice 1) ----
export const TICK_BUDGET_MS = 2; // max time per frame spent running chunk ticks

// ---- Entity system (spec 31) ----
export const ENTITY_FRICTION = 8; // per second: how fast an entity slows down on the ground

// ---- Random ticks (spec 38) ----
export const RANDOM_TICKS_PER_CHUNK = 3; // random cells drawn per loaded chunk per tick step
export const RANDOM_TICK_BUDGET_MS = 1; // max time per frame spent on the random-tick pass

// ---- Ecology (spec 36) ----
export const GRASS_SPREAD_CHANCE = 0.02; // chance per tick that grass spreads to adjacent lit dirt
export const GRASS_SPREAD_LIGHT_MIN = 8; // minimum sky light level for grass to spread

// ---- Tree species (spec 37) ----
export type TreeSpecies = 'oak' | 'spruce' | 'birch' | 'pine' | 'jungle_giant' | 'acacia' | 'dead_snag' | 'bush';

export interface TreeSpeciesDef {
  key: TreeSpecies;
  name: string;
  trunkWidth: 1 | 2; // blocks wide
  heightMinBlocks: number;
  heightMaxBlocks: number;
  branchMinBlocks: number;
  branchMaxBlocks: number;
  blobRadiusBlocks: number; // leaf cluster radius at branch ends
  crownBaseFraction: number; // fraction of height where bare trunk ends
  crownRadiusFactor: number; // crown radius as fraction of height
}

export const TREE_SPECIES: TreeSpeciesDef[] = [
  {
    key: 'oak',
    name: 'Oak',
    trunkWidth: 2,
    heightMinBlocks: 16,
    heightMaxBlocks: 24,
    branchMinBlocks: 2,
    branchMaxBlocks: 4,
    blobRadiusBlocks: 4,
    crownBaseFraction: 0.45,
    crownRadiusFactor: 0.5,
  },
  {
    key: 'spruce',
    name: 'Spruce',
    trunkWidth: 1,
    heightMinBlocks: 20,
    heightMaxBlocks: 32,
    branchMinBlocks: 1,
    branchMaxBlocks: 3,
    blobRadiusBlocks: 3,
    crownBaseFraction: 0.55,
    crownRadiusFactor: 0.3,
  },
  {
    key: 'birch',
    name: 'Birch',
    trunkWidth: 1,
    heightMinBlocks: 14,
    heightMaxBlocks: 20,
    branchMinBlocks: 2,
    branchMaxBlocks: 3,
    blobRadiusBlocks: 3,
    crownBaseFraction: 0.5,
    crownRadiusFactor: 0.4,
  },
  {
    key: 'pine',
    name: 'Pine',
    trunkWidth: 1,
    heightMinBlocks: 18,
    heightMaxBlocks: 28,
    branchMinBlocks: 1,
    branchMaxBlocks: 2,
    blobRadiusBlocks: 2,
    crownBaseFraction: 0.6,
    crownRadiusFactor: 0.25,
  },
  {
    key: 'jungle_giant',
    name: 'Jungle Giant',
    trunkWidth: 2,
    heightMinBlocks: 24,
    heightMaxBlocks: 40,
    branchMinBlocks: 3,
    branchMaxBlocks: 6,
    blobRadiusBlocks: 5,
    crownBaseFraction: 0.4,
    crownRadiusFactor: 0.6,
  },
  {
    key: 'acacia',
    name: 'Acacia',
    trunkWidth: 1,
    heightMinBlocks: 12,
    heightMaxBlocks: 18,
    branchMinBlocks: 2,
    branchMaxBlocks: 4,
    blobRadiusBlocks: 4,
    crownBaseFraction: 0.5,
    crownRadiusFactor: 0.45,
  },
  {
    key: 'dead_snag',
    name: 'Dead Snag',
    trunkWidth: 1,
    heightMinBlocks: 8,
    heightMaxBlocks: 16,
    branchMinBlocks: 0,
    branchMaxBlocks: 2,
    blobRadiusBlocks: 0,
    crownBaseFraction: 1.0,
    crownRadiusFactor: 0,
  },
  {
    key: 'bush',
    name: 'Bush',
    trunkWidth: 1,
    heightMinBlocks: 3,
    heightMaxBlocks: 6,
    branchMinBlocks: 0,
    branchMaxBlocks: 0,
    blobRadiusBlocks: 2,
    crownBaseFraction: 0.3,
    crownRadiusFactor: 0.8,
  },
];

export const TREE_SPECIES_KEYS: TreeSpecies[] = TREE_SPECIES.map((s) => s.key);

export function treeSpeciesDef(key: TreeSpecies): TreeSpeciesDef | undefined {
  return TREE_SPECIES.find((s) => s.key === key);
}

// ---- Weather (spec 32) ----
export const WEATHER_PRESSURE_WAVELENGTH_M = 6000; // feature size of pressure noise
export const WEATHER_WIND_SPEED_M_S = 3; // weather fronts drift eastward at this speed
export const WEATHER_HUMIDITY_WAVELENGTH_M = 3000; // feature size of humidity noise
export const WEATHER_STORM_PRESSURE = -0.5; // pressure below this = storm candidate
export const WEATHER_STORM_HUMIDITY = 0.62; // humidity above this = storm candidate
export const WEATHER_STORM_TEMP_C = 10; // temperature above this = storm candidate
export const WEATHER_PRECIP_THRESHOLD = 0.1; // minimum cloud cover for precipitation
export const WEATHER_TEMP_SNOW_C = -2; // below this temperature = snow
export const WEATHER_TEMP_RAIN_C = 2; // above this temperature = rain

// ---- Survival (spec 34) ----
export const GAME_MODE_SURVIVAL = 'survival';
export const GAME_MODE_CREATIVE = 'creative';
export const HEALTH_MAX = 20; // 10 hearts
export const HUNGER_MAX = 20;
export const FALL_DAMAGE_THRESHOLD_M_S = 6; // impact speed above this causes damage
export const FALL_DAMAGE_MULTIPLIER = 2; // damage per m/s above threshold
export const DROWN_DAMAGE_PER_S = 2; // damage per second when out of air
export const AIR_MAX_S = 15; // seconds the player can hold their breath
