# Spec 48: Coasts, horizon and climate vegetation

Completes T-D6, T-D7, T-E2, T-E3 and T-E4 in that order.

## Coast and ocean rules

A continental shelf leads to deep ocean within the existing -300 m lower terrain limit.
Near the ocean, continentalness gradients define wave exposure to the prevailing westerly
wind; exposure and slope choose sand beaches, gravel/stony shores or rocky cliffs. Sheltered
shallow water can form seeded sandbars. Rivers and lakes retain their sediment/roof rules;
aquifers, underground basin protection, saved edits and the mountain cap are preserved.

## Horizon

Generate coarse concentric heightfield rings in a dedicated worker, out to about 2.4 km.
Near rings sample actual terrain/water; farther rings blend region elevation into the broad
climate surface. Stitch fine outer boundaries to coarse edges. Colour by climate and surface,
fade the near overlap and distant edge, and dispose replaced geometry. Rebuild on snapped
movement/settings changes, coalescing requests; do no terrain generation in the render loop.
Keep horizon fog separate from short underwater fog. Hide it underground/underwater.
The workers=0 debugging mode omits horizon LOD. Terrain only: saved buildings are not in LOD.
Do not raise mountain heights or claim manual horizon acceptance from headless screenshots.

## Climate colours and vegetation

Grass, foliage and water vertex multipliers use a smooth world-coordinate climate colour
map, including altitude. Adjacent chunks and worker/main meshing must agree; never choose
tints by chunk biome IDs. Existing AO and sky/block light remain independent. Pass seed and
chunk coordinates through the worker protocol and benchmark the enabled tint path.

Existing poppies/dandelions receive documented biome weights, with no flowers in barren
biomes. Preserve deterministic plant rolls, ferns/mushrooms and dry grass-only placement.
Append reeds with procedural cross-shaped art. They grow on dry sand/grass/clay/gravel banks
next to actual surface water, never under water or over cave mouths. Heights and probability
are configured in metres; plants spanning chunk slices reproduce exactly.

## Verification

Pure coast profiles/exposure/shelf tests and generator integration protect surface water.
Test horizon coverage, finite geometry, level transitions, negative coordinates and seed
variation; browser checks must observe real horizon geometry and inspect a rendered image.
Check climate colour continuity across chunk borders, seed/coordinate variation, non-tinted
materials and actual mesh colours. Test biome flower distributions and shoreline reed
placement/slice continuity; browser checks inspect real generated flora. Run full checks,
the isolated enabled worker benchmark, GPU regression and all gameplay smoke checks
sequentially. Log decisions, failures, results and limits; preserve dependency pins/old IDs.
