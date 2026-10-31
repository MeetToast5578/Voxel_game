/**
 * Block types and states. A type owns `variants` consecutive states. States are numbered at startup in table order;
 * saves store state names ('key' or 'key#variant'), never numbers, so the table can be reordered freely.
 */

export type RenderLayer = 'none' | 'opaque' | 'cutout' | 'water' | 'ice';
export type BlockShape = 'cube' | 'cross' | 'layer' | 'slab' | 'boxes';
export type ToolKind = 'pickaxe' | 'axe' | 'shovel' | 'sword';
/** A box inside a cell, in sixteenths: [x0, y0, z0, x1, y1, z1]. */
export type Box = readonly [number, number, number, number, number, number];

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
  /** Not a block at all, only held (sticks, tools, food): it cannot be placed. */
  readonly item?: boolean;
  /** Most of it in one inventory slot (default 64). */
  readonly maxStack?: number;
  /** A tile per variant for every face (crop growth stages). */
  readonly variantTiles?: readonly string[];
  /** Tile of the face the block looks towards: variant % 4 is the facing (+x, -x, +z, -z). */
  readonly front?: string;
  /** The boxes of a 'boxes' shape, by variant. */
  readonly boxes?: (variant: number) => readonly Box[];
  /** Hunger restored by eating it. */
  readonly food?: number;
  /** For a tool: what it is, its tier (0 wood, 1 stone, 2 iron) and how many uses it has. */
  readonly tool?: { readonly kind: ToolKind; readonly tier: number; readonly durability: number };
  /** The tool that breaks this faster, and the tier needed for it to drop anything (unset: drops by hand). */
  readonly mineWith?: ToolKind;
  readonly needsTier?: number;
  /** What breaking it gives: another key, or '' for nothing (default: itself, variant 0). */
  readonly drops?: string;
  /** Armour: the body slot it is worn on (0 head, 1 chest, 2 legs, 3 feet), damage points it stops, °C of cold it
   * keeps off, and how many hits it takes. */
  readonly armour?: { readonly slot: number; readonly protection: number; readonly warmth: number; readonly durability: number };
  /** Seconds it burns in a furnace. */
  readonly fuel?: number;
  /** What is left when it is used up as fuel or emptied (a bucket). */
  readonly emptiesTo?: string;
  /** What a furnace makes of it. */
  readonly smeltsTo?: string;
  /** It falls off without a solid cell below (plants, torches). */
  readonly needsSupport?: boolean;
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
const stone = (key: string, name: string, extra: Partial<BlockSpec> = {}): BlockSpec =>
  ({ key, name, tiles: all(key), density: 2600, mineWith: 'pickaxe', needsTier: 0, ...extra });
const plant = (key: string, name: string, extra: Partial<BlockSpec> = {}): BlockSpec =>
  ({ key, name, tiles: all(key), solid: false, layer: 'cutout', shape: 'cross', hardness: 0, density: 300, needsSupport: true, ...extra });
const item = (key: string, name: string, extra: Partial<BlockSpec> = {}): BlockSpec =>
  ({ key, name, tiles: all(key), item: true, solid: false, layer: 'cutout', shape: 'cross', hardness: 0, ...extra });
const soil = { mineWith: 'shovel' } as const;
const wood = { mineWith: 'axe', fuel: 15 } as const;
const thin = (key: string, name: string, extra: Partial<BlockSpec> = {}): BlockSpec =>
  ({ key, name, tiles: all(key), solid: false, layer: 'cutout', shape: 'layer', hardness: 0, supports: false, density: 300, needsSupport: true, ...extra });
const fluid = { solid: false, cullSame: true, hardness: 0, supports: false } as const;

/** Flowing fluids have 8 levels, each with a falling and a resting variant. */
export const FLUID_LEVELS = 8;
/** Snow builds up in this many layers; a full stack fills its cell. */
export const SNOW_LAYERS = 8;

