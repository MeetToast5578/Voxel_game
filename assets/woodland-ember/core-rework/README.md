# Core material rework (depth refinement in 0.6.7)

The first batch is now complemented by the [full world and equipment rework](../rework/README.md).
Eight runtime base names use eight distinct active material masters. Grass has separate overhead tufts and upright
side blades, with painted overlap shadows and larger readable forms; every face remains vegetation.
Each source contains exactly one complete texture. No inferred atlas cells, gutters, captions or neighbouring art
are used as runtime pixels.

| Master | Model faces | Repeat axes |
| --- | --- | --- |
| stone | Stone cubes, slabs and stairs | X/Y |
| dirt | Dirt cubes/slabs | X/Y |
| grass_top | Grass cube/slab tops and bottoms | X/Y |
| grass_side | Grass cube/slab sides, upright blades | X/Y |
| sand | All sand faces | X/Y |
| gravel | All gravel faces | X/Y |
| cobblestone | Cobblestone cubes, slabs and stairs | X/Y |
| brick | Brick cubes, slabs and stairs, upright | X/Y |

`sources/` preserves the full-size masters; the rejected soil-side painting is explicitly archived under
`sources/superseded/grass-soil-side.png`. `tiles/` contains 36
separately named, opaque 32×32 PNGs: eight base exports plus four deterministic alternatives for each material
except brick. These are eight active authored masters, not 36 independently authored designs.
Alternative 0 matches the base; the others shift the interior pattern while preserving a common boundary.
Grass is vegetation across every face; the underside uses grass_top. All exports preserve orientation.

`manifest.json` defines every source, export, repeat axis and face binding. `texture-index.json` lists every output,
its source, dimensions, variant and decoded-pixel SHA-256. `textures.json` and `src/render/coreArt.json` contain
the same portable palette/index data. The runtime applies these overrides after the older material alternatives,
so active shader variations use the rework too. Existing names and saved block IDs stay compatible.
`preview.png` is an inspection sheet, never a packing input.

## Rebuild and inspect

From the repository root, using the existing Playwright dependency and system Chromium:

    node scripts/pack-core-rework.mjs
    node scripts/core-texture-gallery.mjs
    npm run check
    npm run benchmark -- --assert
    CHROMIUM_PATH=/usr/bin/chromium npm run smoke -- --view 4

Adjust `CHROMIUM_PATH` when Chromium is not `/usr/bin/chromium`. The packer mechanically resamples each entire master,
quantizes RGB to five bits, matches the declared repeat boundaries and exports separate files and runtime data.

The gallery now also covers every slab/stair material, wood species, ores, plants, equipment, furniture and active
animation. Screenshots and GPU results go to ignored `screenshots/core-textures-*` and
`screenshots/core-texture-checks.json`. GPU probes check vegetation on all six faces of cubes and both slab halves,
including undersides. `npm run check` verifies dimensions, hashes, runtime overrides, alpha, seams and face bindings.

Partial shapes use world-unit UVs instead of squeezing a full tile onto each face. The soil-side shader mask and
special lower-slab UV flag were removed after the owner clarified that grass must cover every face.
