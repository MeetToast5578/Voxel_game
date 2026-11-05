import { tileIndex } from './tilePixels';
import { REWORK_ANIMATIONS } from './reworkNames';

export const VARIED_MATERIALS = ['stone', 'dirt', 'grass_top', 'grass_side', 'sand', 'gravel', 'snow', 'cobblestone', 'basalt', 'slate', 'deepslate', 'planks'] as const;
export const ANIMATED_MATERIALS = ['water', 'lava'] as const;
/** Vertex-side selection preserves greedy meshing: variation is sampled by world cell in the fragment shader. */
export function textureVariantSetup(): string {
  return [
    'vVariationStart = -1.0; vAnimationStart = -1.0; vAnimationRate = 4.0;',
    ...VARIED_MATERIALS.map(name => `if (int(vTile) == ${tileIndex(name)}) vVariationStart = ${tileIndex(`${name}_alt_0`)}.0;`),
    ...ANIMATED_MATERIALS.map(name => `if (int(vTile) == ${tileIndex(name)}) vAnimationStart = ${tileIndex(`${name}_0`)}.0;`),
    ...REWORK_ANIMATIONS.filter(a=>a.tile!=='water'&&a.tile!=='lava').map(a => `if (int(vTile) == ${tileIndex(a.tile)}) { vAnimationStart = ${tileIndex(a.frames[0])}.0; vAnimationRate = ${a.fps}.0; }`),
  ].join('\n');
}
