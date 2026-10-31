# Spec 14: Minecraft-style density terrain

**Built by:** Claude. Follows spec 13 (terrain from the climate and shape fields). Changes how the surface is chosen.

## Goal

The surface is no longer the whole-block rounding of one height. Each block is solid or air from a 3D density, as in
Minecraft's overworld. The surface is where the density crosses zero, so it is lumpy, can overhang, and has no
long terraces of 0.3 m stairs on gentle slopes. The shape fields (spec 12) still set the large-scale land, sea and
mountains.

## Requirements

1. **Density.** A block at height y (meters) is solid where `offset − y + amp × noise > 0`:
   - `offset` is `heightMeters(fields)` from spec 12, the surface offset of the column.
   - `amp` is `detailAmpMeters(fields)`, between 3 m on flat land and 22 m on rugged land. Ocean floors get the flat 3 m.
   - `noise` is 3D simplex noise in [−1, 1], two octaves, with horizontal feature size 16 m and vertical feature size
     10 m. Its seed is the world seed plus 200.
   - A sample with `d = offset − y` above `amp` is solid, and one below `−amp` is air, without evaluating the noise.
2. **Surface.** `getHeight(wx, wz)` is the highest solid block of the column, found by scanning down from above
   `offset + amp`. Water and trees are not counted. The scan always stops at a block that is solid.
3. **Layers.** A solid block at the surface is grass, or sand on beaches. A solid block within `SOIL_DEPTH` of the
   surface is dirt, or sand on beaches. Other solid blocks are stone. An air block at or below sea level is water.
4. **Unchanged.** Caves (spec 5), the beach band, shore bands, trees (spec 9), sea level (`SEA_LEVEL_M` = 0), the band
   of −400 m to +2,600 m and the chunk rules of spec 13 keep their meaning. The `legacyColumn` reference still holds.
5. **Ceiling.** The highest surface can now be about 20 m above the spline cap. `TERRAIN_MAX_M` is 2,475 m.
6. **Cache.** The per-column fields, offsets, amplitudes and surface are cached per column, as the old heights were.

## Out of scope

- Biomes, rivers, aquifers, ore and surface rules by biome (phase 2 and later).
- Changing the shape fields or the spline.
- Further tuning of the look beyond the amplitudes above. Plains still show some stepped ground in places.

## Acceptance criteria

- `npm run check` passes.
- `npm run smoke` passes except the favicon 404 (see `docs/HANDOFF.md`).
- In the game, the mountains show stone faces and overhangs. The plains show far fewer long stepped bands than before, though some remain.
- Measured here (Node, seed 1): a cold surface chunk, which builds its column, takes about 8.4 ms median. A chunk of an
  already-built column takes about 0.6 ms. ROADMAP's 3 ms target is met per chunk but not for a cold column.

## Test cases

1. Every surface is the highest solid block, and nothing above it is solid (covered by the column tops test).
2. Some mountain columns overhang: air below solid stone, in the sampled area near (1480, −3040) for seed 1.
3. The cave fraction stays between 0.5% and 8% over 40 sampled land columns (the sample grew from 12 to 40, because 12
   columns gave 0.36% through sampling noise while 40 gave 1.8%).
