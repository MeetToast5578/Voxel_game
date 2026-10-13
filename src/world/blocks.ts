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
} as const;

export type RenderLayer = 'none' | 'opaque' | 'cutout' | 'translucent';

export interface BlockDef {
  id: number;
  name: string;
  solid: boolean;
  opaque: boolean;
  targetable: boolean;
  breakable: boolean;
  cullSame: boolean;
  /** Block light this block emits, 0..15. */
  lightEmission: number;
  layer: RenderLayer;
  tiles: { top: number; side: number; bottom: number };
}

function def(
  id: number,
  name: string,
  tiles: { top: number; side: number; bottom: number },
  opts: Partial<Omit<BlockDef, 'id' | 'name' | 'tiles'>> = {},
): BlockDef {
  return {
    id,
    name,
    tiles,
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

export const BLOCKS: readonly BlockDef[] = [
  def(BlockId.AIR, 'Air', all(0), { solid: false, opaque: false, targetable: false, breakable: false, layer: 'none' }),
  def(BlockId.STONE, 'Stone', all(Tile.STONE)),
  def(BlockId.DIRT, 'Dirt', all(Tile.DIRT)),
  def(BlockId.GRASS, 'Grass', { top: Tile.GRASS_TOP, side: Tile.GRASS_SIDE, bottom: Tile.DIRT }),
  def(BlockId.SAND, 'Sand', all(Tile.SAND)),
  def(BlockId.WATER, 'Water', all(Tile.WATER), {
    solid: false, opaque: false, targetable: false, breakable: false, cullSame: true, layer: 'translucent',
  }),
  def(BlockId.LOG, 'Log', { top: Tile.LOG_TOP, side: Tile.LOG_SIDE, bottom: Tile.LOG_TOP }),
  def(BlockId.LEAVES, 'Leaves', all(Tile.LEAVES), { opaque: false, layer: 'cutout' }),
  def(BlockId.PLANKS, 'Planks', all(Tile.PLANKS)),
  def(BlockId.GLASS, 'Glass', all(Tile.GLASS), { opaque: false, cullSame: true, layer: 'cutout' }),
  def(BlockId.BEDROCK, 'Bedrock', all(Tile.BEDROCK), { breakable: false }),
  def(BlockId.COBBLESTONE, 'Cobblestone', all(Tile.COBBLESTONE)),
  def(BlockId.BRICK, 'Brick', all(Tile.BRICK)),
  def(BlockId.GLOWSTONE, 'Glowstone', all(Tile.GLOWSTONE), { lightEmission: 15 }),
];

const OPAQUE = new Uint8Array(256);
const SOLID = new Uint8Array(256);
const EMISSION = new Uint8Array(256);
for (const b of BLOCKS) {
  OPAQUE[b.id] = b.opaque ? 1 : 0;
  SOLID[b.id] = b.solid ? 1 : 0;
  EMISSION[b.id] = b.lightEmission;
}

export function getBlockDef(id: number): BlockDef {
  const b = BLOCKS[id];
  if (!b) throw new Error(`Unknown block id ${id}`);
  return b;
}
export function isOpaque(id: number): boolean {
  return OPAQUE[id] === 1;
}
export function isSolid(id: number): boolean {
  return SOLID[id] === 1;
}
export function lightEmission(id: number): number {
  return EMISSION[id]!;
}
