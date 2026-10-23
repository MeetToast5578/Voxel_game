import { NO_PICKAXE_SLOWDOWN, TOOL_KINDS, TOOL_TIERS } from '../config';
import { blockVariant, getBlockDef } from '../world/blocks';

export type MiningToolKind = (typeof TOOL_KINDS)[number];

const AXE_BLOCKS = new Set(['log', 'planks', 'fallen_log_x', 'fallen_log_z', 'crafting_table', 'bed', 'cactus']);
const SHOVEL_BLOCKS = new Set(['dirt', 'grass', 'sand', 'gravel', 'clay', 'snow']);

/** The tool kind and tier speed of a held state, or null when it is not a tool (T-I5). */
export function toolOf(state: number): { kind: MiningToolKind; speed: number } | null {
  const [tier, kind] = getBlockDef(state).key.split('_') as [string, MiningToolKind | undefined];
  const t = TOOL_TIERS[tier as keyof typeof TOOL_TIERS];
  return t && kind && TOOL_KINDS.includes(kind) ? { kind, speed: t.speed } : null;
}

/**
 * The tool that mines a block fast: an axe for wood, a shovel for loose ground, a pickaxe for anything else solid and
 * at least as hard as stone by hand (DEFAULT_HARDNESS), and none for soft blocks and plants. Slabs follow their material.
 */
export function minedWith(state: number): MiningToolKind | null {
  const def = getBlockDef(getBlockDef(state).slabMaterial ?? state);
  if (AXE_BLOCKS.has(def.key)) return 'axe';
  if (SHOVEL_BLOCKS.has(def.key)) return 'shovel';
  return def.solid && def.hardness >= 1 ? 'pickaxe' : null;
}

/**
 * Seconds to break `block` holding `held` (T-I5). The right tool divides the hand time by its tier speed; in survival a
 * block that needs a pickaxe takes NO_PICKAXE_SLOWDOWN times longer without one. Creative mines at hand speed or better.
 */
export function breakSeconds(block: number, held: number, survival: boolean): number {
  const hardness = getBlockDef(block).hardness;
  const tool = toolOf(held), needs = minedWith(block);
  if (tool && tool.kind === needs) return hardness / tool.speed;
  return survival && needs === 'pickaxe' ? hardness * NO_PICKAXE_SLOWDOWN : hardness;
}

/** False when survival mining gives nothing: a block that needs a pickaxe, broken without one. */
export function dropsWhenMined(block: number, held: number): boolean {
  return minedWith(block) !== 'pickaxe' || toolOf(held)?.kind === 'pickaxe';
}

/** The held tool after one use: its next wear state, or null when that use breaks it. Other states are unchanged. */
export function afterUse(state: number): number | null {
  if (!toolOf(state)) return state;
  return blockVariant(state) + 1 >= getBlockDef(state).variants ? null : state + 1;
}

/** Uses a tool has left, or null for anything else (for its name in the inventory). */
export function usesLeft(state: number): number | null {
  return toolOf(state) ? getBlockDef(state).variants - blockVariant(state) : null;
}
