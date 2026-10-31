# Spec 11: Debug map (`?map=1`)

**Built by:** Claude. First item of Phase 2 (terrain) in `docs/ROADMAP.md`.
**Depends on:** spec 10 (0.3 m blocks).

## Goal

A top-down picture of the generator, so terrain can be tuned without walking around. The map shows the height of
every column and the sea. It is the main tool for the rest of Phase 2 (rivers, biomes and seams will be added to it).

## Requirements

1. `?map=1` shows the map instead of the game. Nothing else starts (no world, no save).
2. The map covers a 512 × 512 block square centred on the origin, one pixel per block. Seed comes from `?seed=`,
   otherwise `DEFAULT_SEED`.
3. Colour, from the column's surface height:
   - below sea level: blue, darker with depth (sea level is `SEA_LEVEL`);
   - above sea level: green at sea level, through brown, to white at `TERRAIN_MAX_BLOCKS`.
4. The colouring is a pure function in `src/world/debugMap.ts`, tested in Node. The page only draws its result.
5. The map is for tuning only: it is not saved, and it is not part of the game's behaviour.

## Out of scope

- Rivers, biomes, moisture and region seams: added to the map as those features land.
- Zoom and pan.

## Acceptance criteria

- `npm run check` passes, including the new test.
- Opening `/?map=1&seed=42` shows a map with sea and land.

## Test cases

1. `mapPixels` returns `size × size × 4` bytes, all alpha 255.
2. A column below `SEA_LEVEL` is blue (blue channel above red and green).
3. A column at the highest terrain is whiter than one at sea level.
4. The same seed and area give the same bytes.
