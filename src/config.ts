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
/** Crouching walks at this share of the walking speed; ladders are climbed at CLIMB_SPEED_M_S. */
export const CROUCH_FACTOR = 0.3;
export const CLIMB_SPEED_M_S = 2.4;
/** How hard flowing water pushes a swimmer along (m/s²). */
export const CURRENT_ACCEL_M_S2 = 6;
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
/** A boat's top speed on water; on land it drags at a tenth of that. */
export const BOAT_SPEED_M_S = 8;

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
/** Chance a random tick on open lit grass grows a plant on it (tall grass or a flower). */
export const REGROW_CHANCE = 0.01;
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
/** Biome borders dither: each cell's temperature and rainfall are nudged by up to half these before choosing. */
export const BIOME_JITTER_C = 1.6;
export const BIOME_JITTER_MM = 80;
/** Ground this rugged (detail amplitude) has no soil: bare rock. */
export const BARE_ROCK_AMP_M = 12;
/** Typical length (m) of a stretch of stony (gravel and stone) or sandy shore. */
export const STONY_SHORE_M = 60;

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
/** Groundwater: caves below this level (varying by place) are flooded, with lava instead below LAVA_DEPTH_M. */
export const AQUIFER_LEVEL_M = -42;
export const AQUIFER_AMPLITUDE_M = 30;
export const AQUIFER_SCALE_M = 160;
export const LAVA_DEPTH_M = -100;

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

// ---- Calendar ----
/** Days per season; a year is four seasons. */
export const DAYS_PER_SEASON = 7;
export const MOON_CYCLES_PER_YEAR = 4;
/** How high the sun gets at noon (radians above the horizon) in midwinter and midsummer. */
export const SUN_NOON_WINTER_RAD = 0.75;
export const SUN_NOON_SUMMER_RAD = 1.35;

// ---- Sky, fog and horizon ----
/** Far terrain is drawn as a coarse heightfield out to this distance. */
export const HORIZON_RADIUS_M = 2000;
/** The heightfield is rebuilt when the player is this far from where it was last built. */
export const HORIZON_RECENTER_M = 40;
/** Fog starts at this share of the view distance and is complete at the horizon. */
export const FOG_START_SHARE = 0.5;
/** Under ground: fog closes in to this distance and turns dark. */
export const CAVE_FOG_M = 30;
/** Under water: blue fog this far. */
export const UNDERWATER_FOG_M = 9;

// ---- Weather ----
export const WEATHER_PRESSURE_WAVELENGTH_M = 6000;
export const WEATHER_HUMIDITY_WAVELENGTH_M = 3000;
/** Weather fronts drift east at this speed. */
export const WEATHER_WIND_SPEED_M_S = 3;
export const WEATHER_SEASONAL_AMPLITUDE_C = 10;
export const WEATHER_PRECIP_THRESHOLD = 0.1;
export const WEATHER_TEMP_SNOW_C = -2;
export const WEATHER_TEMP_RAIN_C = 2;
export const WEATHER_STORM_PRESSURE = -0.5;
export const WEATHER_STORM_HUMIDITY = 0.62;
export const WEATHER_STORM_TEMP_C = 10;
/** Seconds between weather samples at the player; values ease between samples. */
export const WEATHER_SAMPLE_S = 2;
export const CLOUD_HEIGHT_M = 100;
export const CLOUD_TEXEL_M = 12;
export const RAIN_SPEED_M_S = 9;
export const SNOW_SPEED_M_S = 1.5;
/** Precipitation particles fill a box this wide and tall around the camera. */
export const PRECIP_BOX_M = 24;
export const LIGHTNING_MEAN_INTERVAL_S = 12;
/** Strikes land this far from the player (m), most of them far off; thunder follows at the speed of sound. */
export const LIGHTNING_NEAR_M = 6;
export const LIGHTNING_FAR_M = 600;
export const SOUND_SPEED_M_S = 343;
/** A strike hurts whatever stands under open sky within this distance (m), by this much. */
export const LIGHTNING_REACH_M = 3;
export const LIGHTNING_DAMAGE = 8;
/** Snow and ice: random updates per loaded column near the player per simulation tick. */
export const WEATHER_TICKS_PER_COLUMN = 1;
export const SNOW_SETTLE_CHANCE = 0.05;
export const SNOW_MELT_CHANCE = 0.1;
export const ICE_FREEZE_CHANCE = 0.05;
export const ICE_THAW_CHANCE = 0.1;

