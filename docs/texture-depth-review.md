# Texture depth and detail scale — 0.6.7

Owner direction: textures should retain readable depth in 2D pixel art, with larger main details. The original
grass's defined blades are the reference; the flatter speckled replacement was a regression. Keep the effect
restrained. Grass remains vegetation on all six faces.

## Art standard

- Work at the actual 32×32 output size. Main terrain forms should usually span 4–10 texels, with quiet secondary
  detail. A busy high-resolution source is not a substitute for a readable export.
- Give a main form a restrained light-catching edge/plane, a broad midtone and a tucked overlap shadow. Preserve
  calm areas; avoid making every edge black or every material inflated, shiny or deeply chiselled.
- Grass uses separate overhead tufts and upright side blades, roughly 2–4 texels wide and 6–16 long with staggered
  tips. Shadows between blades are green, not exposed soil. Bottoms use the overhead vegetation material.
- Rocks use broad planes and a few clear clefts; gravel has smaller shaded pebbles; ores have a few larger mineral
  pockets within the same host rock. Snow, sand and clay keep softer, quieter relief than stone.
- Planks have three or four broad boards, recessed joins and sparse grain features. Foliage uses broad leaf groups
  or needle fans with overlapping planes, rather than tiny confetti. Preserve species palettes and silhouettes.
- Water uses restrained broad ripple crests/troughs; lava uses larger crust plates; bedding has shallow folds and
  a softly shaded pillow. These should not acquire stone-like bevels.
- Keep icon silhouettes and existing successful shading. UI/backing surfaces may be quiet so their content stays
  readable; do not add arbitrary visual noise simply to make every surface equally strong.
- Foliage gaps must be actual transparency, with no white/checker matte left between leaves. A regression check
  catches white background pixels even when the image already has transparent pixels elsewhere.

## Review and changes

| Family | Decision |
| --- | --- |
| Grass top/sides | Repainted from the original blade reference; distinct directional surfaces, all green |
| Stone, dirt, sand, gravel | Repainted: larger shaded planes/clods/ripples/pebbles |
| Farmland, clay, snow and nine additional rock types | Repainted with material-specific broad forms |
| Eight ores | Repainted with larger deposits and matching shaded host rock |
| Fourteen plank species | Repainted with broader board/grain structure |
| Fourteen leaf species | Repainted with larger shaded leaf/fan groups and verified transparency |
| Water, lava, blanket and bed head | Repainted with restrained surface/fold depth |
| Cobblestone, brick, obsidian, glowstone | Retained: clear existing masonry/crystal forms and recessed joins |
| Bark, end grain, cactus | Retained: existing ridges, rings and material identity remain legible |
| Furniture/station frames, signs and light bodies | Retained: frames, openings and fittings already have readable form |
| Tools, armour, resources/food and navigation icons | Retained: strong silhouettes and material facets already read at slot size |
| Plants, crop stages and saplings | Retained: existing shaded silhouettes, growth scale and ground contact |
| Creature skins and UI library | Retained; this pass does not introduce new creature states or UI content |

There are **58 repainted materials** and **124 changed runtime exports** after rebuilding their alternatives,
aliases, oriented bed heads and fluid frames. The other 208 exports in the two active rework packs remain unchanged.
These counts come from decoded-pixel hashes, not from counting renamed files as new artwork. Live array names,
344-layer coverage, 164 visible types, geometry, saves and renderer lighting remain compatible.

Exact primary-material list, changed/retained names and before/after hashes:
`assets/woodland-ember/depth-review/review.json`. Original art and the immediately previous grass pixels are
preserved for `assets/woodland-ember/depth-review/grass-definition.png`.

## Inspection

Rebuild the usual core/world packers, then run `depth-preview.mjs`, `depth-review.mjs`, `rework-preview.mjs` and
`rework-coverage.mjs`. The comparison is an inspection image, never a packing input. Source crops, alpha rules,
separate runtime PNGs and face bindings remain in the existing manifests.

The actual-game gallery supports named subsets, for example:

    node scripts/core-texture-gallery.mjs blocks repeats

With no arguments it runs all 386 cube/face/slab/stair/tree/station/plant/icon/animation cases. Review native pixels,
three-quarter models, joined surfaces and normal world captures; retain both bright and darker scene checks.
Run the normal check/build, isolated benchmark and production smoke gates for the integrated pass.
