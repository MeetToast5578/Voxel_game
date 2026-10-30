/**
 * Block types and states. A type owns `variants` consecutive states. States are numbered at startup in table order;
 * saves store state names ('key' or 'key#variant'), never numbers, so the table can be reordered freely.
 */

export type RenderLayer = 'none' | 'opaque' | 'cutout' | 'water' | 'ice';
export type BlockShape = 'cube' | 'cross' | 'layer' | 'slab';

export interface BlockTiles {
  top: string;
  side: string;
  bottom: string;
}

export interface BlockType {
  /** First state of the type (its variant 0). */
  readonly id: number;
  /** Stable lowercase name used in saves. */
  readonly key: string;
  readonly name: string;
  readonly variants: number;
  readonly solid: boolean;
  /** Fills its cell and hides neighbour faces. */
  readonly opaque: boolean;
  /** Faces between two cells of this type are not drawn (water, glass). */
  readonly cullSame: boolean;
  readonly lightEmission: number;
  /** Seconds to break by hand. */
  readonly hardness: number;
  readonly layer: RenderLayer;
  readonly shape: BlockShape;
  readonly tiles: BlockTiles;
  /** Direct sunlight stops here (everything except air, clear glass and thin shapes). */
  readonly blocksSky: boolean;
  readonly falls: boolean;
  readonly flows: boolean;
  /** Holds up the block above it. */
  readonly supports: boolean;
  /** kg per cubic metre, for loose bodies. */
  readonly density: number;
  /** For a slab: the key of its full block. */
  readonly slabOf?: string;
}

export type BlockSpec = Pick<BlockType, 'key' | 'name' | 'tiles'> & Partial<Omit<BlockType, 'id' | 'key' | 'name' | 'tiles'>>;

