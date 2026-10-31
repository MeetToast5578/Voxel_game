# Spec 46: Local aquifers (T-D3)

## Goal

Caves extend below sea level and contain both dry passages and groundwater. A deterministic
local water table replaces blanket sea-level filling inside underground voids. Surface oceans,
rivers and lakes retain their existing levels and cave roofs.

## Requirements

1. A pure, seeded 2D simplex field determines the local water table. Sample in world metres,
   with horizontal scale 160 m, centre -42 m and amplitude 30 m. Thus groundwater is always
   below sea level (-72 to -12 m). Clamp it below the surface by the existing 5 m shore roof.
   Convert once to an integer block row per column cell; no per-voxel water-table noise.
2. A cave cell at or below that row is source water; above it is air. Apply the same rule to
   density voids at least SHORE_ROOF below the surface. Above-surface water and the shallow
   surface band retain their existing sea/river/lake fill.
3. Extend all four cave systems into negative y. The lowest two rows of the terrain generation
   band remain solid; chunks below that band remain stone. This supersedes spec 45's legacy
   y=0/1 no-carve guard: sea level must not be an artificial solid floor. Preserve the intent of
   its bottom-protection test at the actual band bottom.
4. All results depend only on seed and world coordinates. Negative coordinates, chunk
   boundaries, cache clearing, worker generation and chunk order must agree. Ore placement
   continues to replace rock only, never groundwater or cave air.
5. Surface water, sediments, cave roofs and surface features retain their existing rules.
   No new dependency, block state, save version, or persisted aquifer metadata.
6. Generated source water follows the existing flow rules after edits. This is a local
   groundwater model, not pressure simulation or a sealed multi-level reservoir model.

## Out of scope

Dedicated underground lake basins and lava pools (T-D4), lava simulation (T-G8), pressure,
fluid barriers, currents, or changing cave shapes and ore distributions.

## Acceptance and checks

- Pure tests: same-seed determinism, seed/coordinate variation, bounded table height,
  negative coordinates and terrain-cover clamp.
- Forced-open cave integration: water below and at the table; dry air above it but below
  sea level; carving on both sides of y=0; actual bottom rows protected; density voids obey
  the same rule; surface ocean/river/lake water and roofs intact.
- Real seeded integration: dry and wet cave cells both exist below sea level; reverse-order
  neighbouring chunks reproduce exactly, including a table crossing a vertical chunk seam.
- Browser smoke: regenerate a deterministic underground fixture through the public generator,
  verify wet/dry cave cells, and restore the player's earlier position after inspection.
- `npm run check`, both isolated worker budget guards, GPU rendering regressions and full
  gameplay smoke pass sequentially. Update the old fixed-depth smoke assertion to inspect
  several underground cells: rock must remain, while air/water are now legal cave states.

## Compatibility

Unedited terrain regenerates with new subterranean caves and water. Saved block edits remain;
no save deletion or version bump. Record this player-visible generation change in README.md.