const BASE: BlockSpec[] = [
  { key: 'air', name: 'Air', tiles: all('air'), solid: false, layer: 'none', hardness: 0, density: 1 },
  stone('stone', 'Stone', { drops: 'cobblestone' }),
  { key: 'dirt', name: 'Dirt', tiles: all('dirt'), hardness: 0.5, density: 1300, ...soil },
  { key: 'grass', name: 'Grass', tiles: { top: 'grass_top', side: 'grass_side', bottom: 'dirt' }, hardness: 0.6, density: 1300, drops: 'dirt', ...soil },
  { key: 'sand', name: 'Sand', tiles: all('sand'), hardness: 0.5, falls: true, density: 1600, smeltsTo: 'glass', ...soil },
  { key: 'gravel', name: 'Gravel', tiles: all('gravel'), hardness: 0.6, falls: true, density: 1900, ...soil },
  { key: 'clay', name: 'Clay', tiles: all('clay'), hardness: 0.6, density: 1700, smeltsTo: 'brick', ...soil },
  { key: 'water', name: 'Water', tiles: all('water'), layer: 'water', ...fluid, density: 1000 },
  { key: 'flowing_water', name: 'Flowing water', tiles: all('water'), layer: 'water', ...fluid, flows: true, variants: 2 * FLUID_LEVELS, density: 1000 },
  { key: 'lava', name: 'Lava', tiles: all('lava'), ...fluid, opaque: false, lightEmission: 15, density: 3100 },
  { key: 'flowing_lava', name: 'Flowing lava', tiles: all('lava'), ...fluid, opaque: false, lightEmission: 15, flows: true, variants: 2 * FLUID_LEVELS, density: 3100 },
  { key: 'ice', name: 'Ice', tiles: all('ice'), layer: 'ice', opaque: false, cullSame: true, hardness: 0.5, density: 917, mineWith: 'pickaxe', drops: '' },
  { key: 'log', name: 'Log', tiles: { top: 'log_top', side: 'log_side', bottom: 'log_top' }, hardness: 2, density: 600, smeltsTo: 'coal', ...wood },
  // Variant 1 is placed by the player and never decays.
  // Faces between leaves are hidden (dense crowns would otherwise be thousands of quads); leaves still shade the ground.
  { key: 'leaves', name: 'Leaves', tiles: all('leaves'), layer: 'cutout', hardness: 0.3, supports: false, density: 300, variants: 2, cullSame: true, blocksSky: true, drops: '' },
  { key: 'planks', name: 'Planks', tiles: all('planks'), hardness: 2, density: 600, ...wood },
  { key: 'glass', name: 'Glass', tiles: all('glass'), layer: 'cutout', cullSame: true, hardness: 0.3, drops: '' },
  stone('bedrock', 'Bedrock', { hardness: Infinity }),
  stone('cobblestone', 'Cobblestone', { smeltsTo: 'stone' }),
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
  stone('obsidian', 'Obsidian', { hardness: 25, needsTier: 2 }),
  stone('coal_ore', 'Coal ore', { hardness: 2, drops: 'coal' }),
  stone('iron_ore', 'Iron ore', { hardness: 3, needsTier: 1, smeltsTo: 'iron_ingot' }),
  stone('gold_ore', 'Gold ore', { hardness: 3, needsTier: 2, smeltsTo: 'gold_ingot' }),
  stone('redstone_ore', 'Redstone ore', { hardness: 3, needsTier: 2 }),
  stone('diamond_ore', 'Diamond ore', { hardness: 4, needsTier: 2, drops: 'diamond' }),
  stone('emerald_ore', 'Emerald ore', { hardness: 4, needsTier: 2 }),
  stone('lapis_ore', 'Lapis ore', { hardness: 3, needsTier: 1, drops: 'lapis' }),
  // Redstone and emerald ore are no longer generated (they had no use); they stay so old worlds keep them.
  // Ember ore: deep down in deepslate near the lava, glowing faintly; only a diamond pickaxe gets its crystals.
  stone('ember_ore', 'Ember ore', { hardness: 6, needsTier: 3, drops: 'ember_crystal', lightEmission: 5 }),
  { key: 'cactus', name: 'Cactus', tiles: { top: 'cactus_top', side: 'cactus_side', bottom: 'cactus_top' }, hardness: 0.5, density: 700 },
  // Tall grass sometimes gives wheat seeds (handled where blocks are broken).
  plant('tall_grass', 'Tall grass', { drops: '' }),
  plant('fern', 'Fern'),
  plant('poppy', 'Poppy'),
  plant('dandelion', 'Dandelion'),
  plant('brown_mushroom', 'Brown mushroom'),
  plant('red_mushroom', 'Red mushroom'),
  plant('reed', 'Reed'),
  thin('lily_pad', 'Lily pad'),
  thin('moss', 'Moss'),
  thin('leaf_litter', 'Leaf litter'),
  // Snow is walked on, unlike the other thin layers.
  thin('snow', 'Snow', { layer: 'opaque', variants: SNOW_LAYERS, hardness: 0.1, solid: true, needsSupport: false, mineWith: 'shovel' }),
];

