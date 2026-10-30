/**
 * Every tunable number of the new engine. Lengths are meters, times seconds, speeds m/s.
 * A count of cells is never written by hand: it is an `_CELLS` value derived from its `_M` value with `cells()`.
 * Shape fractions (a slab is half a cell) are fractions of a cell, not lengths, and live with the shapes.
 */

export const BLOCK_SIZE_M = 0.6;

/** A length in meters as a (fractional) number of cells. Speeds and accelerations convert the same way. */
export function toCells(meters: number): number {
  return meters / BLOCK_SIZE_M;
}

/** A length in meters as a whole number of cells, at least 1. */
export function cells(meters: number): number {
  return Math.max(1, Math.round(meters / BLOCK_SIZE_M));
}

// ---- Chunks ----
/** Cells along each axis of a cubic chunk. A power of two: coordinate math uses shifts. */
export const CHUNK_SHIFT = 4;
export const CHUNK_SIZE = 1 << CHUNK_SHIFT;
export const CHUNK_MASK = CHUNK_SIZE - 1;
export const CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE;
export const CHUNK_VOLUME = CHUNK_AREA * CHUNK_SIZE;
export const CHUNK_M = CHUNK_SIZE * BLOCK_SIZE_M;

// ---- Light ----
/** Light levels 0..MAX_LIGHT, falling by one per cell. A torch at 15 reaches 9 m. */
export const MAX_LIGHT = 15;

// ---- Terrain ----
/** Water fills open cells below this height. */
export const SEA_LEVEL_M = 0;
/** Dirt (or sand on beaches) between the surface and the stone. */
export const SOIL_DEPTH_M = 1.8;
/** Land this close above sea level is beach sand. */
export const BEACH_BAND_M = 1;
/** Sea floor deeper than this below sea level is gravel instead of sand. */
export const DEEP_SEA_FLOOR_M = 4;
/** Feature size of the 3D terrain detail noise. */
export const DETAIL_H_M = 16;
export const DETAIL_V_M = 10;

// ---- Streaming ----
/** Default horizontal view radius, in chunks (12 chunks is 115 m). */
export const DEFAULT_VIEW_CHUNKS = 12;
export const MIN_VIEW_CHUNKS = 4;
export const MAX_VIEW_CHUNKS = 32;
/** Around the player, every chunk this many chunks across and up/down is loaded, surface or not. */
export const NEAR_RADIUS_CHUNKS = 3;
export const NEAR_HEIGHT_CHUNKS = 2;
/** Generated columns kept in each worker's cache. */
export const COLUMN_CACHE = 4096;
/** Jobs each worker may have in flight. */
export const JOBS_PER_WORKER = 4;

// ---- Camera ----
export const FLY_SPEED_M_S = 12;
export const FLY_FAST_FACTOR = 4;
export const EYE_HEIGHT_M = 1.62;

// ---- Time ----
/** Seconds in one full day and night. */
export const DAY_LENGTH_S = 1200;
/** Sky light multiplier at midnight (moonlight). */
export const NIGHT_DAYLIGHT = 0.22;

// ---- Player ----
/** Half the body's width: a little under half a cell, so the player fits one-cell gaps. */
export const PLAYER_HALF_WIDTH_M = 0.28;
export const PLAYER_HEIGHT_M = 1.75;
export const WALK_SPEED_M_S = 4.3;
export const SPRINT_SPEED_M_S = 6;
export const GRAVITY_M_S2 = 28;
/** Jump height is about 1.35 m. */
export const JUMP_SPEED_M_S = 8.7;
export const TERMINAL_SPEED_M_S = 50;
/** How quickly velocity reaches the target speed, per second, on the ground and in the air. */
export const GROUND_ACCEL = 20;
export const AIR_ACCEL = 5;
/** Highest ledge the player walks up onto (and down from) without jumping. */
export const STEP_HEIGHT_M = 0.6;
/** Seconds the camera takes to catch up after a step. */
export const STEP_SMOOTH_S = 0.12;
export const REACH_M = 6;
/** Holding a mouse button repeats breaking or placing this often. */
export const REPEAT_S = 0.25;
export const MOUSE_SENSITIVITY = 0.0025;

// ---- Swimming: buoyancy and quadratic drag ----
export const WATER_DENSITY = 1000;
/** The body floats with about 80% under water. */
export const PLAYER_DENSITY = 800;
/** Quadratic drag in water, a = -k |v| v, in 1/m. */
export const WATER_DRAG_PER_M = 0.9;
export const SWIM_THRUST_M_S2 = 6;
export const SWIM_UP_M_S2 = 6;

// ---- Saving ----
export const AUTOSAVE_S = 30;

