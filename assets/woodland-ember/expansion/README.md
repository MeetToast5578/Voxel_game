# Woodland & Ember expansion

336 named source assets, plus six new opaque trading-post/forge faces in the parent folder. The original source
order and PNG exports remain in `manifest.json`, with activation status. Runtime aliases also supply new mobs.

| Set | Source count | Current integration |
| --- | ---: | --- |
| Trees | 64 | Species-specific bark/end/leaves/planks, cactus/snags, saplings. Other four saplings come from Hands. |
| Creatures | 48 | Distinct rigs for the original 16 species; future skins and a trader extend the game to 20 types. |
| Materials | 48 | Four alternatives for 12 surfaces, selected in the shader without breaking greedy meshes. |
| Effects | 64 | Water/lava loops; fire/smoke at campfires, forge/furnace effects, impacts, splashes and lightning. |
| UI | 64 | Nine-slice panels, slots, buttons, HUD symbols and reticle. Unused generic glyphs remain available. |
| Hands / saplings | 16 | All eight sapling species; hand poses and glove appearance match worn armour. |
| Future content | 32 | Trading portrait/coin, forge, ember equipment icons, signs, frames and three new monster skins active. |

The woody tree set includes oak, maple, spruce, fir, larch, birch, pine, jungle giant, palm, baobab, acacia, willow,
mangrove and bush; saguaro has cactus textures, and dead snags gray wood. Old saves' `log`, `leaves`, `leaves#1` and
`planks` retain their meanings. Decorative face variants are separate from crop growth. Named chunk/item saves
remain readable, including optional equipment-upgrade and decoration metadata. Unedited generation gains the new
species materials and qualifying low wet land becomes swamp; edited saved chunks retain their named states.

## Rebuild and inspect

    node scripts/pack-expansion.mjs
    node scripts/pack-stations.mjs
    node scripts/validate-expansion.mjs

The exporter uses source PNGs, detects tree-sheet separators, crops edge bleed, uses nearest-neighbour sampling,
retains cutout alpha and writes `tiles/<set>/<name>.png`, `<set>.json` and labeled `*-preview.png` files.
It calls `export-runtime-art.mjs` to build the game subsets and aliases. Water/lava play at 4 fps; animation metadata
is in `animations.json`. Playwright and Chromium are required; `CHROMIUM_PATH` overrides `/usr/bin/chromium`.

`node scripts/mob-gallery.mjs` renders all twenty actual game rigs to `screenshots/mob-gallery.png`.
`node scripts/features-smoke.mjs` checks trading, forging, typed signs, frames and persistent reload through the UI.
Regular `npm run check`, benchmark `--assert` and smoke commands remain the main project checks.

## Gameplay now using the art

Right click traders/trading posts for two-way exchanges. Craft an ember forge to upgrade tools/armour through three
levels. Craft signs/frames, place them on wall faces and right click to edit/display items. Contents and upgrades
save with the world; framed items are returned when replaced, taken or their frame breaks/loses its support.

Mob rigs use textured cuboids and one instanced draw, including front-only face tiles, limbs and accessories.
The UI uses responsive CSS nine-slice assets and the existing GUI scale and input system; it is not a fixed 640×360
canvas renderer. Effects are bounded animated billboards. First-person hands remain sprites, not rigged 3D arms.

Additional trader portraits, lore/dye/seed-sack artwork and generic controller/navigation glyphs remain available
for future features. Villages and world-age difficulty scaling are not implemented by this integration.
