import { BLOCKS } from '../engine/blocks';

/** The inventory material for a placed block: keep species, discard facing and growth. */
export function buildingMaterial(state: number): number {
  const type = BLOCKS.type(state);
  if (type.key === 'lit_furnace') return BLOCKS.state('furnace');
  if (type.key === 'lit_beacon') return BLOCKS.state('beacon');
  if (['log', 'planks', 'sapling'].includes(type.key)) return state;
  if (type.key === 'leaves') return type.id + (BLOCKS.variant(state) | 1);
  return type.id;
}