/** The facing of a variant (+x, -x, +z, -z) and the side a quarter-turn on. */
const PANEL: Record<number, Box> = { 0: [13, 0, 0, 16, 16, 16], 1: [0, 0, 0, 3, 16, 16], 2: [0, 0, 13, 16, 16, 16], 3: [0, 0, 0, 16, 16, 3] };
const TURN = [2, 3, 1, 0];
const HIGH_HALF: Record<number, Box> = { 0: [8, 8, 0, 16, 16, 16], 1: [0, 8, 0, 8, 16, 16], 2: [0, 8, 8, 16, 16, 16], 3: [0, 8, 0, 16, 16, 8] };
const STAIR_MATERIALS = ['planks', 'cobblestone', 'stone', 'brick', 'sandstone'];
export const TOOL_TIERS = ['wooden', 'stone', 'iron', 'diamond'] as const;
export const TOOL_KINDS: readonly ToolKind[] = ['pickaxe', 'axe', 'shovel', 'sword'];
const DURABILITY = [60, 132, 251, 1561];
/** Armour materials and pieces: protection per piece (head, chest, legs, feet), warmth per piece, and hits it takes. */
export const ARMOUR_PIECES = ['helmet', 'chestplate', 'leggings', 'boots'] as const;
export const ARMOUR_MATERIALS = {
  leather: { protection: [1, 3, 2, 1], warmth: [3, 6, 4, 2], durability: 80 },
  iron: { protection: [2, 6, 5, 2], warmth: [0, 1, 1, 0], durability: 240 },
  diamond: { protection: [3, 8, 6, 3], warmth: [0, 1, 1, 0], durability: 500 },
} as const;
export const CROP_STAGES = 4;
/** Sapling variants: the tree species each grows into. */
export const SAPLING_SPECIES = ['oak', 'birch', 'spruce', 'maple', 'pine', 'acacia', 'jungle_giant', 'palm'] as const;

