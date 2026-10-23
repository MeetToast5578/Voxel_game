import { CROP_HARVEST_YIELD, FOOD_HUNGER, TOOL_KINDS, TOOL_TIERS, LAVA_DENSITY, SURFACE_LAYER_HEIGHT, SLAB_HEIGHT, type TreeSpecies } from '../config';
export const BlockId = {
  AIR: 0,
  STONE: 1,
  DIRT: 2,
  GRASS: 3,
  SAND: 4,
  WATER: 5,
  LOG: 6,
  LEAVES: 7,
  PLANKS: 8,
  GLASS: 9,
  BEDROCK: 10,
  COBBLESTONE: 11,
  BRICK: 12,
  GLOWSTONE: 13,
  GRANITE: 14,
  DIORITE: 15,
  ANDESITE: 16,
  SANDSTONE: 17,
  TALL_GRASS: 18,
  POPPY: 19,
  FERN: 20,
  DANDELION: 21,
  LIMESTONE: 22,
  SLATE: 23,
  BASALT: 24,
  DEEPSLATE: 25,
  BROWN_MUSHROOM: 26,
  RED_MUSHROOM: 27,
  COAL_ORE: 28,
  IRON_ORE: 29,
  GOLD_ORE: 30,
  REDSTONE_ORE: 31,
  DIAMOND_ORE: 32,
  EMERALD_ORE: 33,
  LAPIS_ORE: 34,
  GRAVEL: 35,
  FLOWING_WATER: 36,
  CACTUS: 52,
  CLAY: 53,
  LAVA: 54,
  FLOWING_LAVA: 55,
  OBSIDIAN: 71,
  REED: 72,
  FALLEN_LOG_X: 73,
  FALLEN_LOG_Z: 74,
  LILY_PAD: 75,
  MOSS: 76,
  // Appended after the slab types (states 77..142), so saved worlds keep their states.
  SNOW: 143,
  ICE: 151,
  SAPLING: 152,
  // Crops (T-G4), CROP_STAGES states each; variant 0 is what you plant.
  WHEAT: 166,
  CARROTS: 170,
  POTATOES: 174,
  LEAF_LITTER: 178,
  BED: 179,
  CRAFTING_TABLE: 180,
  STICK: 181,
} as const;

export const Tile = {
  STONE: 0,
  DIRT: 1,
  GRASS_TOP: 2,
  GRASS_SIDE: 3,
  SAND: 4,
  WATER: 5,
  LOG_SIDE: 6,
  LOG_TOP: 7,
  LEAVES: 8,
  PLANKS: 9,
  GLASS: 10,
  BEDROCK: 11,
  COBBLESTONE: 12,
  BRICK: 13,
  GLOWSTONE: 14,
  GRANITE: 15,
  DIORITE: 16,
  ANDESITE: 17,
  SANDSTONE: 18,
  TALL_GRASS: 19,
  POPPY: 20,
  FERN: 21,
  DANDELION: 22,
  LIMESTONE: 23,
  SLATE: 24,
  BASALT: 25,
  DEEPSLATE: 26,
  BROWN_MUSHROOM: 27,
  RED_MUSHROOM: 28,
  CRACK_0: 29,
  CRACK_1: 30,
  CRACK_2: 31,
  CRACK_3: 32,
  CRACK_4: 33,
  CRACK_5: 34,
  CRACK_6: 35,
  CRACK_7: 36,
  CRACK_8: 37,
  CRACK_9: 38,
  COAL_ORE: 39,
  IRON_ORE: 40,
  GOLD_ORE: 41,
  REDSTONE_ORE: 42,
  DIAMOND_ORE: 43,
  EMERALD_ORE: 44,
  LAPIS_ORE: 45,
  GRAVEL: 46,
  CACTUS_SIDE: 47,
  CACTUS_TOP: 48,
  CLAY: 49,
  LAVA: 50,
  OBSIDIAN: 51,
  REED: 52,
  LILY_PAD: 53,
  MOSS: 54,
  SNOW: 55,
  ICE: 56,
  SAPLING: 57,
  // CROP_STAGES tiles each, one per growth stage.
  WHEAT: 58,
  CARROTS: 62,
  POTATOES: 66,
  LEAF_LITTER: 70,
  BED_TOP: 71,
  BED_SIDE: 72,
  CRAFTING_TOP: 73,
  CRAFTING_SIDE: 74,
  STICK: 75,
  // One tile per tool: TOOL_KINDS within TOOL_TIERS order (pickaxe, axe, shovel; wooden then stone).
  TOOLS: 76,
} as const;

