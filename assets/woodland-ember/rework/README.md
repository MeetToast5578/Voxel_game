# World and equipment rework — 0.6.7

This replaces the game's ground/rock/ore materials, tree species, foliage, crops, saplings, furniture and station
faces, equipment and ordinary inventory icons. Grass is vegetation on **all six faces**, including the underside;
the earlier grass-over-soil direction was incorrect for this game.

The [depth/detail refinement](../../../docs/texture-depth-review.md) restores larger defined grass blades and
repaints the flatter material families with restrained form shading. Native-pixel comparison and exact changed
exports are under `assets/woodland-ember/depth-review/`. Already-readable equipment and other surfaces are retained.

The expanded pack has 213 base tiles and 83 derived exports: coherent material alternatives, explicit aliases,
four door segments, oriented bed heads, light-item icons and six eight-frame animation loops. These are 296 separate 32×32 PNGs, alongside the 36
core-pack exports. Derived exports are not counted as independently authored materials. Exact live layer/type
coverage and the intentionally preserved breaking/ember art are listed in [`coverage.json`](coverage.json).

## Contents

- Ground, snow, stone families, luminous rock and all eight ore types, including legacy ores.
- Bark/end grain for all fifteen wood types, plus leaves/planks for fourteen living types and cactus surfaces.
- All ten ground plants, twelve crop growth stages, eight saplings and three harvested-crop inventory icons.
- All twenty tools, twelve armour pieces, resources, food, containers, ranged gear and navigation images.
- Chest/ancient chest, workbench, furnace, trading post, forge, bed, campfire, beacon, door, ladder, lights, sign/frame
  and linen frame backing. Bed pillows appear only at the head end, oriented for each facing.
- Water/lava loops and animated furnace/forge openings, torch flames and lantern light. Each loop has eight separate
  frame files. Station frame pixels remain fixed outside their declared opening. Fluid movement uses a smooth
  repeating phase sequence of the authored material, rather than eight unrelated paintings.

## Separation and source contract

`sources/` preserves the authored PNGs. Full material masters contain one surface. Equipment and coordinated face
sets use deliberately separated cells with real transparent gutters. `source-layouts.json` defines their exact
reading order. No cell is accepted if its artwork reaches a neighbouring cell: the carrot sheet was regenerated
after this check caught an overlap. Four leaf panels with painted white gaps are explicitly skipped in favour of
separate foliage sources with actual alpha gaps.

`manifest.json` records each measured source rectangle in pixels, original image dimensions, output placement,
alpha/repeat rules and animation bindings. `texture-index.json` lists every separate output, provenance, derivation
and decoded-pixel SHA-256. There is no guessed equal-grid cut with neighbouring artwork left in the output.
`tiles/` contains one complete named texture per file; previews are inspection sheets only.

32×32 RGBA pixels are quantized to five-bit RGB. Cutouts have binary alpha and zero RGB outside the silhouette.
Icons retain their aspect ratio and padding. Crop stages share a source scale and ground baseline, preserving
growth differences. Torch/lantern world exports fill their partial-box UV rectangles while their separate inventory
sprites retain their proportions and padding. Repeating
materials match their declared opposite borders; furniture frames and cut wood ends are not forcibly blended.

The runtime applies these images after the earlier packs, including overrides of the alternatives actually selected
by the shader. A four-cell door uses four vertical portions of its full image, selected by the mesher even across
chunk boundaries; it no longer repeats a complete door on every cell. Block IDs, named saves, collision and recipes
remain compatible. Item frames display the backing material, and harvested crops use their dedicated icons.

## Fluid artifact refinement (0.6.8)

Water and lava have independently repainted masters without regular directional bands. Their eight frames use a
periodic warp across the whole tile, including the borders; a fixed perimeter around a moving interior previously
made a stationary grid. Every frame retains matching opposite edges. The terrain shader interpolates fluid frames
while station flames retain their own discrete timing. Water draws the boundary facing the camera's medium,
removing dark rectangles from overlapping far walls/bottoms; underwater detection follows the actual fluid height.
The mesher also retains the exposed joining strip between different fluid heights instead of leaving open cracks.

## Rebuild and check

From the repository root, with the existing Chromium/Playwright setup:

    node scripts/pack-core-rework.mjs
    node scripts/pack-rework.mjs
    node scripts/rework-preview.mjs
    node scripts/rework-coverage.mjs
    npm run check
    node scripts/core-texture-gallery.mjs
    npm run benchmark -- --assert
    CHROMIUM_PATH=/usr/bin/chromium npm run smoke -- --view 4

The packer limits decoded-image memory by processing four source images at a time. Set `CHROMIUM_PATH` for another
Chromium installation. Previews under `previews/` are generated from the separate runtime PNGs. The actual game
gallery covers cubes, all six grass faces, every slab half/stair facing, ores, wood species, assembled doors,
stations, growth stages, inventory icons and animation playback. Captures and GPU checks go to ignored
`screenshots/core-textures-*` and `screenshots/core-texture-checks.json`.

## Still open

The full production backlog remains in [`texture-asset-audit.md`](../../../docs/texture-asset-audit.md). This pass
replaces base surfaces and icons; head sides/hands/facial states for mobs, a matching trader portrait, held-item
grips and action poses, tier-preserving upgrade presentation, projectile shapes, directional falling-fluid/foam
effects, beacon state animation, UI state integration and larger illustrations remain separate work. Species wood
stairs/slabs also need registry support before their extra states can be selected. Existing refined creature rigs
and sixty skins remain active.