// ---- Rivers and lakes ----
/**
 * Levels of the drainage network, from streams to big rivers: node spacing, the share of segments that carry water,
 * and channel width and depth.
 */
export const RIVER_LEVELS = [
  { spacingM: 200, share: 0.35, widthM: 2.4, depthM: 1.2 },
  { spacingM: 420, share: 0.6, widthM: 4.8, depthM: 1.8 },
  { spacingM: 900, share: 1, widthM: 9.6, depthM: 3 },
] as const;
/** Rivers wander off the straight line between nodes by up to this much. */
export const RIVER_MEANDER_M = 18;
export const RIVER_MEANDER_WAVELENGTH_M = 90;
/** Share of the water's edge (where the ground is just above the water) that grows reeds. */
export const REED_CHANCE = 0.15;
export const LILY_PAD_CHANCE = 0.04;

// ---- Survival ----
/** How far from the origin a new world looks for dry, open, level ground to start the player on. */
export const SPAWN_SEARCH_M = 2000;
export type Difficulty = 'peaceful' | 'normal' | 'hard';
/** Per difficulty: share of the hostile cap that may spawn, damage they deal, and how fast hunger drains. */
export const DIFFICULTY: Readonly<Record<Difficulty, { hostiles: number; damage: number; hunger: number }>> = {
  peaceful: { hostiles: 0, damage: 0, hunger: 0.5 },
  normal: { hostiles: 1, damage: 1, hunger: 1 },
  hard: { hostiles: 1.5, damage: 1.5, hunger: 1.25 },
};
export const MAX_HEALTH = 20;
export const MAX_HUNGER = 20;
/** Hunger lost per second, and extra while sprinting. */
export const HUNGER_PER_S = 0.012;
export const SPRINT_HUNGER_PER_S = 0.05;
/** Health regained per second while hunger is at least REGEN_HUNGER. */
export const REGEN_PER_S = 0.25;
export const REGEN_HUNGER = 18;
/** Health lost per second while starving (hunger 0). */
export const STARVE_PER_S = 0.25;
/** Falls faster than this (m/s) on landing hurt, one point per m/s beyond it. */
export const SAFE_FALL_SPEED_M_S = 10;
export const BREATH_S = 15;
export const DROWN_PER_S = 2;
export const LAVA_PER_S = 8;
/** After touching lava or fire a body burns this long (water puts it out), losing BURN_PER_S health a second. */
export const BURN_S = 4;
export const BURN_PER_S = 1;
/**
 * Body temperature (°C). The body holds BODY_NORMAL_C while the felt temperature is in the comfortable band, and drifts
 * by BODY_RATE_PER_S per second for every degree outside it. Below BODY_COLD_C or above BODY_HOT_C it hurts.
 */
export const BODY_NORMAL_C = 37;
export const BODY_COLD_C = 35;
export const BODY_HOT_C = 39.5;
export const COMFORT_MIN_C = 8;
export const COMFORT_MAX_C = 34;
export const BODY_RATE_PER_S = 0.0015;
export const TEMPERATURE_DAMAGE_PER_S = 0.5;
/** Night air, a roof, wind (per m/s, out in the open) and being wet change the felt temperature by this much. */
export const NIGHT_COOLING_C = 6;
/** Night, for cooling and the night warning: before this time of day or after its mirror. */
export const NIGHT_BEFORE = 0.24;
export const SHELTER_C = 6;
export const WIND_CHILL_PER_M_S = 0.6;
export const WET_COOLING_C = 8;
/** Underground (no sky light, a few meters under the surface) the air is this temperature whatever the weather. */
export const CAVE_AIR_C = 12;
/** Heat felt beside a source (°C), falling off to nothing at HEAT_REACH_M. */
export const HEAT_SOURCES_C: Readonly<Record<string, number>> = { campfire: 22, lava: 25, flowing_lava: 25, lit_furnace: 12, torch: 4 };
export const HEAT_REACH_M = 3;
/** Seconds a furnace takes per item. */
export const SMELT_S = 8;
/** Chance a broken tall grass gives wheat seeds, and broken or decayed natural leaves a sapling. */
export const SEED_CHANCE = 0.12;
export const SAPLING_CHANCE = 0.05;
/** Chance a random tick on a lit crop grows it a stage, or on a lit sapling grows its tree. */
export const CROP_GROW_CHANCE = 0.3;
export const SAPLING_GROW_CHANCE = 0.1;

