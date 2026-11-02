import { tileIndex } from './tilePixels';

export const VARIED_MATERIALS = ['stone', 'dirt', 'grass_top', 'grass_side', 'sand', 'gravel', 'snow', 'cobblestone', 'basalt', 'slate', 'deepslate', 'planks'] as const;
export const ANIMATED_MATERIALS = ['water', 'lava'] as const;
/** Vertex-side selection preserves greedy meshing: variation is sampled by world cell in the fragment shader. */
export function textureVariantSetup(): string {
  return [
    'vVariationStart = -1.0; vAnimationStart = -1.0;',
    ...VARIED_MATERIALS.map(name => `if (int(vTile) == ${tileIndex(name)}) vVariationStart = ${tileIndex(`${name}_alt_0`)}.0;`),
    ...ANIMATED_MATERIALS.map(name => `if (int(vTile) == ${tileIndex(name)}) vAnimationStart = ${tileIndex(`${name}_0`)}.0;`),
  ].join('\n');
}