export type RenderLayer = 'none' | 'opaque' | 'cutout' | 'translucent';
export type BlockShape = 'cube' | 'cross' | 'layer' | 'slab';

/**
 * A block type. Each type owns `variants` consecutive block states, starting at `id`.
 * Block data (chunks, edits, the hotbar) stores states; a state's variant is `state - id`.
 */
export interface BlockDef {
  /** The type's first block state (its variant 0). */
  id: number;
  /** Stable lowercase name used in saves, e.g. 'stone'. */
  key: string;
  /** Number of block states this type owns (at least 1). */
  variants: number;
  name: string;
  solid: boolean;
  opaque: boolean;
  targetable: boolean;
  breakable: boolean;
  cullSame: boolean;
  /** Block light this block emits, 0..15. */
  lightEmission: number;
  /** Seconds to break the block by hand, held down (0 breaks at once). Spec 24. */
  hardness: number;
  layer: RenderLayer;
  /** Plants use crossed quads or a thin horizontal layer. */
  shape: BlockShape;
  /** Base cube state for a slab; variants 0/1 are bottom/top. */
  slabMaterial?: number;
  tiles: { top: number; side: number; bottom: number };
  /**
   * Derived: true if direct sunlight stops at this block. Everything except air and glass blocks the sky
   * (water and leaves included); column tops are the highest such block.
   */
  blocksSky: boolean;
  /** Physics rule (spec 25): the block drops one cell per tick while the cell below is air, water or a plant. */
  falls: boolean;
  /** Physics rule (spec 25): the block is a fluid that spreads to lower neighbours. */
  flows: boolean;
  /** Physics rule (spec 25): the block holds up the block above it. Defaults to solid. */
  supports: boolean;
  /** Mass per cubic metre, in kg, for a loose body of this block (spec 25, slice 6). */
  density: number;
  /** An item, not a block: it is never placed in the world (sticks and tools, T-I5). */
  item?: boolean;
  /** Most of one state in a slot; MAX_STACK when unset. Tools stack to 1. */
  maxStack?: number;
}

/** What a registry is built from: a type without its assigned first state or derived flags. */
export type BlockTypeDef = Omit<BlockDef, 'id' | 'blocksSky' | 'shape' | 'hardness' | 'falls' | 'flows' | 'supports' | 'density'> & {
  shape?: BlockShape;
  hardness?: number;
  falls?: boolean;
  flows?: boolean;
  supports?: boolean;
  density?: number;
};

/** Seconds to break a block by hand when its type does not say otherwise: stone-like. */
export const DEFAULT_HARDNESS = 1.5;
/** Mass per cubic metre, in kg, when a block type does not say otherwise. */
export const DEFAULT_DENSITY = 2000;

