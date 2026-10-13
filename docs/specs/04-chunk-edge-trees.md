# Spec 4: Trees at chunk borders

## Goal

Trees can grow anywhere, including within 2 blocks of a chunk border, and their canopies continue seamlessly into the neighbouring chunk. This removes the grid of tree-free lanes visible from above.

## Current behaviour

`TerrainGenerator.placeTrees` (`src/world/generator.ts`) only considers trunk positions at local x/z 2–13. Each chunk is generated alone, and a canopy reaches 2 blocks from its trunk, so a tree any closer to the border would be cut off. `tests/trees.test.ts` asserts this limit.

## Requirements

1. **Same tree decision as today.** Whether a tree grows depends only on the seed and world x/z:
   - The column is a candidate if `hash2(seed, wx, wz) < TREE_CHANCE`.
   - The trunk height comes from `hash2(seed + 7, wx, wz)`, as today.
   - The canopy shape is the same as today:
     - rows top−2 and top−1: radius 2 without the four corners
     - row top: radius 1
     - row top+1: a plus shape
2. **Grass-only rule, decided without the neighbour chunk.** A candidate grows a tree only if its surface block would be grass. That means:
   - The column is not a beach (`getHeight > SEA_LEVEL + 1`).
   - The cave carver does not carve the surface block at (wx, h, wz).

   Move the per-block "is this carved?" test into a pure helper that `carveCaves` and tree placement both use. Cave carving results must not change. For columns inside the chunk, the new rule gives the same answer as today's check, which reads the block after carving.
3. **Margin.** When generating chunk (cx, cz), consider every candidate trunk whose world x is in [cx·16 − r, cx·16 + 15 + r], and likewise for z. Here r is the canopy radius (2), defined as a named constant, not a magic number. Write only the blocks of those trees that fall inside this chunk.
4. **Placement rules stay as they are:**
   - Logs overwrite anything.
   - Leaves only replace AIR.
   - The trunk's base block becomes DIRT.

   With these rules the result doesn't depend on the order trees are processed in: LOG always wins over LEAVES, and leaves never land on terrain. So:
   - Chunks generated in any order, on a worker or on the main thread, come out identical.
   - Neighbouring chunks agree on every tree they share.

   The generator must stay stateless. Don't cache anything between calls.
5. **Nothing else changes.** Terrain, caves, water and the height map stay the same. Trees that already grow at local 2–13 keep their position and shape. The only exception is where a new border tree's trunk passes through an old tree's leaves.
6. **Performance.** Hash all (16 + 2r)² columns, but call `getHeight` and the cave test only for the ~1.2% of columns that pass the hash check. Generation time per chunk must not noticeably increase.
7. **Compatibility (say so in the pull request description).** Saves only store edits, so existing worlds gain new trees in the former empty lanes, including areas already explored. Player edits still win over generated blocks. This is accepted.

## Out of scope

- New tree types
- Biomes
- Changing tree density or shape
- Structures larger than 2 blocks past a border

## Acceptance criteria

- All test cases below pass.
- The existing tests in `caves.test.ts`, `generator.test.ts`, `chunkJobs.test.ts` and `world.test.ts` pass unchanged.
- `npm run smoke` passes. Its screenshots may differ, because seed 1 can gain border trees.
- Manual check with `npm run dev`: fly up (F) and look down. There are no straight tree-free lanes, and trees crossing chunk borders look whole.

## Test cases

### Shared helper

Generate a rectangle of chunks with one generator and provide a world-level `getBlock(x, y, z)` over it.

A **trunk base** is a LOG whose block below is DIRT. Its trunk height is the number of consecutive LOGs from there upward.

### Changes to `tests/trees.test.ts`

1. **Remove the old limit.** Delete the "trunks stay 2+ blocks from chunk edges" assertion. Keep "every log stands on dirt or another log", but check it with the world-level lookup so it works across borders.
2. **Leaves above every trunk.** Extend the existing check to all local columns, 0–15, not just 2–13.

### New cases

3. **Trees near borders exist.** Across 200 chunks with seed 42 (any layout), at least one trunk base sits at local x or z in {0, 1, 14, 15}.
4. **Seamless canopies.**
   - Generate a 6×6 rectangle of chunks.
   - Take every trunk base at least 3 blocks inside the rectangle's outer edge.
   - No position of its expected canopy shape (from requirement 1) may be AIR. It will usually be LEAVES, but LOG or hillside terrain is fine. AIR there means the canopy was cut at a chunk border.
5. **No floating logs.** Over the same 6×6 rectangle, every LOG has LOG or DIRT directly below it.
6. **Order doesn't matter.** Generate chunk (5, 5) two ways:
   - with a fresh generator, as the only chunk
   - with another fresh generator, after first generating its 8 neighbours

   The two block arrays are byte-for-byte equal.
7. **Only on grass columns.** For every trunk base found in cases 3 and 4, let h be the y of the DIRT block under it:
   - `getHeight` of that column equals h.
   - h > `SEA_LEVEL + 1`.
8. **Caves unchanged.** `tests/caves.test.ts` passes without edits.
