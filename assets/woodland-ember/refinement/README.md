# Woodland & Ember mob refinement

Version 0.6.3 supplies a cleaner authored skin set for all twenty existing creatures/NPCs. Large pixel clusters,
simple eyes and broader material shapes replace fine texture noise. Single-limb art and separate hoof/paw crops
avoid wrapping a picture of multiple legs around each limb. Trader clothing no longer borrows the skulker skin.

`creatures-source.png` is the generated 8 × 8 source atlas. `manifest.json` records the exact cell order: sixty
species body/face/limb tiles plus shared teal cloth, stitched leather, warm bone and brass. `tiles/` contains the
individual opaque 32 × 32 PNGs; `creatures.json` stores portable palette/index data.

From the repository root:

    node scripts/pack-mob-refinement.mjs

The exporter mechanically crops each cell with a 2.5% inset, samples with nearest-neighbour filtering, quantizes
RGB to five bits and forces opaque alpha. Chromium is required (`CHROMIUM_PATH` overrides `/usr/bin/chromium`).
It then calls `export-runtime-art.mjs`, which merges these skins over the original expansion aliases. The original
expansion source library is preserved. Runtime artwork remains bundled for offline use, with no image fetches.

`src/render/mobModels.ts` defines species proportions and accessories within 32 parts. Limb pairs, bow pieces,
head details and tail segments share joints. Animation converts height/width units before rotation; sleeping
rigs shift together onto the ground. The renderer uses vertical texture regions for legs versus feet, half-texel
atlas clamps, shared accessory rows and the original one-draw instancing. The Warden core retains a minimum
brightness in dark scenes. Creature sizes, collision bodies, AI, drops and save formats are unchanged.

Inspect the actual game rigs:

    node scripts/mob-gallery.mjs
    node scripts/mob-gallery.mjs --pose=walk --angle=side
    node scripts/mob-gallery.mjs --pose=sleep --angle=three-quarter
    node scripts/mob-gallery.mjs --pose=attack --angle=front

Screenshots are written to ignored `screenshots/mob-gallery-<pose>-<angle>.png`; the default also updates
`screenshots/mob-gallery.png`. Each run checks shader/browser errors, species coverage, part count and draw calls.
`src/tests/mobRefinement.test.ts` checks active art coverage, connected joints, accessory inheritance, grounded
sleep poses, instancing and the dark-scene core. Run the usual check, benchmark and browser smoke commands too.