// ---- Simulation ----
/** Block updates (fluids, falling blocks, plants) run at this rate. */
export const SIM_HZ = 20;
/** How fast fluids spread, one cell per (cell size / speed) seconds. */
export const WATER_FLOW_M_S = 3;
export const LAVA_FLOW_M_S = 0.5;
/** Seconds a sand or gravel cell waits before dropping one cell. */
export const FALL_DELAY_S = 0.05;
/** Random updates per loaded chunk per simulation tick (grass, leaves), within the simulation distance. */
export const RANDOM_TICKS_PER_CHUNK = 3;
/** Chunks this far from the player (horizontally) are simulated. Independent of the view distance. */
export const SIM_RADIUS_CHUNKS = 6;
/** Most scheduled updates handled per simulation tick; the rest wait for the next. */
export const MAX_TICKS_PER_STEP = 4000;
/** Leaves farther than this from a log (through other leaves) decay; as far as a tree's crown reaches. */
export const LEAF_REACH_M = 4.8;
/** Grass spreads onto dirt whose cell above has at least this much light. */
export const GRASS_MIN_LIGHT = 9;

// ---- Climate and biomes ----
export const TEMPERATURE_MIN_C = -30;
export const TEMPERATURE_MAX_C = 30;
export const TEMPERATURE_LAPSE_C_PER_KM = 6.5;
export const PRECIPITATION_MAX_MM = 2000;
/** Precipitation boost per unit of the largest detail amplitude (22 m): rain falls on rugged ground. */
export const OROGRAPHIC_LIFT = 0.3;
/** Surface blocks dither into the next biome over this distance from its border. */
export const BIOME_BLEND_M = 0.9;
/** Ground this rugged (detail amplitude) has no soil: bare rock. */
export const BARE_ROCK_AMP_M = 12;

// ---- Geology ----
export const GEOLOGY_LAYER_M = 12;
export const GEOLOGY_WARP_M = 400;
export const DEEPSLATE_DEPTH_M = -100;

// ---- Caves ----
export const CAVE_SCALE_H_M = 40;
export const CAVE_SCALE_V_M = 24;
export const CAVE_THRESHOLD = 0.012;
export const CAVE_CHEESE_SCALE_H_M = 96;
export const CAVE_CHEESE_SCALE_V_M = 48;
export const CAVE_CHEESE_THRESHOLD = 0.68;
/** The higher value a cavern needs to break through to the surface: a few mouths, not a sieve. */
export const CAVE_CHEESE_OPENING = 0.84;
/** Depth of cover over which a cavern grows back to full size. */
export const CAVE_CHEESE_FADE_M = 7.2;
export const CAVE_NOODLE_SCALE_H_M = 18;
export const CAVE_NOODLE_SCALE_V_M = 14;
export const CAVE_NOODLE_STRETCH = 2.5;
export const CAVE_NOODLE_THRESHOLD = 0.004;
/** No tunnel comes closer than this to the surface; only caverns break through. */
export const CAVE_NOODLE_ROOF_M = 1.2;
export const RAVINE_SCALE_M = 160;
export const RAVINE_BAND = 0.012;
export const RAVINE_ROOF_M = 1.8;
export const RAVINE_DEPTH_M = 30;
/** Ground this close above sea level keeps a solid roof this thick, so the sea does not drain into caves. */
export const SHORE_CAVE_BAND_M = 3;
export const SHORE_ROOF_M = 5;
export const SHORE_ROOF_CELLS = cells(SHORE_ROOF_M);

// ---- Trees and features ----
/** Tree anchors per square metre where the biome grows trees. */
export const TREE_DENSITY_PER_M2 = 0.012;
/** Share of a biome's trees that are its second species. */
export const SECONDARY_TREE_CHANCE = 0.3;
/** Farthest a tree reaches from its anchor; chunks look this far for trees that cross into them. */
export const TREE_REACH_M = 4.8;
export const TREE_REACH_CELLS = cells(TREE_REACH_M);
export const TREE_BRANCH_MIN_M = 1.2;
export const TREE_BRANCH_MAX_M = 2.4;
/** Per grass cell: chances of each kind of ground cover (flowers are weighted per biome). */
export const TALL_GRASS_CHANCE = 0.3;
export const FERN_CHANCE = 0.1;
export const FLOWER_CHANCE = 0.01;
export const MUSHROOM_CHANCE = 0.005;
/** Boulders and fallen logs: anchors per square metre on open ground. */
export const BOULDER_DENSITY_PER_M2 = 0.006;
export const BOULDER_RADIUS_M = 0.9;
export const FALLEN_LOG_DENSITY_PER_M2 = 0.004;
export const FALLEN_LOG_MIN_M = 1.2;
export const FALLEN_LOG_MAX_M = 2.4;