/** Block states are stored in 16-bit arrays. */
export const MAX_BLOCK_STATES = 0xffff;
const STATE_SPACE = 0x10000;
const NO_TYPE = 0xffff;
const NAME_PATTERN = /^([a-z0-9_]+)(?:#([1-9][0-9]*))?$/;

export interface BlockRegistry {
  /** Types in registration order. */
  readonly types: readonly BlockDef[];
  /** Number of registered states; states 0..stateCount-1 are valid. */
  readonly stateCount: number;
  /** The type of a state. Throws on an unregistered state. */
  getBlockDef(state: number): BlockDef;
  /** The variant index of a state within its type. Throws on an unregistered state. */
  variantOf(state: number): number;
  /** The state for a variant of a type. Throws if the variant is out of range. */
  makeState(type: BlockDef, variant: number): number;
  /** 'key' for variant 0, 'key#n' otherwise. Throws on an unregistered state. */
  stateName(state: number): string;
  /** The inverse of stateName; null for anything it would not produce. */
  parseStateName(name: string): number | null;
  /** Lookups cover all 65,536 states; unregistered states behave like air. */
  isOpaque(state: number): boolean;
  isSolid(state: number): boolean;
  lightEmission(state: number): number;
  blocksSky(state: number): boolean;
  /** The lookup tables behind isOpaque and lightEmission, indexed by state, for hot loops. Do not modify. */
  readonly opaqueTable: Uint8Array;
  readonly emissionTable: Uint8Array;
}

/** Air lets sunlight through because it is empty; glass because it is clear and not culled against itself; plants because they are thin. */
function derivedBlocksSky(d: BlockTypeDef): boolean {
  const clear = d.layer === 'none' || d.shape === 'cross' || d.shape === 'layer' || d.shape === 'slab' || (d.layer === 'cutout' && d.cullSame);
  return !clear;
}

/** Builds a registry, assigning each type a run of consecutive states in the given order. Pure. */
export function buildBlockRegistry(defs: readonly BlockTypeDef[]): BlockRegistry {
  const types: BlockDef[] = [];
  const byKey = new Map<string, BlockDef>();
  const typeOf = new Uint16Array(STATE_SPACE).fill(NO_TYPE);
  const opaque = new Uint8Array(STATE_SPACE);
  const solid = new Uint8Array(STATE_SPACE);
  const emission = new Uint8Array(STATE_SPACE);
  const sky = new Uint8Array(STATE_SPACE);
  let next = 0;
  for (const d of defs) {
    if (!NAME_PATTERN.test(d.key) || d.key.includes('#')) throw new Error(`Invalid block key '${d.key}'`);
    if (byKey.has(d.key)) throw new Error(`Duplicate block key '${d.key}'`);
    if (!Number.isInteger(d.variants) || d.variants < 1) throw new Error(`Block '${d.key}' needs at least 1 variant`);
    if (next + d.variants > MAX_BLOCK_STATES) throw new Error(`Too many block states (more than ${MAX_BLOCK_STATES})`);
    const type: BlockDef = {
      ...d,
      id: next,
      shape: d.shape ?? 'cube',
      hardness: d.hardness ?? DEFAULT_HARDNESS,
      blocksSky: derivedBlocksSky(d),
      falls: d.falls ?? false,
      flows: d.flows ?? false,
      supports: d.supports ?? d.solid,
      density: d.density ?? DEFAULT_DENSITY,
    };
    const index = types.length;
    types.push(type);
    byKey.set(type.key, type);
    for (let s = next; s < next + d.variants; s++) {
      typeOf[s] = index;
      opaque[s] = type.opaque ? 1 : 0;
      solid[s] = type.solid ? 1 : 0;
      emission[s] = type.lightEmission;
      sky[s] = type.blocksSky ? 1 : 0;
    }
    next += d.variants;
  }

  const getBlockDef = (state: number): BlockDef => {
    const index = Number.isInteger(state) && state >= 0 && state < next ? typeOf[state]! : NO_TYPE;
    if (index === NO_TYPE) throw new Error(`Unknown block state ${state}`);
    return types[index]!;
  };

  return {
    types,
    stateCount: next,
    getBlockDef,
    variantOf: (state) => state - getBlockDef(state).id,
    makeState(type, variant) {
      if (!Number.isInteger(variant) || variant < 0 || variant >= type.variants)
        throw new Error(`Block '${type.key}' has no variant ${variant}`);
      return type.id + variant;
    },
    stateName(state) {
      const type = getBlockDef(state);
      const variant = state - type.id;
      return variant === 0 ? type.key : `${type.key}#${variant}`;
    },
    parseStateName(name) {
      const m = NAME_PATTERN.exec(name);
      if (!m) return null;
      const type = byKey.get(m[1]!);
      if (!type) return null;
      const variant = m[2] === undefined ? 0 : Number(m[2]);
      return variant < type.variants ? type.id + variant : null;
    },
    isOpaque: (state) => opaque[state] === 1,
    isSolid: (state) => solid[state] === 1,
    lightEmission: (state) => emission[state] ?? 0,
    blocksSky: (state) => sky[state] === 1,
    opaqueTable: opaque,
    emissionTable: emission,
  };
}

function def(
  key: string,
  name: string,
  tiles: { top: number; side: number; bottom: number },
  opts: Partial<Omit<BlockTypeDef, 'key' | 'name' | 'tiles'>> = {},
): BlockTypeDef {
  return {
    key,
    name,
    tiles,
    variants: 1,
    solid: true,
    opaque: true,
    targetable: true,
    breakable: true,
    cullSame: false,
    lightEmission: 0,
    layer: 'opaque',
    ...opts,
  };
}

const all = (t: number) => ({ top: t, side: t, bottom: t });
/** Items are drawn flat like plants, and can be neither placed nor hit in the world. */
const ITEM = { item: true, solid: false, opaque: false, layer: 'cutout', shape: 'cross', hardness: 0, density: 600 } as const;

/**
 * The species a sapling can be, by variant. Every tree species with leaves; cacti and dead snags have none to drop one.
 * Append-only: other block types follow the sapling's states, so a new species needs a new block type.
 */
export const SAPLING_SPECIES: readonly TreeSpecies[] = [
  'oak', 'maple', 'spruce', 'fir', 'larch', 'pine', 'birch', 'jungle_giant', 'palm', 'acacia', 'baobab', 'willow', 'mangrove', 'bush',
];

/** Growth stages of every crop; the last one is ripe. */
export const CROP_STAGES = 4;

/** Snow builds up in this many layers; a full stack is one block deep. */
export const SNOW_LAYERS = 8;

/** Flowing water has 8 levels, and each level comes in a falling and a non-falling variant. Variant v: level v % 8 + 1. */
export const WATER_LEVELS = 8;
export const FLOWING_WATER_VARIANTS = 2 * WATER_LEVELS;

/** The game's block registry. Registration order fixes the state numbers: append new types at the end. */
const BASE_REGISTRY = buildBlockRegistry([
  def('air', 'Air', all(0), { solid: false, opaque: false, targetable: false, breakable: false, layer: 'none' }),
  def('stone', 'Stone', all(Tile.STONE), { density: 2600 }),
  def('dirt', 'Dirt', all(Tile.DIRT), { hardness: 0.5, density: 1300 }),
  def('grass', 'Grass', { top: Tile.GRASS_TOP, side: Tile.GRASS_SIDE, bottom: Tile.DIRT }, { hardness: 0.5, density: 1300 }),
  def('sand', 'Sand', all(Tile.SAND), { hardness: 0.5, falls: true, density: 1600 }),
  def('water', 'Water', all(Tile.WATER), {
    solid: false, opaque: false, targetable: false, breakable: false, cullSame: true, layer: 'translucent',
  }),
  def('log', 'Log', { top: Tile.LOG_TOP, side: Tile.LOG_SIDE, bottom: Tile.LOG_TOP }, { hardness: 2, density: 600 }),
  def('leaves', 'Leaves', all(Tile.LEAVES), { opaque: false, layer: 'cutout', hardness: 0.3, supports: false, density: 300 }),
  def('planks', 'Planks', all(Tile.PLANKS), { hardness: 2, density: 600 }),
  def('glass', 'Glass', all(Tile.GLASS), { opaque: false, cullSame: true, layer: 'cutout', hardness: 0.3 }),
  def('bedrock', 'Bedrock', all(Tile.BEDROCK), { breakable: false }),
  def('cobblestone', 'Cobblestone', all(Tile.COBBLESTONE)),
  def('brick', 'Brick', all(Tile.BRICK)),
  def('glowstone', 'Glowstone', all(Tile.GLOWSTONE), { lightEmission: 15, hardness: 0.3 }),
  def('granite', 'Granite', all(Tile.GRANITE)),
  def('diorite', 'Diorite', all(Tile.DIORITE)),
  def('andesite', 'Andesite', all(Tile.ANDESITE)),
  def('sandstone', 'Sandstone', all(Tile.SANDSTONE)),
  def('tall_grass', 'Tall grass', all(Tile.TALL_GRASS), { solid: false, opaque: false, layer: 'cutout', shape: 'cross', hardness: 0 }),
  def('poppy', 'Poppy', all(Tile.POPPY), { solid: false, opaque: false, layer: 'cutout', shape: 'cross', hardness: 0 }),
  def('fern', 'Fern', all(Tile.FERN), { solid: false, opaque: false, layer: 'cutout', shape: 'cross', hardness: 0 }),
  def('dandelion', 'Dandelion', all(Tile.DANDELION), { solid: false, opaque: false, layer: 'cutout', shape: 'cross', hardness: 0 }),
  def('limestone', 'Limestone', all(Tile.LIMESTONE)),
  def('slate', 'Slate', all(Tile.SLATE)),
  def('basalt', 'Basalt', all(Tile.BASALT)),
  def('deepslate', 'Deepslate', all(Tile.DEEPSLATE)),
  def('brown_mushroom', 'Brown mushroom', all(Tile.BROWN_MUSHROOM), { solid: false, opaque: false, layer: 'cutout', shape: 'cross', hardness: 0 }),
  def('red_mushroom', 'Red mushroom', all(Tile.RED_MUSHROOM), { solid: false, opaque: false, layer: 'cutout', shape: 'cross', hardness: 0 }),
  def('coal_ore', 'Coal ore', all(Tile.COAL_ORE), { hardness: 2 }),
  def('iron_ore', 'Iron ore', all(Tile.IRON_ORE), { hardness: 3 }),
  def('gold_ore', 'Gold ore', all(Tile.GOLD_ORE), { hardness: 3 }),
  def('redstone_ore', 'Redstone ore', all(Tile.REDSTONE_ORE), { hardness: 3 }),
  def('diamond_ore', 'Diamond ore', all(Tile.DIAMOND_ORE), { hardness: 4 }),
  def('emerald_ore', 'Emerald ore', all(Tile.EMERALD_ORE), { hardness: 4 }),
  def('lapis_ore', 'Lapis ore', all(Tile.LAPIS_ORE), { hardness: 3 }),
  def('gravel', 'Gravel', all(Tile.GRAVEL), { hardness: 0.6, falls: true, density: 1900 }),
  // Water that flows (spec 25, slice 4): 8 levels, each with a falling flag. The source block is 'water'.
  def('flowing_water', 'Flowing water', all(Tile.WATER), {
    variants: FLOWING_WATER_VARIANTS, solid: false, opaque: false, targetable: false, breakable: false, cullSame: true,
    layer: 'translucent', flows: true,
  }),
  def('cactus', 'Cactus', { top: Tile.CACTUS_TOP, side: Tile.CACTUS_SIDE, bottom: Tile.CACTUS_TOP }, { hardness: 0.5, density: 700 }),
  def('clay', 'Clay', all(Tile.CLAY), { hardness: 0.6, density: 1700 }),
  def('lava', 'Lava', all(Tile.LAVA), {
    solid: false, opaque: false, targetable: false, breakable: false, cullSame: true, lightEmission: 15, density: LAVA_DENSITY,
  }),
  def('flowing_lava', 'Flowing lava', all(Tile.LAVA), {
    variants: FLOWING_WATER_VARIANTS, solid: false, opaque: false, targetable: false, breakable: false,
    cullSame: true, lightEmission: 15, flows: true, density: LAVA_DENSITY,
  }),
  def('obsidian', 'Obsidian', all(Tile.OBSIDIAN), { hardness: 8, density: 2600 }),
  def('reed', 'Reed', all(Tile.REED), { solid: false, opaque: false, layer: 'cutout', shape: 'cross', hardness: 0 }),
  def('fallen_log_x', 'Fallen log (X)', all(Tile.LOG_SIDE), { hardness: 1, density: 600 }),
  def('fallen_log_z', 'Fallen log (Z)', all(Tile.LOG_SIDE), { hardness: 1, density: 600 }),
  def('lily_pad', 'Lily pad', all(Tile.LILY_PAD), { solid: false, opaque: false, layer: 'cutout', shape: 'layer', hardness: 0 }),
  def('moss', 'Moss', all(Tile.MOSS), { solid: false, opaque: false, layer: 'cutout', shape: 'layer', hardness: 0 }),
]);

/** Append slab types after every existing ID, preserving old worlds and inventory states. */
export const BLOCK_REGISTRY = buildBlockRegistry([
  ...BASE_REGISTRY.types,
  ...BASE_REGISTRY.types.filter(d => d.solid && d.shape === 'cube').map(d => ({
    ...d, key: `${d.key}_slab`, name: `${d.name} slab`, variants: 2,
    shape: 'slab' as const, slabMaterial: d.id, opaque: false, cullSame: false, falls: false, flows: false,
  })),
  // Snow layers (T-G2): variant v is v + 1 eighths of a block deep. A layer: thin, sunlight passes, water washes it away.
  def('snow', 'Snow', all(Tile.SNOW), {
    variants: SNOW_LAYERS, solid: false, opaque: false, shape: 'layer', hardness: 0.1, supports: false, density: 300,
  }),
  // Translucent like water, so it still counts as the column top; walkable.
  def('ice', 'Ice', all(Tile.ICE), { opaque: false, cullSame: true, layer: 'translucent', hardness: 0.5, density: 917 }),
  // Saplings (T-G3): one variant per species in SAPLING_SPECIES. They grow into that species' tree.
  def('sapling', 'Sapling', all(Tile.SAPLING), {
    variants: SAPLING_SPECIES.length, solid: false, opaque: false, layer: 'cutout', shape: 'cross', hardness: 0, density: 300,
  }),
  // Crops (T-G4): variant = growth stage, and each stage has its own tile (see blockFaceTile).
  ...(['wheat', 'carrots', 'potatoes'] as const).map((key) => def(key, key[0]!.toUpperCase() + key.slice(1),
    all(key === 'wheat' ? Tile.WHEAT : key === 'carrots' ? Tile.CARROTS : Tile.POTATOES),
    { variants: CROP_STAGES, solid: false, opaque: false, layer: 'cutout', shape: 'cross', hardness: 0, density: 300 })),
  // Fallen autumn leaves (T-G6): a thin layer like moss, which rots away once autumn is over.
  def('leaf_litter', 'Leaf litter', all(Tile.LEAF_LITTER), { solid: false, opaque: false, layer: 'cutout', shape: 'layer', hardness: 0 }),
  // A bed (T-I9): half a block high, like a bottom slab of its own. Right click sets the respawn point and sleeps at night.
  def('bed', 'Bed', { top: Tile.BED_TOP, side: Tile.BED_SIDE, bottom: Tile.PLANKS },
    { shape: 'slab', opaque: false, cullSame: false, hardness: 0.2, density: 600 }),
  // Crafting (T-I6): right click opens the 3×3 grid.
  def('crafting_table', 'Crafting table', { top: Tile.CRAFTING_TOP, side: Tile.CRAFTING_SIDE, bottom: Tile.PLANKS },
    { hardness: 1.5, density: 600 }),
  def('stick', 'Stick', all(Tile.STICK), ITEM),
  // Tools (T-I5): the variant counts uses, so a worn tool needs no extra save data; the last use breaks it.
  ...Object.entries(TOOL_TIERS).flatMap(([tier, { uses }], t) => TOOL_KINDS.map((kind, k) =>
    def(`${tier}_${kind}`, `${tier[0]!.toUpperCase()}${tier.slice(1)} ${kind}`, all(Tile.TOOLS + t * TOOL_KINDS.length + k),
      { ...ITEM, variants: uses, maxStack: 1 }))),
]);

// BlockId.X is variant 0 of the type whose key is x; keep the two lists in step.
for (const [name, state] of Object.entries(BlockId)) {
  if (BLOCK_REGISTRY.stateName(state) !== name.toLowerCase())
    throw new Error(`BlockId.${name} (${state}) does not match the registry`);
}

/** Block types, indexed in registration order. */
export const BLOCKS: readonly BlockDef[] = BLOCK_REGISTRY.types;
/** Total number of registered block states. */
export const BLOCK_STATE_COUNT = BLOCK_REGISTRY.stateCount;

export const getBlockDef = BLOCK_REGISTRY.getBlockDef;
export const blockVariant = BLOCK_REGISTRY.variantOf;
export const makeBlockState = BLOCK_REGISTRY.makeState;
export const blockStateName = BLOCK_REGISTRY.stateName;
export const parseBlockStateName = BLOCK_REGISTRY.parseStateName;
export const isOpaque = BLOCK_REGISTRY.isOpaque;
export const isSolid = BLOCK_REGISTRY.isSolid;
export const lightEmission = BLOCK_REGISTRY.lightEmission;
export const blocksSky = BLOCK_REGISTRY.blocksSky;
/** 1 where a state is opaque (all 65,536 states). For hot loops; do not modify. */
export const OPAQUE_TABLE = BLOCK_REGISTRY.opaqueTable;
/** Light emitted by each state (all 65,536 states). For hot loops; do not modify. */
export const EMISSION_TABLE = BLOCK_REGISTRY.emissionTable;

/** The source block: full, never thins, and never falls. */
export const SOURCE_WATER_LEVEL = WATER_LEVELS;

/** True for the source block and for every flowing water state. */
export function isWaterState(state: number): boolean {
  return state === BlockId.WATER || isFlowingWaterState(state);
}

/** True for each flowing water state (not the source block). */
export function isFlowingWaterState(state: number): boolean {
  return state >= BlockId.FLOWING_WATER && state < BlockId.FLOWING_WATER + FLOWING_WATER_VARIANTS;
}

/** The level of a water state, 1 (thinnest) to 8 (full). The source block is level 8. */
export function waterLevel(state: number): number {
  return isFlowingWaterState(state) ? ((state - BlockId.FLOWING_WATER) % WATER_LEVELS) + 1 : SOURCE_WATER_LEVEL;
}

/** True for a flowing water state that falls (it came down from above, and is not spreading sideways). */
export function isFallingWater(state: number): boolean {
  return isFlowingWaterState(state) && state - BlockId.FLOWING_WATER >= WATER_LEVELS;
}

/** Top face height: fluid level, thin plant layer, or a full cube. */
export function blockTopHeight(state: number): number {
  if (getBlockDef(state).shape === 'slab') return blockVariant(state) === 0 ? SLAB_HEIGHT : 1;
  if (state === BlockId.LILY_PAD || state === BlockId.MOSS || state === BlockId.LEAF_LITTER) return SURFACE_LAYER_HEIGHT;
  if (isSnowState(state)) return snowLayers(state) / SNOW_LAYERS;
  return isFlowingWaterState(state) ? waterLevel(state) / WATER_LEVELS : isFlowingLavaState(state) ? lavaLevel(state) / WATER_LEVELS : 1;
}

/** The flowing water state for a level (1..8), falling or not. */
export function flowingWaterState(level: number, falling: boolean): number {
  return BlockId.FLOWING_WATER + (level - 1) + (falling ? WATER_LEVELS : 0);
}

/** Lava uses the same level/falling encoding as water, in its own stable state range. */
export function isFlowingLavaState(state: number): boolean {
  return state >= BlockId.FLOWING_LAVA && state < BlockId.FLOWING_LAVA + FLOWING_WATER_VARIANTS;
}
export function isLavaState(state: number): boolean { return state === BlockId.LAVA || isFlowingLavaState(state); }
export function isFluidState(state: number): boolean { return isWaterState(state) || isLavaState(state); }
export function lavaLevel(state: number): number {
  return isFlowingLavaState(state) ? ((state - BlockId.FLOWING_LAVA) % WATER_LEVELS) + 1 : WATER_LEVELS;
}
export function isFallingLava(state: number): boolean {
  return isFlowingLavaState(state) && state - BlockId.FLOWING_LAVA >= WATER_LEVELS;
}
export function flowingLavaState(level: number, falling: boolean): number {
  return BlockId.FLOWING_LAVA + (level - 1) + (falling ? WATER_LEVELS : 0);
}

/** Tile for a cube face normal; horizontal logs keep end grain perpendicular to their axis. */
export function blockFaceTile(state: number, dx: number, dy: number, dz: number): number {
  state = getBlockDef(state).slabMaterial ?? state;
  if ((state === BlockId.FALLEN_LOG_X && dx !== 0) || (state === BlockId.FALLEN_LOG_Z && dz !== 0)) return Tile.LOG_TOP;
  const tiles = getBlockDef(state).tiles;
  if (isCropState(state)) return tiles.side + blockVariant(state); // one tile per growth stage
  return dy > 0 ? tiles.top : dy < 0 ? tiles.bottom : tiles.side;
}

const BOTTOM_SLAB_BOUNDS = [0, SLAB_HEIGHT] as const;
const TOP_SLAB_BOUNDS = [SLAB_HEIGHT, 1] as const;
/** Local vertical bounds; reused arrays avoid allocations in collision loops. */
export function slabBounds(state: number): readonly [number, number] | null {
  if (state < BASE_REGISTRY.stateCount) return null;
  return getBlockDef(state).shape === 'slab' ? (blockVariant(state) === 0 ? BOTTOM_SLAB_BOUNDS : TOP_SLAB_BOUNDS) : null;
}
export function blockBottomHeight(state: number): number { return slabBounds(state)?.[0] ?? 0; }
export function blockCollision(state: number): boolean | readonly [number, number] {
  if (isSnowState(state)) return [0, snowLayers(state) / SNOW_LAYERS];
  return slabBounds(state) ?? isSolid(state);
}

/** True for every stage of every crop. */
export function isCropState(state: number): boolean {
  return state >= BlockId.WHEAT && state < BlockId.POTATOES + CROP_STAGES;
}

/** Hunger a block state restores when eaten (T-I8): the planted stage of a crop is food; anything else is 0. */
export function foodValue(state: number): number {
  return isCropState(state) && blockVariant(state) === 0 ? FOOD_HUNGER[getBlockDef(state).key as keyof typeof FOOD_HUNGER] : 0;
}

export function isSnowState(state: number): boolean {
  return state >= BlockId.SNOW && state < BlockId.SNOW + SNOW_LAYERS;
}

/** How many layers (1..SNOW_LAYERS) a snow state has. */
export function snowLayers(state: number): number {
  return state - BlockId.SNOW + 1;
}

/** The snow state with `layers` layers (1..SNOW_LAYERS). */
export function snowState(layers: number): number {
  return BlockId.SNOW + layers - 1;
}
export function slabItemState(state: number): number { const d = getBlockDef(state); return d.shape === 'slab' ? d.id : state; }

/** What a broken block drops. A crop drops what you plant (its first stage): CROP_HARVEST_YIELD of it when ripe. */
export function blockDrop(state: number): { state: number; count: number } {
  if (isCropState(state)) {
    const ripe = blockVariant(state) === CROP_STAGES - 1;
    return { state: getBlockDef(state).id, count: ripe ? CROP_HARVEST_YIELD : 1 };
  }
  return { state: slabItemState(state), count: 1 };
}
export function slabState(material: number, top = false): number {
  const d = BLOCKS.find(d => d.slabMaterial === material);
  if (!d) throw new Error(`No slab for material ${material}`);
  return d.id + (top ? 1 : 0);
}

export function isPlantState(state: number): boolean {
  const shape = getBlockDef(state).shape;
  return shape === 'cross' || shape === 'layer';
}