const NAME_PATTERN = /^([a-z0-9_]+)(?:#([1-9][0-9]*))?$/;

/** Bits of `BlockRegistry.flags`. */
export const OPAQUE = 1, SOLID = 2, BLOCKS_SKY = 4, CULL_SAME = 8, FLUID = 16, PLANT = 32;

export class BlockRegistry {
  readonly types: readonly BlockType[];
  readonly stateCount: number;
  /** Per state: OPAQUE | SOLID | ... bits. Read directly in hot loops. */
  readonly flags: Uint8Array;
  /** Per state: block light emitted, 0..15. */
  readonly emission: Uint8Array;
  /** Per state: index of its type in `types`. */
  readonly typeIndex: Uint16Array;
  private readonly byKey = new Map<string, BlockType>();

  constructor(specs: readonly BlockSpec[]) {
    const types: BlockType[] = [];
    let next = 0;
    for (const s of specs) {
      if (!NAME_PATTERN.test(s.key) || s.key.includes('#')) throw new Error(`Invalid block key '${s.key}'`);
      if (this.byKey.has(s.key)) throw new Error(`Duplicate block key '${s.key}'`);
      const variants = s.variants ?? 1;
      if (!Number.isInteger(variants) || variants < 1) throw new Error(`Block '${s.key}' needs at least 1 variant`);
      const layer = s.layer ?? 'opaque';
      const shape = s.shape ?? 'cube';
      const solid = s.solid ?? true;
      const type: BlockType = {
        variants, solid, layer, shape,
        opaque: s.opaque ?? (layer === 'opaque' && shape === 'cube'),
        cullSame: s.cullSame ?? false,
        lightEmission: s.lightEmission ?? 0,
        hardness: s.hardness ?? 1.5,
        blocksSky: s.blocksSky ?? !(layer === 'none' || shape !== 'cube' || (layer === 'cutout' && (s.cullSame ?? false))),
        falls: s.falls ?? false,
        flows: s.flows ?? false,
        supports: s.supports ?? solid,
        density: s.density ?? 2000,
        ...s,
        id: next,
      };
      types.push(type);
      this.byKey.set(type.key, type);
      next += variants;
    }
    if (next > 0xffff) throw new Error('Too many block states');
    this.types = types;
    this.stateCount = next;
    this.flags = new Uint8Array(next);
    this.emission = new Uint8Array(next);
    this.typeIndex = new Uint16Array(next);
    types.forEach((t, index) => {
      const bits = (t.opaque ? OPAQUE : 0) | (t.solid ? SOLID : 0) | (t.blocksSky ? BLOCKS_SKY : 0) |
        (t.cullSame ? CULL_SAME : 0) | (t.layer === 'water' || t.flows ? FLUID : 0) | (t.shape === 'cross' ? PLANT : 0);
      for (let s = t.id; s < t.id + t.variants; s++) {
        this.flags[s] = bits;
        this.emission[s] = t.lightEmission;
        this.typeIndex[s] = index;
      }
    });
  }

  /** The type of a state. Throws on an unknown state. */
  type(state: number): BlockType {
    if (!Number.isInteger(state) || state < 0 || state >= this.stateCount) throw new Error(`Unknown block state ${state}`);
    return this.types[this.typeIndex[state]!]!;
  }

  byName(key: string): BlockType {
    const t = this.byKey.get(key);
    if (!t) throw new Error(`Unknown block '${key}'`);
    return t;
  }

  /** The state of a type's variant. */
  state(key: string, variant = 0): number {
    const t = this.byName(key);
    if (!Number.isInteger(variant) || variant < 0 || variant >= t.variants) throw new Error(`Block '${key}' has no variant ${variant}`);
    return t.id + variant;
  }

  variant(state: number): number {
    return state - this.type(state).id;
  }

  /** 'key' for variant 0, 'key#n' otherwise. */
  stateName(state: number): string {
    const t = this.type(state);
    return state === t.id ? t.key : `${t.key}#${state - t.id}`;
  }

  /** Inverse of stateName; null for a name it would not produce. */
  parseStateName(name: string): number | null {
    const m = NAME_PATTERN.exec(name);
    const t = m ? this.byKey.get(m[1]!) : undefined;
    if (!t) return null;
    const variant = m![2] === undefined ? 0 : Number(m![2]);
    return variant < t.variants ? t.id + variant : null;
  }

  isOpaque(state: number): boolean {
    return (this.flags[state]! & OPAQUE) !== 0;
  }

  isSolid(state: number): boolean {
    return (this.flags[state]! & SOLID) !== 0;
  }
}

const all = (t: string): BlockTiles => ({ top: t, side: t, bottom: t });
const stone = (key: string, name: string, extra: Partial<BlockSpec> = {}): BlockSpec => ({ key, name, tiles: all(key), density: 2600, ...extra });
const plant = (key: string, name: string): BlockSpec =>
  ({ key, name, tiles: all(key), solid: false, layer: 'cutout', shape: 'cross', hardness: 0, density: 300 });
const thin = (key: string, name: string, extra: Partial<BlockSpec> = {}): BlockSpec =>
  ({ key, name, tiles: all(key), solid: false, layer: 'cutout', shape: 'layer', hardness: 0, supports: false, density: 300, ...extra });
const fluid = { solid: false, cullSame: true, hardness: 0, supports: false } as const;

/** Flowing fluids have 8 levels, each with a falling and a resting variant. */
export const FLUID_LEVELS = 8;
/** Snow builds up in this many layers; a full stack fills its cell. */
export const SNOW_LAYERS = 8;

const BASE: BlockSpec[] = [
  { key: 'air', name: 'Air', tiles: all('air'), solid: false, layer: 'none', hardness: 0, density: 1 },
  stone('stone', 'Stone'),
  { key: 'dirt', name: 'Dirt', tiles: all('dirt'), hardness: 0.5, density: 1300 },
  { key: 'grass', name: 'Grass', tiles: { top: 'grass_top', side: 'grass_side', bottom: 'dirt' }, hardness: 0.5, density: 1300 },
  { key: 'sand', name: 'Sand', tiles: all('sand'), hardness: 0.5, falls: true, density: 1600 },
  { key: 'gravel', name: 'Gravel', tiles: all('gravel'), hardness: 0.6, falls: true, density: 1900 },
  { key: 'clay', name: 'Clay', tiles: all('clay'), hardness: 0.6, density: 1700 },
  { key: 'water', name: 'Water', tiles: all('water'), layer: 'water', ...fluid, density: 1000 },
  { key: 'flowing_water', name: 'Flowing water', tiles: all('water'), layer: 'water', ...fluid, flows: true, variants: 2 * FLUID_LEVELS, density: 1000 },
  { key: 'lava', name: 'Lava', tiles: all('lava'), ...fluid, opaque: false, lightEmission: 15, density: 3100 },
  { key: 'flowing_lava', name: 'Flowing lava', tiles: all('lava'), ...fluid, opaque: false, lightEmission: 15, flows: true, variants: 2 * FLUID_LEVELS, density: 3100 },
  { key: 'ice', name: 'Ice', tiles: all('ice'), layer: 'ice', opaque: false, cullSame: true, hardness: 0.5, density: 917 },
  { key: 'log', name: 'Log', tiles: { top: 'log_top', side: 'log_side', bottom: 'log_top' }, hardness: 2, density: 600 },
  { key: 'leaves', name: 'Leaves', tiles: all('leaves'), layer: 'cutout', hardness: 0.3, supports: false, density: 300 },
  { key: 'planks', name: 'Planks', tiles: all('planks'), hardness: 2, density: 600 },
  { key: 'glass', name: 'Glass', tiles: all('glass'), layer: 'cutout', cullSame: true, hardness: 0.3 },
  stone('bedrock', 'Bedrock', { hardness: Infinity }),
  stone('cobblestone', 'Cobblestone'),
  stone('brick', 'Brick'),
  stone('glowstone', 'Glowstone', { lightEmission: 15, hardness: 0.3 }),
  stone('granite', 'Granite'),
  stone('diorite', 'Diorite'),
  stone('andesite', 'Andesite'),
  stone('sandstone', 'Sandstone'),
  stone('limestone', 'Limestone'),
  stone('slate', 'Slate'),
  stone('basalt', 'Basalt'),
  stone('deepslate', 'Deepslate'),
  stone('obsidian', 'Obsidian', { hardness: 8 }),
  stone('coal_ore', 'Coal ore', { hardness: 2 }),
  stone('iron_ore', 'Iron ore', { hardness: 3 }),
  stone('gold_ore', 'Gold ore', { hardness: 3 }),
  stone('redstone_ore', 'Redstone ore', { hardness: 3 }),
  stone('diamond_ore', 'Diamond ore', { hardness: 4 }),
  stone('emerald_ore', 'Emerald ore', { hardness: 4 }),
  stone('lapis_ore', 'Lapis ore', { hardness: 3 }),
  { key: 'cactus', name: 'Cactus', tiles: { top: 'cactus_top', side: 'cactus_side', bottom: 'cactus_top' }, hardness: 0.5, density: 700 },
  plant('tall_grass', 'Tall grass'),
  plant('fern', 'Fern'),
  plant('poppy', 'Poppy'),
  plant('dandelion', 'Dandelion'),
  plant('brown_mushroom', 'Brown mushroom'),
  plant('red_mushroom', 'Red mushroom'),
  plant('reed', 'Reed'),
  thin('lily_pad', 'Lily pad'),
  thin('moss', 'Moss'),
  thin('leaf_litter', 'Leaf litter'),
  thin('snow', 'Snow', { layer: 'opaque', variants: SNOW_LAYERS, hardness: 0.1 }),
];

/** Slabs of every full solid cube: variant 0 is the bottom half, 1 the top half. */
const SLABS: BlockSpec[] = BASE.filter((s) => (s.solid ?? true) && (s.layer ?? 'opaque') === 'opaque' && !s.falls && s.key !== 'bedrock' && !s.lightEmission)
  .map((s) => ({ ...s, key: `${s.key}_slab`, name: `${s.name} slab`, shape: 'slab', variants: 2, slabOf: s.key, opaque: false, blocksSky: false }));

export const BLOCKS = new BlockRegistry([...BASE, ...SLABS]);
export const AIR = 0;
