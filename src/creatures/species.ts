type RGB = readonly [number, number, number];

/** How a species lives, with sizes and speeds in meters. Ported from the old game. */
/** A boss's named attacks: a leap that lands hard, a swooping dive, a ground stomp, a thrown ice boulder, spat venom. */
export type BossMove = 'slam' | 'dive' | 'stomp' | 'boulder' | 'spit';

export interface Species {
  key: string;
  name: string;
  halfWidthM: number;
  heightM: number;
  speedM_S: number;
  health: number;
  /** Eats grass, and flees from the player and from predators. */
  grazer: boolean;
  /** Species it hunts; a hostile species also hunts the player. */
  prey: readonly string[];
  hostile: boolean;
  /** Keeps together with others of its kind. */
  herds: boolean;
  /** Active at night and asleep by day; everything else sleeps at night. */
  nocturnal: boolean;
  medium: 'land' | 'water';
  /** Damage one bite deals. */
  attack: number;
  /** Biomes it spawns in ('dark': in darkness anywhere on land), and how many per group. */
  biomes: readonly string[];
  group: readonly [number, number];
  colours: { body: RGB; head: RGB; legs: RGB };
  /** Raw meat dropped on death, and leather (from hide). */
  meat: number;
  leather?: number;
  /** Other items left on death: [item key, count, chance (default 1)]. Rare drops have a small chance. */
  loot?: readonly (readonly [string, number, number?])[];
  /** Food it follows a player holding, and breeds when fed. */
  food?: readonly string[];
  /** A bite may also start a status effect on the player: [effect (game/effects.ts, or 'burning'), seconds, chance]. */
  inflicts?: readonly [effect: string, seconds: number, chance: number];
  /** Keeps its distance and shoots bolts instead of biting. */
  ranged?: boolean;
  /** Climbs straight up walls. */
  climbs?: boolean;
  /** Guards an ember shrine: never spawns on its own, is always awake, stays by day and does not burn. */
  guardian?: boolean;
  /** Sound pitch, 0..1: low for big animals. */
  voice: number;
  /** A peaceful merchant: right click opens trade offers. */
  trader?: boolean;
  /** Moves in hops, like a slime: still on the ground, gliding through the air. */
  hops?: boolean;
  /** Flies: no gravity, flutters a few cells above the ground. */
  flies?: boolean;
  /** A monster that is out by day too, and spawns in daylight. */
  daytime?: boolean;
  /** Lava and fire do not hurt it. */
  fireproof?: boolean;
  /** A boss: its health shows in a bar across the top of the screen. */
  boss?: boolean;
  /** A boss's named attacks (see Creatures.bossMove), and the smaller kind it calls as it is struck. */
  moves?: readonly BossMove[];
  brood?: string;
  /** A boss: the item that calls it, whether it only comes at night, how high above the player it arrives, and the
   * line announcing it. */
  summon?: { readonly item: string; readonly night?: boolean; readonly height: number; readonly line: string };
  /** Lives in a village house: stays near home by day and sleeps in its bed at night. Never spawns on its own. */
  villager?: boolean;
  /** Which shop list a trader offers (see workshops.ts); the general list when unset. */
  shop?: string;
}

const BASE = { grazer: false, prey: [], hostile: false, herds: false, nocturnal: false, medium: 'land', attack: 0, meat: 1, voice: 0.5 } as const;
const FORESTS = ['temperate_deciduous', 'birch', 'old_growth_dark_forest', 'taiga', 'snowy_taiga'];
const GRASSLAND = ['plains', 'meadow', 'steppe', 'savanna', 'shrubland', 'alpine_meadow'];

