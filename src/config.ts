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
export const TERRAIN_MAX_M = 2475; // highest terrain surface: 2,450 m from the fields plus the detail noise (src/world/shape.ts)
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
export const GEOLOGY_LAYER_M = 12; // thickness of one rock layer (granite, diorite, andesite, sandstone), before the warp
export const GEOLOGY_WARP_M = 400; // horizontal size of the noise that bends the rock layers
export const BARE_ROCK_AMP_M = 12; // columns with at least this much detail amplitude have no soil: bare rock
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

// ---- UI ----
export const HOTBAR_SIZE = 9;

// ---- Storage ----
export const SAVE_DB_NAME = 'voxel-game'; // IndexedDB database holding the world save
// localStorage keys of old saves. v1 (128-high columns) is never read, written or deleted; the interim v2 key
// (cubic chunks, development builds only) is deleted on start.
export const INTERIM_SAVE_KEY = 'voxel-game-save-v2';
export const SETTINGS_KEY = 'voxel-game-settings-v1';
export const AUTOSAVE_INTERVAL_S = 10;
