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
} as const;

export type RenderLayer = 'none' | 'opaque' | 'cutout' | 'translucent';
export type BlockShape = 'cube' | 'cross';

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
  /** 'cross' blocks are two crossed quads (plants), not cubes. Spec 18. */
  shape: BlockShape;
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
}

/** What a registry is built from: a type without its assigned first state or derived flags. */
export type BlockTypeDef = Omit<BlockDef, 'id' | 'blocksSky' | 'shape' | 'hardness' | 'falls' | 'flows' | 'supports'> & {
  shape?: BlockShape;
  hardness?: number;
  falls?: boolean;
  flows?: boolean;
  supports?: boolean;
};

/** Seconds to break a block by hand when its type does not say otherwise: stone-like. */
export const DEFAULT_HARDNESS = 1.5;

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
  const clear = d.layer === 'none' || d.shape === 'cross' || (d.layer === 'cutout' && d.cullSame);
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

/** The game's block registry. Registration order fixes the state numbers: append new types at the end. */
export const BLOCK_REGISTRY = buildBlockRegistry([
  def('air', 'Air', all(0), { solid: false, opaque: false, targetable: false, breakable: false, layer: 'none' }),
  def('stone', 'Stone', all(Tile.STONE)),
  def('dirt', 'Dirt', all(Tile.DIRT), { hardness: 0.5 }),
  def('grass', 'Grass', { top: Tile.GRASS_TOP, side: Tile.GRASS_SIDE, bottom: Tile.DIRT }, { hardness: 0.5 }),
  def('sand', 'Sand', all(Tile.SAND), { hardness: 0.5, falls: true }),
  def('water', 'Water', all(Tile.WATER), {
    solid: false, opaque: false, targetable: false, breakable: false, cullSame: true, layer: 'translucent',
  }),
  def('log', 'Log', { top: Tile.LOG_TOP, side: Tile.LOG_SIDE, bottom: Tile.LOG_TOP }, { hardness: 2 }),
  def('leaves', 'Leaves', all(Tile.LEAVES), { opaque: false, layer: 'cutout', hardness: 0.3 }),
  def('planks', 'Planks', all(Tile.PLANKS), { hardness: 2 }),
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
  def('gravel', 'Gravel', all(Tile.GRAVEL), { hardness: 0.6, falls: true }),
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
