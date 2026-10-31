# Spec 13: Terrain from the climate and shape fields

**Built by:** Claude. Third item of Phase 2 (terrain) in `docs/ROADMAP.md`. Switches the generator to spec 12.
**Depends on:** spec 12 (`src/world/shape.ts`).

## Goal

The terrain comes from the climate and shape fields: oceans, coasts, plains, hills and mountains up to about 2,450 m.
Sea level is y = 0 m, as the roadmap says. The phase 1 height noise is removed.

## Requirements

1. **Sea level.** `SEA_LEVEL_M` = 0. Water fills every column up to sea level.
2. **Terrain band.** Surfaces are in [−300, 2450] m (`shape.ts`). The generator covers y from −400 m to +2600 m, chunk
   aligned: chunks below `TERRAIN_CHUNK_BOTTOM` are solid stone, chunks at or above `LEGACY_CHUNKS` are air.
   Below the surface, a column is stone; above it, the top layer is grass (or sand on beaches and in shallow water).
3. **Heights.** `getHeight(wx, wz)` is `floor(metersToBlocks(heightMeters(fields)))`, with the fields sampled at
   `wx × BLOCK_SIZE_M` and `wz × BLOCK_SIZE_M`, clamped to the band.
4. **Removed.** The phase 1 height noise (`base`, `hills`, `mountain` and their amplitudes and wavelengths) and the
   y = 0 stone rule. Caves, trees, beaches, soil depth and the shore bands keep their meanings.
5. **Column tops without a full column.** `columnTops` scans chunks from the top down, starting above the highest
   surface plus tree reach, and stops at the first sky-blocking block. The game never builds a whole column.
   `legacyColumn` (the full column array) is kept for tests that check chunk slices.
6. **Chunk slices.** Chunks from `TERRAIN_CHUNK_BOTTOM` to `LEGACY_CHUNKS − 1` are generated from the same rules, so any
   chunk equals the matching slice of its column (spec 5).

## Out of scope

- Biomes (temperature and humidity are sampled but not used), rivers, geology, caves below y = 2, coasts beyond
  the beach band (phase 2 items 3–7).
- Horizon LOD (phase 2 item 8).

## Acceptance criteria

- `npm run check` passes. Every test that encoded the old 0.3 m column is ported with the same intent.
- `npm run smoke` passes except the favicon 404 (see `docs/HANDOFF.md`).
- `?map=1` shows oceans, coasts and mountains.

## Test cases

1. Stacked chunks 0..LEGACY_CHUNKS−1 equal the legacy column; chunk cy = LEGACY_CHUNKS is all air; chunk cy below
   `TERRAIN_CHUNK_BOTTOM` is all stone.
2. Column tops from the chunk scan equal a brute-force scan of the stacked column, for columns with trees, water and beach.
3. Every height is in the band and is the floor of the shape height in blocks.
4. Ocean columns have water up to y = 0 and a sky-blocking top at 0.