export const SPECIES: readonly Species[] = [
  { ...BASE, key: 'deer', food: ['wheat', 'carrots'], leather: 1, name: 'Deer', halfWidthM: 0.35, heightM: 1.4, speedM_S: 2.2, health: 10, grazer: true, herds: true,
    biomes: [...FORESTS, 'plains', 'meadow'], group: [2, 4], colours: { body: [150, 104, 62], head: [128, 88, 52], legs: [110, 78, 48] }, meat: 3, voice: 0.6 },
  { ...BASE, key: 'rabbit', food: ['carrots'], name: 'Rabbit', halfWidthM: 0.15, heightM: 0.35, speedM_S: 2.6, health: 3, grazer: true,
    biomes: [...GRASSLAND, 'tundra', 'desert', 'birch'], group: [1, 3], colours: { body: [168, 140, 110], head: [176, 150, 120], legs: [200, 190, 175] }, voice: 0.9 },
  { ...BASE, key: 'boar', food: ['potatoes', 'carrots'], name: 'Boar', halfWidthM: 0.35, heightM: 0.9, speedM_S: 1.8, health: 12, grazer: true, attack: 2,
    biomes: ['temperate_deciduous', 'old_growth_dark_forest', 'shrubland'], group: [1, 3], colours: { body: [92, 70, 54], head: [80, 60, 46], legs: [60, 46, 36] }, meat: 3, voice: 0.3 },
  { ...BASE, key: 'wolf', name: 'Wolf', halfWidthM: 0.3, heightM: 0.85, speedM_S: 3, health: 12, prey: ['deer', 'rabbit', 'sheep', 'goat'],
    herds: true, nocturnal: true, attack: 3, biomes: ['taiga', 'snowy_taiga', 'tundra', 'steppe'], group: [2, 4],
    colours: { body: [130, 130, 128], head: [150, 150, 146], legs: [110, 110, 108] }, meat: 0, voice: 0.45 },
  { ...BASE, key: 'bear', name: 'Bear', halfWidthM: 0.6, heightM: 1.4, speedM_S: 1.8, health: 24, prey: ['deer', 'boar'], attack: 5,
    biomes: ['taiga', 'old_growth_dark_forest', 'snowy_taiga'], group: [1, 1], colours: { body: [84, 58, 40], head: [96, 66, 46], legs: [70, 48, 34] }, meat: 4, voice: 0.15 },
  { ...BASE, key: 'fox', name: 'Fox', halfWidthM: 0.2, heightM: 0.5, speedM_S: 3, health: 6, prey: ['rabbit'], nocturnal: true,
    biomes: ['taiga', 'birch', 'meadow', 'tundra'], group: [1, 2], colours: { body: [206, 110, 44], head: [216, 124, 56], legs: [60, 40, 32] }, voice: 0.75 },
  { ...BASE, key: 'sheep', food: ['wheat'], name: 'Sheep', halfWidthM: 0.4, heightM: 1.1, speedM_S: 1.4, health: 8, grazer: true, herds: true,
    biomes: ['plains', 'meadow', 'alpine_meadow', 'steppe'], group: [3, 5], colours: { body: [232, 230, 222], head: [70, 62, 56], legs: [70, 62, 56] }, meat: 2, loot: [['wool', 1]], voice: 0.7 },
  { ...BASE, key: 'cow', food: ['wheat'], leather: 1, name: 'Cow', halfWidthM: 0.45, heightM: 1.4, speedM_S: 1.3, health: 10, grazer: true, herds: true,
    biomes: ['plains', 'meadow', 'savanna'], group: [2, 4], colours: { body: [74, 56, 44], head: [230, 226, 220], legs: [60, 46, 38] }, meat: 3, voice: 0.25 },
  { ...BASE, key: 'goat', food: ['wheat'], name: 'Mountain goat', halfWidthM: 0.3, heightM: 1, speedM_S: 2, health: 8, grazer: true, herds: true,
    biomes: ['alpine_meadow', 'snowcapped_peaks', 'scree'], group: [2, 3], colours: { body: [220, 216, 204], head: [200, 196, 186], legs: [120, 116, 108] }, meat: 2, voice: 0.8 },
  { ...BASE, key: 'camel', food: ['wheat'], name: 'Camel', halfWidthM: 0.45, heightM: 1.9, speedM_S: 1.6, health: 14, grazer: true,
    biomes: ['desert', 'badlands', 'savanna'], group: [1, 2], colours: { body: [196, 160, 104], head: [186, 150, 96], legs: [170, 136, 88] }, meat: 3, voice: 0.2 },
  { ...BASE, key: 'fish', name: 'Fish', halfWidthM: 0.12, heightM: 0.2, speedM_S: 1.5, health: 2, medium: 'water',
    biomes: ['water'], group: [2, 5], colours: { body: [96, 140, 170], head: [110, 156, 186], legs: [80, 120, 150] }, voice: 1 },
  { ...BASE, key: 'zombie', name: 'Zombie', halfWidthM: 0.28, heightM: 1.8, speedM_S: 1.4, health: 20, hostile: true, nocturnal: true,
    attack: 3, biomes: ['dark'], group: [1, 2], colours: { body: [60, 110, 140], head: [96, 150, 90], legs: [70, 60, 120] }, meat: 0, loot: [['bone', 1, 0.4], ['heart_locket', 1, 0.01]], voice: 0.35 },
  // Hostiles spawn: 'dark' in darkness anywhere, 'cave' in dark caves, 'deep' in caves below -60 m, or in the dark in the
  // biomes listed.
  { ...BASE, key: 'skulker', name: 'Skulker', halfWidthM: 0.25, heightM: 1.7, speedM_S: 1.6, health: 14, hostile: true, nocturnal: true,
    ranged: true, attack: 3, biomes: ['dark'], group: [1, 1], colours: { body: [70, 64, 82], head: [200, 196, 176], legs: [50, 46, 60] },
    meat: 0, loot: [['feather', 2], ['arrow', 3, 0.5], ['feather_charm', 1, 0.02]], voice: 0.55 },
  { ...BASE, key: 'crawler', name: 'Cave crawler', halfWidthM: 0.45, heightM: 0.6, speedM_S: 2.4, health: 10, hostile: true, nocturnal: true, inflicts: ['poisoned', 6, 0.5],
    climbs: true, attack: 2, biomes: ['cave'], group: [1, 3], colours: { body: [44, 40, 38], head: [120, 30, 30], legs: [36, 32, 30] },
    meat: 0, loot: [['string', 2], ['swift_anklet', 1, 0.015]], voice: 0.85 },
  { ...BASE, key: 'brute', name: 'Frost brute', halfWidthM: 0.5, heightM: 2.2, speedM_S: 1.1, health: 40, hostile: true, nocturnal: true, inflicts: ['slowed', 4, 0.6],
    attack: 7, biomes: ['deep', 'tundra', 'snowy_taiga', 'glacier', 'snowcapped_peaks'], group: [1, 1],
    colours: { body: [170, 196, 214], head: [210, 226, 236], legs: [120, 140, 160] }, meat: 0, loot: [['bone', 3], ['frost_shard', 2, 0.6], ['iron_band', 1, 0.04]], voice: 0.1 },
  { ...BASE, key: 'warden', name: 'Ember Warden', halfWidthM: 0.55, heightM: 2.5, speedM_S: 1.3, health: 160, hostile: true, guardian: true,
    attack: 8, biomes: [], group: [1, 1], colours: { body: [58, 40, 44], head: [255, 120, 40], legs: [40, 30, 34] }, meat: 0,
    loot: [['ember_crystal', 3], ['diamond', 2], ['life_crystal', 3], ['ember_ring', 1], ['heart_locket', 1, 0.5]], voice: 0.05 },
  { ...BASE, key: 'desert_stalker', name: 'Dune Stalker', halfWidthM:.48, heightM:.8, speedM_S:2.4, health:24, inflicts: ['bleeding', 6, 0.35],
    hostile:true, nocturnal:true, attack:4, biomes:['desert','badlands'], group:[1,2], meat:0, loot:[['iron_ingot',1],['swift_anklet',1,0.04]],
    colours:{body:[186,145,75],head:[210,174,98],legs:[144,106,53]}, voice:.65 },
  { ...BASE, key:'swamp_hollow', name:'Mire Hollow', halfWidthM:.4, heightM:2.1, speedM_S:1.3, health:32, inflicts: ['poisoned', 8, 0.5],
    hostile:true, nocturnal:true, attack:5, biomes:['swamp'], group:[1,2], meat:0, loot:[['moss',3],['bone',1],['gill_pendant',1,0.05]],
    colours:{body:[72,95,44],head:[80,110,48],legs:[64,78,36]}, voice:.25 },
  { ...BASE, key:'snow_prowler', name:'Snow Prowler', halfWidthM:.38, heightM:1.15, speedM_S:2.8, health:26, inflicts: ['slowed', 3, 0.5],
    hostile:true, nocturnal:true, attack:4, biomes:['snowy_taiga','tundra','glacier','snowcapped_peaks'], group:[1,2],meat:0,
    loot:[['leather',2],['bone',1],['frost_shard',1,0.5],['feather_charm',1,0.03]],colours:{body:[223,234,239],head:[238,244,248],legs:[193,213,226]},voice:.4 },
  { ...BASE, key:'trader',name:'Traveling Trader',halfWidthM:.28,heightM:1.8,speedM_S:.8,health:30,trader:true,
    biomes:['plains','meadow','temperate_deciduous','birch','savanna'],group:[1,1],meat:0,
    colours:{body:[45,99,111],head:[207,162,116],legs:[57,54,66]},voice:.5 },
  // Slimes hop about by day and night; their kind follows where they live.
  { ...BASE, key: 'slime', name: 'Green Slime', halfWidthM: 0.3, heightM: 0.55, speedM_S: 2.2, health: 8, hostile: true, daytime: true, hops: true,
    attack: 2, biomes: [...GRASSLAND, ...FORESTS], group: [1, 3], colours: { body: [104, 200, 92], head: [62, 150, 58], legs: [30, 60, 30] },
    meat: 0, loot: [['gel', 2], ['gel', 1, 0.5], ['swift_anklet', 1, 0.01]], voice: 0.9 },
  { ...BASE, key: 'cave_slime', name: 'Cave Slime', halfWidthM: 0.35, heightM: 0.65, speedM_S: 2.4, health: 14, hostile: true, hops: true,
    attack: 3, biomes: ['cave'], group: [1, 2], colours: { body: [80, 140, 230], head: [44, 90, 180], legs: [20, 40, 80] },
    meat: 0, loot: [['gel', 3], ['iron_ingot', 1, 0.2], ['iron_band', 1, 0.015]], voice: 0.85 },
  { ...BASE, key: 'ember_slime', name: 'Ember Slime', halfWidthM: 0.4, heightM: 0.75, speedM_S: 2.6, health: 22, hostile: true, hops: true, fireproof: true, inflicts: ['burning', 3, 0.5],
    attack: 5, biomes: ['deep'], group: [1, 2], colours: { body: [240, 120, 40], head: [200, 60, 20], legs: [255, 220, 120] },
    meat: 0, loot: [['gel', 3], ['ember_crystal', 1, 0.25], ['ember_ring', 1, 0.02]], voice: 0.7 },
  ...(['farmer', 'smith', 'herbalist', 'guide', 'merchant', 'nurse', 'alchemist'] as const).map((job): Species => ({ ...BASE, key: job, name: job[0]!.toUpperCase() + job.slice(1),
    halfWidthM: 0.28, heightM: 1.8, speedM_S: 0.9, health: 30, trader: true, villager: true, shop: job, biomes: [], group: [1, 1], meat: 0,
    colours: { body: [80, 110, 70], head: [207, 162, 116], legs: [70, 60, 50] }, voice: 0.5 })),
  { ...BASE, key: 'mimic', name: 'Mimic', halfWidthM: 0.45, heightM: 0.9, speedM_S: 3.2, health: 90, hostile: true, daytime: true, hops: true,
    attack: 7, biomes: [], group: [1, 1], colours: { body: [138, 90, 44], head: [106, 110, 116], legs: [240, 234, 216] }, meat: 0,
    loot: [['gold_ingot', 4], ['life_crystal', 1, 0.5], ['cloud_charm', 1, 0.3], ['heart_locket', 1, 0.3], ['ember_ring', 1, 0.2], ['iron_band', 1, 0.3]], voice: 0.35 },
  { ...BASE, key: 'king_slime', name: 'Slime King', halfWidthM: 1.0, heightM: 1.7, speedM_S: 2.8, health: 240, hostile: true, daytime: true, hops: true,
    boss: true, moves: ['slam'], brood: 'slime', summon: { item: 'slime_crown', height: 6, line: 'The Slime King has awoken!' },
    attack: 6, biomes: [], group: [1, 1], colours: { body: [80, 150, 240], head: [40, 90, 200], legs: [200, 230, 255] },
    meat: 0, loot: [['gel', 30], ['life_crystal', 2], ['cloud_charm', 1], ['swift_anklet', 1, 0.6], ['heart_locket', 1, 0.3], ['gold_ingot', 4]], voice: 0.3 },
  { ...BASE, key: 'gloom_moth', name: 'Gloom Moth', halfWidthM: 0.3, heightM: 0.5, speedM_S: 2.8, health: 10, hostile: true, nocturnal: true, flies: true,
    attack: 2, biomes: [...FORESTS, 'swamp', 'plains', 'meadow'], group: [1, 2], colours: { body: [96, 84, 120], head: [70, 60, 90], legs: [200, 220, 120] },
    meat: 0, loot: [['string', 1, 0.6], ['feather', 1, 0.5], ['feather_charm', 1, 0.02]], voice: 0.95 },
  { ...BASE, key: 'gloom_matriarch', name: 'Gloom Matriarch', halfWidthM: 1.1, heightM: 1.5, speedM_S: 3.4, health: 320, hostile: true, nocturnal: true,
    flies: true, boss: true, moves: ['dive'], brood: 'gloom_moth', summon: { item: 'moth_lure', night: true, height: 10, line: 'The Gloom Matriarch descends!' },
    attack: 7, biomes: [], group: [1, 1], colours: { body: [120, 96, 150], head: [80, 64, 110], legs: [230, 250, 140] },
    meat: 0, loot: [['life_crystal', 3], ['feather_charm', 1], ['ember_staff', 1, 0.5], ['cloud_charm', 1, 0.5], ['gold_ingot', 6]], voice: 0.2 },
  { ...BASE, key: 'frost_colossus', name: 'Frost Colossus', halfWidthM: 0.9, heightM: 3.4, speedM_S: 1.5, health: 420, hostile: true, daytime: true,
    boss: true, moves: ['stomp', 'boulder'], brood: 'snow_prowler', inflicts: ['slowed', 4, 0.6],
    summon: { item: 'frost_sigil', height: 3, line: 'The Frost Colossus rises from the snow!' },
    attack: 9, biomes: [], group: [1, 1], colours: { body: [170, 205, 230], head: [220, 238, 250], legs: [110, 140, 170] },
    meat: 0, loot: [['frost_shard', 12], ['life_crystal', 2], ['frost_heart', 1], ['iron_band', 1, 0.5], ['diamond', 3], ['gold_ingot', 6]], voice: 0.05 },
  { ...BASE, key: 'hornet', name: 'Jungle Hornet', halfWidthM: 0.25, heightM: 0.45, speedM_S: 3.4, health: 9, hostile: true, daytime: true, flies: true,
    inflicts: ['poisoned', 5, 0.5], attack: 3, biomes: ['tropical_rainforest', 'swamp'], group: [1, 3],
    colours: { body: [230, 180, 40], head: [40, 32, 20], legs: [255, 230, 120] }, meat: 0, loot: [['stinger', 1, 0.6]], voice: 1 },
  { ...BASE, key: 'hive_mother', name: 'Hive Mother', halfWidthM: 1.0, heightM: 1.4, speedM_S: 3.6, health: 360, hostile: true, daytime: true, flies: true,
    boss: true, moves: ['dive', 'spit'], brood: 'hornet', inflicts: ['poisoned', 6, 0.6],
    summon: { item: 'royal_bait', height: 8, line: 'The Hive Mother answers, humming with fury!' },
    attack: 7, biomes: [], group: [1, 1], colours: { body: [240, 170, 30], head: [50, 36, 20], legs: [255, 240, 160] },
    meat: 0, loot: [['stinger', 10], ['life_crystal', 2], ['hive_charm', 1], ['swift_anklet', 1, 0.4], ['gold_ingot', 6]], voice: 0.9 },
  { ...BASE, key: 'bat', name: 'Cave Bat', halfWidthM: 0.2, heightM: 0.4, speedM_S: 3.2, health: 4, hostile: true, flies: true,
    attack: 1, biomes: ['cave'], group: [1, 3], colours: { body: [70, 56, 52], head: [86, 68, 60], legs: [50, 40, 40] },
    meat: 0, loot: [['leather', 1, 0.3], ['cloud_charm', 1, 0.015]], voice: 1 },
  { ...BASE, key: 'skeleton', name: 'Skeleton', halfWidthM: 0.28, heightM: 1.8, speedM_S: 1.7, health: 22, hostile: true, nocturnal: true, ranged: true,
    attack: 4, biomes: ['cave', 'deep'], group: [1, 2], colours: { body: [226, 220, 200], head: [236, 232, 214], legs: [200, 194, 176] },
    meat: 0, loot: [['bone', 2], ['arrow', 2, 0.4], ['iron_ingot', 1, 0.2], ['iron_band', 1, 0.02]], voice: 0.6 },
];

export const SPECIES_BY_KEY = new Map(SPECIES.map((s) => [s.key, s]));
