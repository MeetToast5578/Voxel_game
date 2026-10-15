# Spec 15: Geology (strata and slope soil)

**Built by:** Claude. First slice of Phase 2 item 5 in `docs/ROADMAP.md`. Follows spec 14 (density terrain).

## Goal

Underground and on the slopes, the rock stops being one stone. Layers of granite, diorite, andesite and sandstone run
through the land, and steep ground has bare rock where grass and soil would be on flat ground. The player can see the
rock change: a cliff face shows layers, and the mountain tops are bare.

## Requirements

1. **Rock types.** Four new block types, appended to the registry in `src/world/blocks.ts` (state numbers are fixed by
   order): `granite`, `diorite`, `andesite`, `sandstone`. Each has a stable lowercase key, so saves store names. Each
   has its own atlas tile, drawn procedurally in `src/render/atlasPixels.ts`.
2. **Strata.** A solid block below the surface, which is not soil, takes its rock from the layer it is in:
   `layer = floor(yM / GEOLOGY_LAYER_M + 3 × warp)`, where `yM` is the block height in meters, and `warp` is a 2D
   simplex noise of `(xM / GEOLOGY_WARP_M, zM / GEOLOGY_WARP_M)` in [−1, 1]. The rock is `ROCKS[layer mod 4]`, with
   `ROCKS = [granite, diorite, andesite, sandstone]`. `GEOLOGY_LAYER_M` = 12 m and `GEOLOGY_WARP_M` = 400 m, in
   `src/config.ts`.
3. **Warp noise.** `warp` is one more `createNoise2D` seeded from `seed + 300`. It is sampled once per column and cached
   with the column (no per-block cost).
4. **Slope soil.** Steepness is the column's detail amplitude (spec 14), which is high on rugged land. A column is
   **bare** where its amplitude is at least `BARE_ROCK_AMP_M` = 12 m. Bare columns have no soil: the surface block is
   rock, not grass, and no dirt lies under it. Other columns keep the spec 14 layers (grass or sand on top, dirt for
   `SOIL_DEPTH` below, then rock).
5. **Beaches.** Beach columns keep sand on top and sand for `SOIL_DEPTH` below, as before. Their deeper blocks become
   rock.
6. **Trees.** Trees grow only on soil columns (not bare, not beach), so no tree stands on bare rock.
7. **Unchanged.** Caves, water, sea level, the band, the chunk rules of spec 13, the density of spec 14, and the
   `legacyColumn` reference. Below `TERRAIN_CHUNK_BOTTOM` the terrain is still plain stone, as spec 13 says.

## Out of scope

- Ores, deepslate, limestone, slate, basalt, gravel and clay (later slices of item 5).
- Exact slope from finite differences. The amplitude is a proxy: flat-but-lumpy ground can be bare, and this is noted in
  code as a shortcut.
- Biome-based surface blocks (phase 3).

## Acceptance criteria

- `npm run check` passes. The state-count and id tests are extended with the four new names, keeping their intent.
- `npm run smoke` passes except the favicon 404 (see `docs/HANDOFF.md`).
- In the game, a mountain face shows the rock layers, and a mountain top is bare rock. The plains keep their grass.
- Cold surface column cost stays about 8 ms median (the proxy adds no field evaluations).

## Test cases

1. Each new key round-trips through `blockStateName` and `getBlockDef`, and `BLOCK_STATE_COUNT` is 18.
2. Rock layers are deterministic: two generators with the same seed give identical chunks.
3. A column's solid blocks below the soil include at least three different rock types within 100 blocks of depth.
4. Among sampled columns, some bare columns have a non-grass surface, and flat land has grass surfaces.
5. No tree sits on a bare column (checked where trees exist in the sampled area).
6. Stacked chunks still equal the legacy column, and the existing layer test accepts any rock below the soil.
