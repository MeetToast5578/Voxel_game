/**
 * Every tunable number in the game lives here.
 * Do not hard-code these values anywhere else; import them.
 */

// ---- World ----
export const CHUNK_SIZE = 16; // blocks along X and Z
export const WORLD_HEIGHT = 128; // blocks along Y (y = 0..127)
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT;
export const SEA_LEVEL = 40; // air at y <= SEA_LEVEL becomes water during generation
export const DEFAULT_SEED = 1337;

// ---- Chunk streaming ----
export const DEFAULT_RENDER_DISTANCE = 6; // radius, in chunks
export const MIN_RENDER_DISTANCE = 2;
export const MAX_RENDER_DISTANCE = 12;
export const GEN_BUDGET_MS = 4; // max time per frame spent generating terrain
export const MESH_BUDGET_MS = 4; // max time per frame spent building meshes
export const SPAWN_READY_RADIUS = 1; // chunks around spawn that must be meshed before the player spawns

// ---- Player ----
export const PLAYER_HALF_WIDTH = 0.3;
export const PLAYER_HEIGHT = 1.8;
export const EYE_HEIGHT = 1.62;
export const WALK_SPEED = 4.3; // blocks per second
export const SPRINT_SPEED = 6.0;
export const FLY_SPEED = 12;
export const GRAVITY = 28; // blocks per second squared
export const JUMP_SPEED = 8.7; // jump height ~1.28 blocks
export const TERMINAL_VELOCITY = 50;
export const GROUND_ACCEL = 20; // how quickly velocity reaches the target speed (per second)
export const AIR_ACCEL = 5;
export const REACH = 6; // max distance for breaking/placing blocks
export const BREAK_REPEAT_S = 0.25; // holding a mouse button repeats break/place this often
export const DEFAULT_MOUSE_SENSITIVITY = 0.0025; // radians per pixel of mouse movement

// ---- Swimming ----
export const SWIM_GRAVITY = 6;
export const SWIM_UP_SPEED = 4;
export const SWIM_SINK_SPEED = 2;
export const SWIM_SPEED_FACTOR = 0.6;

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
export const SAVE_KEY = 'voxel-game-save-v1';
export const SETTINGS_KEY = 'voxel-game-settings-v1';
export const AUTOSAVE_INTERVAL_S = 10;
