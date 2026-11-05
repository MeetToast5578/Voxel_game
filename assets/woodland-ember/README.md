# Woodland & Ember

The active [world and equipment rework](rework/README.md) replaces terrain, tree species, plants, furniture and
inventory art, alongside the [core pack](core-rework/README.md). Individual PNGs have measured source bounds,
alpha/repeat contracts and model bindings. Grass is vegetation on every face; the gallery checks real game geometry,
icons and station/fluid animation. The original atlases below remain source history.

The game's 0.4.0 art pack. Direction: warm woodland greens and oak, cool layered rock, plum-black ancient masonry,
amber ember crystals and icy cyan beacon shards. Created for this game with image generation; the separate
presentation concept is not used as a texture atlas.

## Inventory and sources

`manifest.json` gives the **exact row-major order** of all used tiles in each source PNG:

| Source | Grid | Used tiles | Content |
| --- | --- | --- | --- |
| terrain-source.png | 8 × 7 | 55 (last cell spare) | Soils, rocks, fluids, ores, wood, furniture faces, beacon |
| items-source.png | 8 × 8 | 61 (last three spare) | Materials, food, tools, armour, weapons, map, compass, boat |
| cutouts-source.png | 6 × 5 | 30 | Foliage, plants, four stages of each crop, glass, lights, fittings |

Slabs, stairs, flowing fluids, snow depths, facings and sapling species reuse the registered material tiles;
no block IDs, item names, gameplay rules or save formats change. Legacy redstone/emerald still get art.
The first-person item overlay and dropped-item renderer share the inventory artwork.

`src/render/creatureArt.ts` now assembles authored skin tiles for 20 creature/NPC types from the expansion pack.
Species-specific voxel rigs add ears, antlers, horns, tails, fins, arms and accessories in one instanced draw.
Faces appear only on head fronts; world light and hit feedback are applied to the authored skin colours.
`src/render/woodlandArt.ts` also draws ten cumulative connected breaking overlays.
The ridden boat uses the authored plank texture.

## Rebuild

From the repository root, with the existing Playwright dependency and Chromium installed:

    node scripts/pack-art.mjs

Set `CHROMIUM_PATH` if Chromium is not at `/usr/bin/chromium`.
The packer mechanically slices the source grid with a 2% inset to exclude neighbouring-cell bleed, uses
nearest-neighbour sampling at 32 × 32, quantizes RGB to 5 bits,
thresholds cutout alpha, fits torch/lantern textures to existing UVs, and matches the outer texels of repeating
natural materials. Furniture frames are exempt. The output is `src/render/woodlandArt.json`, a palette/index table.
`node scripts/art-preview.mjs` writes a labeled contact sheet of the packed pixels to `screenshots/`.
Source PNGs are for editing; the synchronous packed pixels are bundled, with no runtime fetches or DOM requirements.
GPU magnification remains nearest-neighbour; terrain retains mipmaps for distant stability.
The array is 624 KiB RGBA for 156 tiles (four times the old 16 × 16 array).

## Validation and limits

`src/tests/art.test.ts` checks registry coverage, opaque/cutout alpha, row orientation, repeat edges, progressive
breaking, and creature skin coverage. Run the regular check, benchmark and browser smoke commands.
The generated source atlases are a first art pass; equal grid slicing is deliberately explicit and reproducible.
Matching edge pixels removes hard boundary discontinuities, but does not guarantee imperceptible repetition in
large expanses. Review the in-game forest, river, cave and inventory screenshots for visual tuning.

Sky, clouds, precipitation, far-terrain geometry and audio remain procedural. The expansion now supplies Pixel Aero
nine-slice menus, slots, status icons and reticle artwork within the existing responsive CSS UI. No new game mechanics or extra content items
are introduced by the spare source cells.

## Mob refinement (0.6.3)

The active creature skins now come from the [refinement pack](refinement/README.md): sixty cleaner body/face/limb
textures and four shared accessory surfaces. Species rigs retain the original collision bodies and use connected
joint animation, per-part texture regions and one instanced draw. The original sheets above remain source history.
