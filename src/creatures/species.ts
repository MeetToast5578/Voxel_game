type RGB = readonly [number, number, number];

/** How a species lives, with sizes and speeds in meters. Ported from the old game. */
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
  /** Sound pitch, 0..1: low for big animals. */
  voice: number;
}

const BASE = { grazer: false, prey: [], hostile: false, herds: false, nocturnal: false, medium: 'land', attack: 0, meat: 1, voice: 0.5 } as const;
const FORESTS = ['temperate_deciduous', 'birch', 'old_growth_dark_forest', 'taiga', 'snowy_taiga'];
const GRASSLAND = ['plains', 'meadow', 'steppe', 'savanna', 'shrubland', 'alpine_meadow'];

export const SPECIES: readonly Species[] = [
  { ...BASE, key: 'deer', leather: 1, name: 'Deer', halfWidthM: 0.35, heightM: 1.4, speedM_S: 2.2, health: 10, grazer: true, herds: true,
    biomes: [...FORESTS, 'plains', 'meadow'], group: [2, 4], colours: { body: [150, 104, 62], head: [128, 88, 52], legs: [110, 78, 48] }, meat: 3, voice: 0.6 },
  { ...BASE, key: 'rabbit', name: 'Rabbit', halfWidthM: 0.15, heightM: 0.35, speedM_S: 2.6, health: 3, grazer: true,
    biomes: [...GRASSLAND, 'tundra', 'desert', 'birch'], group: [1, 3], colours: { body: [168, 140, 110], head: [176, 150, 120], legs: [200, 190, 175] }, voice: 0.9 },
  { ...BASE, key: 'boar', name: 'Boar', halfWidthM: 0.35, heightM: 0.9, speedM_S: 1.8, health: 12, grazer: true, attack: 2,
    biomes: ['temperate_deciduous', 'old_growth_dark_forest', 'shrubland'], group: [1, 3], colours: { body: [92, 70, 54], head: [80, 60, 46], legs: [60, 46, 36] }, meat: 3, voice: 0.3 },
  { ...BASE, key: 'wolf', name: 'Wolf', halfWidthM: 0.3, heightM: 0.85, speedM_S: 3, health: 12, prey: ['deer', 'rabbit', 'sheep', 'goat'],
    herds: true, nocturnal: true, attack: 3, biomes: ['taiga', 'snowy_taiga', 'tundra', 'steppe'], group: [2, 4],
    colours: { body: [130, 130, 128], head: [150, 150, 146], legs: [110, 110, 108] }, meat: 0, voice: 0.45 },
  { ...BASE, key: 'bear', name: 'Bear', halfWidthM: 0.6, heightM: 1.4, speedM_S: 1.8, health: 24, prey: ['deer', 'boar'], attack: 5,
    biomes: ['taiga', 'old_growth_dark_forest', 'snowy_taiga'], group: [1, 1], colours: { body: [84, 58, 40], head: [96, 66, 46], legs: [70, 48, 34] }, meat: 4, voice: 0.15 },
  { ...BASE, key: 'fox', name: 'Fox', halfWidthM: 0.2, heightM: 0.5, speedM_S: 3, health: 6, prey: ['rabbit'], nocturnal: true,
    biomes: ['taiga', 'birch', 'meadow', 'tundra'], group: [1, 2], colours: { body: [206, 110, 44], head: [216, 124, 56], legs: [60, 40, 32] }, voice: 0.75 },
  { ...BASE, key: 'sheep', name: 'Sheep', halfWidthM: 0.4, heightM: 1.1, speedM_S: 1.4, health: 8, grazer: true, herds: true,
    biomes: ['plains', 'meadow', 'alpine_meadow', 'steppe'], group: [3, 5], colours: { body: [232, 230, 222], head: [70, 62, 56], legs: [70, 62, 56] }, meat: 2, voice: 0.7 },
  { ...BASE, key: 'cow', leather: 1, name: 'Cow', halfWidthM: 0.45, heightM: 1.4, speedM_S: 1.3, health: 10, grazer: true, herds: true,
    biomes: ['plains', 'meadow', 'savanna'], group: [2, 4], colours: { body: [74, 56, 44], head: [230, 226, 220], legs: [60, 46, 38] }, meat: 3, voice: 0.25 },
  { ...BASE, key: 'goat', name: 'Mountain goat', halfWidthM: 0.3, heightM: 1, speedM_S: 2, health: 8, grazer: true, herds: true,
    biomes: ['alpine_meadow', 'snowcapped_peaks', 'scree'], group: [2, 3], colours: { body: [220, 216, 204], head: [200, 196, 186], legs: [120, 116, 108] }, meat: 2, voice: 0.8 },
  { ...BASE, key: 'camel', name: 'Camel', halfWidthM: 0.45, heightM: 1.9, speedM_S: 1.6, health: 14, grazer: true,
    biomes: ['desert', 'badlands', 'savanna'], group: [1, 2], colours: { body: [196, 160, 104], head: [186, 150, 96], legs: [170, 136, 88] }, meat: 3, voice: 0.2 },
  { ...BASE, key: 'fish', name: 'Fish', halfWidthM: 0.12, heightM: 0.2, speedM_S: 1.5, health: 2, medium: 'water',
    biomes: ['water'], group: [2, 5], colours: { body: [96, 140, 170], head: [110, 156, 186], legs: [80, 120, 150] }, voice: 1 },
  { ...BASE, key: 'zombie', name: 'Zombie', halfWidthM: 0.28, heightM: 1.8, speedM_S: 1.4, health: 20, hostile: true, nocturnal: true,
    attack: 3, biomes: ['dark'], group: [1, 2], colours: { body: [60, 110, 140], head: [96, 150, 90], legs: [70, 60, 120] }, meat: 0, voice: 0.35 },
];

export const SPECIES_BY_KEY = new Map(SPECIES.map((s) => [s.key, s]));
