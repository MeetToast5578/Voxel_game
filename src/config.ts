/**
 * Every tunable number in the game lives here.
 * Do not hard-code these values anywhere else; import them.
 */

// ---- World ----
export const CHUNK_SIZE = 16; // blocks along each axis; chunks are cubes and the world has no height limit
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE;
export const SEA_LEVEL = 40; // air at y <= SEA_LEVEL becomes water during generation
export const DEFAULT_SEED = 1337;

// ---- Scale ----
export const BLOCK_SIZE_M = 0.6; // one block is 0.6 m; the player is about 3 blocks tall

/** Converts a length in meters to blocks. Speeds (m/s) and accelerations (m/s²) convert the same way. */
export function metersToBlocks(meters: number): number {
  return meters / BLOCK_SIZE_M;
}

// ---- Chunk streaming ----
export const DEFAULT_RENDER_DISTANCE = 8; // radius, in chunks (a chunk is 9.6 m wide)
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
export const STEP_HEIGHT = 1; // highest ledge, in blocks, the player walks up onto without jumping
export const STEP_SMOOTH_S = 0.12; // seconds the camera takes to catch up after a full 1-block step

// ---- Swimming ----
export const SWIM_GRAVITY = metersToBlocks(6);
export const SWIM_UP_SPEED = metersToBlocks(4);
export const SWIM_SINK_SPEED = metersToBlocks(2);
export const SWIM_SPEED_FACTOR = 0.6;
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

// ---- Time of day ----
export const DAY_LENGTH_S = 600; // seconds for a full day + night
export const START_TIME_OF_DAY = 0.3; // 0 sunrise, 0.25 noon, 0.5 sunset, 0.75 midnight
export const MIN_DAYLIGHT = 0.15;

// ---- UI ----
export const HOTBAR_SIZE = 9;

// ---- Storage ----
export const SAVE_KEY = 'voxel-game-save-v2'; // v1 saves (128-high columns) are neither loaded nor overwritten
export const SETTINGS_KEY = 'voxel-game-settings-v1';
export const AUTOSAVE_INTERVAL_S = 10;