/** Dropped items: cube size, pick-up reach, delay before a thrown item can be picked up again, lifetime and cap. */
export const DROP_SIZE_M = 0.25;
export const DROP_PICKUP_M = 1.5;
export const DROP_PICKUP_DELAY_S = 1;
export const DROP_LIFETIME_S = 300;
export const DROP_CAP = 256;
/** Speed (m/s) of an item thrown with Q. */
export const DROP_THROW_M_S = 5;

// ---- Creatures ----
/** Most creatures alive near the player at once. */
export const CREATURE_CAP = 48;
export const HOSTILE_CAP = 12;
/** New creatures appear this far from the player, never closer; they leave beyond the despawn distance. */
export const SPAWN_MIN_M = 24;
export const SPAWN_MAX_M = 64;
export const DESPAWN_M = 110;
/** Seconds between spawn attempts. */
export const SPAWN_INTERVAL_S = 1.5;
/** Grazers notice and flee a player this close; hunters notice prey this close. */
export const FLEE_M = 8;
export const HUNT_M = 16;
export const ATTACK_REACH_M = 0.6;
export const ATTACK_COOLDOWN_S = 1.2;
/** Creatures do not walk off drops deeper than this. */
export const CREATURE_FALL_M = 3;
export const RUN_FACTOR = 1.8;
/** Animals follow a player holding their food from this far; fed ones look for a mate for FED_S seconds, can be fed
 * again BREED_COOLDOWN_S after breeding, and their young grow up in GROW_UP_S. */
export const FOLLOW_M = 10;
/** Seconds a fish takes to bite, at least and at most. */
export const FISH_MIN_S = 5;
export const FISH_MAX_S = 15;
export const FED_S = 30;
export const BREED_COOLDOWN_S = 300;
export const GROW_UP_S = 300;
/** Hits on a creature: by hand, with an axe, with other tools, and with a sword (plus the tool's tier each). */
export const HAND_DAMAGE = 1;
export const AXE_DAMAGE = 3;
export const TOOL_DAMAGE = 2;
export const SWORD_DAMAGE = 4;
/** Arrows: speed at full draw (m/s), seconds to full draw, damage at full draw; projectiles vanish after PROJECTILE_LIFE_S. */
export const ARROW_SPEED_M_S = 30;
export const BOW_DRAW_S = 0.8;
export const ARROW_DAMAGE = 6;
export const PROJECTILE_LIFE_S = 8;
/** Skulkers keep between these distances from the player and shoot bolts this often, this fast. */
export const ARCHER_NEAR_M = 7;
export const ARCHER_FAR_M = 15;
export const ARCHER_SHOT_S = 2.5;
export const BOLT_SPEED_M_S = 30;
/** Hostiles get tougher with depth: this much more health per 100 m below sea level. */
export const DEPTH_TOUGHNESS_PER_100M = 0.5;
/** Hostiles never spawn where block light is at least this (torch-lit rooms are safe). */
export const SAFE_LIGHT = 8;
/** A hit at full strength needs this long since the last one; quicker hits do a share of the damage. */
export const PLAYER_ATTACK_COOLDOWN_S = 0.6;
/** Campfires: seconds to cook one item, and how many fit on one. */
export const CAMPFIRE_COOK_S = 20;
export const CAMPFIRE_SLOTS = 4;
export const KNOCKBACK_M_S = 5;

// ---- Building (creative) ----
/** Largest box fill, along each side. */
export const BUILD_MAX_M = 19.2;
/** Cells a box fill changes per tick; the rest follow on the next ticks. */
export const BUILD_CELLS_PER_TICK = 1500;
/** Undo steps kept. */
export const UNDO_STEPS = 32;