/** Blocks and items of play: light, crafting, smelting, doors, beds, stairs, crops, saplings, tools and food. */
function gameplay(): BlockSpec[] {
  const crop = (key: string, name: string, food: number): BlockSpec => plant(key, name, {
    variants: CROP_STAGES, variantTiles: Array.from({ length: CROP_STAGES }, (_, v) => `${key}_${v}`), food,
  });
  return [
    { key: 'torch', name: 'Torch', tiles: all('torch'), shape: 'boxes', boxes: () => [[7, 0, 7, 9, 10, 9]], solid: false,
      layer: 'cutout', lightEmission: 14, hardness: 0, needsSupport: true, supports: false },
    { key: 'chest', name: 'Chest', tiles: { top: 'chest_top', side: 'chest_side', bottom: 'chest_top' }, front: 'chest_front',
      variants: 4, hardness: 2.5, density: 600, ...wood },
    { key: 'crafting_table', name: 'Crafting table', tiles: { top: 'crafting_table_top', side: 'crafting_table_side', bottom: 'planks' },
      hardness: 2.5, density: 600, ...wood },
    stone('furnace', 'Furnace', { tiles: { top: 'furnace_top', side: 'furnace_side', bottom: 'furnace_top' }, front: 'furnace_front', variants: 4, hardness: 3.5 }),
    stone('lit_furnace', 'Lit furnace', { tiles: { top: 'furnace_top', side: 'furnace_side', bottom: 'furnace_top' }, front: 'furnace_front_lit',
      variants: 4, hardness: 3.5, lightEmission: 13, drops: 'furnace' }),
    // A door is a column of door cells (variant: facing + 4 when open); closed it fills its cell for collision.
    { key: 'door', name: 'Door', tiles: all('door'), shape: 'boxes', variants: 8, hardness: 3, density: 600, mineWith: 'axe',
      boxes: (v) => [PANEL[v < 4 ? v : TURN[v - 4]!]!], fuel: 10 },
    // A bed covers two cells: variant facing + 4 for the head end.
    { key: 'bed', name: 'Bed', tiles: { top: 'bed_top', side: 'bed_side', bottom: 'planks' }, shape: 'boxes', variants: 8,
      boxes: () => [[0, 0, 0, 16, 9, 16]], hardness: 0.5, density: 300 },
    ...STAIR_MATERIALS.map((m): BlockSpec => ({
      key: `${m}_stairs`, name: `${m[0]!.toUpperCase()}${m.slice(1)} stairs`, tiles: all(m), shape: 'boxes', variants: 4,
      boxes: (v) => [[0, 0, 0, 16, 8, 16], HIGH_HALF[v]!], hardness: 2, mineWith: m === 'planks' ? 'axe' : 'pickaxe',
      needsTier: m === 'planks' ? undefined : 0, blocksSky: false,
    })),
    // A campfire: crossed logs on embers. It lights, warms and slowly cooks food without fuel; standing in it burns.
    { key: 'campfire', name: 'Campfire', tiles: { top: 'campfire_top', side: 'campfire_side', bottom: 'campfire_side' }, shape: 'boxes',
      boxes: () => [[1, 0, 3, 15, 3, 6], [1, 0, 10, 15, 3, 13], [3, 3, 1, 6, 6, 15], [10, 3, 1, 13, 6, 15]], layer: 'cutout',
      lightEmission: 14, hardness: 1, density: 600, mineWith: 'axe', blocksSky: false, supports: false },
    // A ladder hangs on the side of the cell it was placed against (variant: facing); climbed by walking into it.
    { key: 'ladder', name: 'Ladder', tiles: all('ladder'), shape: 'boxes', variants: 4, boxes: (v) => [PANEL[v]!], solid: false,
      layer: 'cutout', hardness: 0.5, density: 600, mineWith: 'axe', fuel: 5, supports: false, blocksSky: false },
    crop('wheat', 'Wheat', 0),
    crop('carrots', 'Carrots', 3),
    { ...crop('potatoes', 'Potatoes', 1), smeltsTo: 'baked_potato' },
    plant('sapling', 'Sapling', { variants: SAPLING_SPECIES.length, fuel: 5 }),
    item('stick', 'Stick', { fuel: 5 }),
    item('coal', 'Coal', { fuel: 80 }),
    item('iron_ingot', 'Iron ingot'),
    item('gold_ingot', 'Gold ingot'),
    item('diamond', 'Diamond'),
    item('lapis', 'Lapis'),
    item('ember_crystal', 'Ember crystal'),
    item('leather', 'Leather'),
    item('feather', 'Feather'),
    item('string', 'String'),
    item('bone', 'Bone'),
    item('bone_meal', 'Bone meal'),
    item('arrow', 'Arrow'),
    item('bow', 'Bow', { maxStack: 1, fuel: 10 }),
    item('paper', 'Paper'),
    item('compass', 'Compass', { maxStack: 1 }),
    item('map', 'Map', { maxStack: 1 }),
    // A lantern hangs from the cell above or stands on the one below, and gives the brightest light there is.
    { key: 'lantern', name: 'Lantern', tiles: all('lantern'), shape: 'boxes', boxes: () => [[5, 0, 5, 11, 8, 11]], solid: false,
      layer: 'cutout', lightEmission: 15, hardness: 0.5, supports: false, blocksSky: false, mineWith: 'pickaxe' },
    ...Object.entries(ARMOUR_MATERIALS).flatMap(([m, a]) => ARMOUR_PIECES.map((piece, slot) => item(`${m}_${piece}`,
      `${m[0]!.toUpperCase()}${m.slice(1)} ${piece}`, {
        maxStack: 1, armour: { slot, protection: a.protection[slot]!, warmth: a.warmth[slot]!, durability: a.durability },
      }))),
    item('bucket', 'Bucket', { maxStack: 16 }),
    item('water_bucket', 'Water bucket', { maxStack: 1, emptiesTo: 'bucket' }),
    item('lava_bucket', 'Lava bucket', { maxStack: 1, emptiesTo: 'bucket', fuel: 200 }),
    item('baked_potato', 'Baked potato', { food: 5 }),
    item('raw_meat', 'Raw meat', { food: 2, smeltsTo: 'cooked_meat' }),
    item('cooked_meat', 'Cooked meat', { food: 6 }),
    ...TOOL_TIERS.flatMap((tier, t) => TOOL_KINDS.map((kind) => item(`${tier}_${kind}`, `${tier[0]!.toUpperCase()}${tier.slice(1)} ${kind}`, {
      maxStack: 1, tool: { kind, tier: t, durability: DURABILITY[t]! }, fuel: tier === 'wooden' ? 10 : undefined,
    }))),
  ];
}
/** Slabs of every full solid cube: variant 0 is the bottom half, 1 the top half. */
const SLABS: BlockSpec[] = BASE.filter((s) => (s.solid ?? true) && (s.layer ?? 'opaque') === 'opaque' && !s.falls && s.key !== 'bedrock' && !s.lightEmission)
  .map((s) => ({ ...s, key: `${s.key}_slab`, name: `${s.name} slab`, shape: 'slab', variants: 2, slabOf: s.key, opaque: false, blocksSky: false,
    drops: undefined, smeltsTo: undefined }));

export const BLOCKS = new BlockRegistry([...BASE, ...SLABS, ...gameplay()]);
export const AIR = 0;
