# Spec 20: Geology slice 2 (limestone, slate, basalt, deepslate)

**Built by:** Claude. Second slice of Phase 2 item 5 in `docs/ROADMAP.md`. Follows spec 15 (strata and bare rock).

## Goal

The strata gain three more rocks, so a mountain face shows more kinds of stone, and deep underground the stone turns to
deepslate. The player can see the change: pale limestone and dark slate and basalt in the layers, and a dark deepslate
floor far below the surface.

## Requirements

1. **Block types.** Four new block types, appended after `dandelion` in the registry in `src/world/blocks.ts`, so the
   state numbers are fixed by order: `limestone` (22), `slate` (23), `basalt` (24), `deepslate` (25). Each has a stable
   lowercase key, so saves store names. Each has its own atlas tile, `Tile.LIMESTONE` (23), `Tile.SLATE` (24),
   `Tile.BASALT` (25) and `Tile.DEEPSLATE` (26), painted procedurally in `src/render/atlasPixels.ts`:
   - limestone: pale cream, with faint horizontal bedding lines;
   - slate: dark blue-grey, with horizontal cleavage lines;
   - basalt: near-black, with fine noise;
   - deepslate: dark grey, with diagonal grain.
2. **Strata.** The strata rock list grows from four rocks to seven, in this order: granite, diorite, andesite,
   sandstone, limestone, slate, basalt. A solid block below the soil takes the rock of its layer exactly as in spec 15,
   and the layer index wraps around the length of the list (not a fixed 4). `GEOLOGY_LAYER_M` and `GEOLOGY_WARP_M` are
   unchanged.
3. **Deepslate.** A solid block whose height is below `DEEPSLATE_DEPTH_M` = −100 m takes deepslate instead of its strata
   rock. This is a depth rule, so it applies to every column. Above −100 m the strata rules hold, and deepslate does not
   appear there. `DEEPSLATE_DEPTH_M` is added to `src/config.ts`, in meters.
4. **Soil and bare rock.** Unchanged. The soil layers of spec 14 and 15 keep their rules, and the bare-rock amplitude
   stays `BARE_ROCK_AMP_M` = 12 m. Only the rock below the soil changes.
5. **Unchanged.** Caves, water, sea level, the terrain band, plants, trees, the warp noise (seed + 300, sampled once per
   column), the density of spec 14, and the `legacyColumn` reference. Below `TERRAIN_CHUNK_BOTTOM` the terrain is still
   plain stone, as spec 13 says. No new noise field is added, so the cold column cost does not change.
6. **Saves.** The new states are appended, so existing save records still load. Worlds generated after this change have
   different rock under the surface than before, because the strata list is longer. Chunks already saved as edits keep
   the rock they were saved with.

## Out of scope

- Ores, gravel, clay, aquifers, and deepslate ores (later slices of item 5 and item 3's rivers).
- Caves that show limestone or basalt walls, and cave floors of other rock.
- A deepslate transition that follows noise instead of a hard depth. A hard depth is enough for this slice.
- Biome-based surface blocks (phase 3).

## Acceptance criteria

- `npm run check` passes. The state-count and id tests are extended with the four new names, keeping their intent.
- `npm run smoke` passes with no console error, now that the favicon is fixed (see `docs/HANDOFF.md`).
- In the game, a mountain face shows pale limestone, dark slate and basalt in its layers, and the deep ground is dark
  deepslate.
- The README and HANDOFF list the new rocks and the deepslate depth.

## Test cases

1. Each new key round-trips through `blockStateName` and `getBlockDef`, `BLOCK_STATE_COUNT` is 26, and each new id matches
   its `BlockId` name (`tests/blocks.test.ts`).
2. In the seed-1 mountain column, between sea level and −100 m above the soil, the solid rock includes limestone, slate
   and basalt, along with the older rocks, so the seven strata are all used (`tests/generator.test.ts`).
3. In a chunk entirely below −100 m and below the soil of the seed-1 mountain column, every solid block is deepslate. No
   other rock appears there (`tests/generator.test.ts`).
4. In the same column, no deepslate appears above −100 m.
5. The existing tests still hold, with the rock set extended: determinism, the stacked chunks equal the legacy column,
   bare rock on mountains, grass on the plains, and no trees on bare columns.
6. `ROCK_IDS` in the generator tests includes the four new rocks, so the layer tests accept them.
