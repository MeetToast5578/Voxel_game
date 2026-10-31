# Spec 5: Cubic chunks, part 1: data model

**Built by:** Claude.
**Depends on:** spec 4 (16-bit states).

Specs 5, 6 and 7 can share one branch if splitting them would leave `main` broken. Each spec's tests must still exist and pass.

## Goal

The world is made of 16×16×16 chunks addressed by `(cx, cy, cz)`, with no height limit and no depth limit. Each column (all chunks sharing `cx, cz`) knows the highest sky-blocking block of each of its 256 cells. Sky light (spec 6) and streaming (spec 7) depend on these **column tops**.

## Current behaviour

- A chunk is a 16×128×16 column.
- `WORLD_HEIGHT` caps the world, and `World.getBlock` returns BEDROCK below y = 0.
- Edits are keyed by `cx,cz`, with a local index over the whole column.
- `surfaceY` scans down from `WORLD_HEIGHT`.
- `placementTarget` rejects y outside 0..127.

## Requirements

### Config and coordinates

1. Remove `WORLD_HEIGHT` from config. `CHUNK_VOLUME` becomes 16³ = 4,096.
2. Coordinates (`src/core/coords.ts`):
   - `chunkKey(cx, cy, cz)` gives `"cx,cy,cz"`.
   - New `columnKey(cx, cz)` gives `"cx,cz"`.
   - `localIndex(lx, ly, lz)` keeps the same layout: x fastest, then z, then y, with all three in 0..15.
   - `inChunkBounds` checks all three axes in 0..15.
   - Every y conversion uses the existing `worldToChunk` / `worldToLocal`, which already handle negative numbers.

### Chunk and world

3. `Chunk` has `cx, cy, cz` and a `Uint16Array` of 4,096 blocks.
4. **Sky-blocking.** Every block type has a derived flag `blocksSky`. It is true for everything except AIR and GLASS, which matches today's sky light rule exactly.
5. `World`:
   - **Chunk map** keyed by `chunkKey`.
   - **Column tops**, keyed by `columnKey`. Each is an `Int32Array` of 256 values indexed `lz * 16 + lx`, holding the world y of the highest sky-blocking block in that cell.
   - **`getBlock`.** Returns AIR for unloaded chunks at any y. There's no special case below 0 any more.
   - **`isLoadedAt(x, y, z)`** is now 3D.
   - **`setBlock`** returns false when the chunk isn't loaded or the column has no tops yet. Otherwise it sets the block, records the edit under the 3D chunk key (local index 0..4095), and updates the column top for that cell:
     - Placing a sky-blocking block above the top raises the top to that y.
     - Removing the top block, or replacing it with a non-blocking one, scans downward to the next sky-blocking block.
       - The scan reads loaded chunks first.
       - For chunks that aren't loaded, it asks the world's synchronous fallback (given to the `World` constructor) to generate that chunk, with its saved edits applied.
       - Fallback chunks are not added to the world.
     - Any other change leaves the top alone.
   - **Installing a column's tops** (from the generator) applies every saved edit in that column, so the result always equals what a full scan of generated-plus-edited blocks would give. Keep an index from column key to that column's edited chunk keys, so this is not a scan over all edits.
   - A query for a column's tops returns `undefined` until they are installed.
   - Removing a column's tops is allowed only when none of its chunks are loaded.

### Generator: interim adapter (`src/world/generator.ts`)

The phase 1 world is today's terrain, unchanged in blocks, extended to infinite depth. Phase 2 replaces it.

6. Keep today's height, cave and tree logic as a **legacy column**: a pure function that produces the old 16×128×16 column for y 0..127, with these changes:
   - y = 0 is STONE, not bedrock. BEDROCK stays a block type but is no longer generated.
   - The old `WORLD_HEIGHT` is replaced by a local constant (128), private to the generator.
7. **Generating a chunk** at `(cx, cy, cz)`:
   - `cy < 0`: all STONE.
   - y range above 127: all AIR.
   - `cy` 0..7: exactly the matching 16-block slice of the legacy column.

   Trees and caves must therefore be identical to today. Shortcuts that skip work (for example, stopping early above the column's highest block) are welcome, provided the output is identical.
8. **Computing a column's tops** gives the exact tops of the generated terrain. The simplest acceptable approach is to build the legacy column once and scan it.
9. `getHeight` stays, because spawn uses it.

### Callers

10. **Spawn.**
    - `findSpawnColumn` is unchanged.
    - `surfaceY` starts its downward scan from the column top instead of `WORLD_HEIGHT`. It takes the top as an argument and stays pure.
11. **`placementTarget`** has no y bounds.
12. **Save.**
    - Edits are now saved under 3D chunk keys.
    - Bump `SAVE_VERSION` to 2, and change `SAVE_KEY` to `voxel-game-save-v2`, so the v1 save is neither loaded nor overwritten (decision B).
    - This localStorage format is temporary; spec 8 replaces it.

## Out of scope

- Lighting and meshing in 3D (spec 6)
- Streaming and workers (spec 7)
- New terrain (phase 2)
- IndexedDB (spec 8)

Until spec 7 lands, the game may not run. That's why specs 5–7 may share a branch.

## Acceptance criteria

- `npm run check` passes. `npm run smoke` passes once spec 7 is in.
- Every existing test that encoded the old column layout is ported to the cubic layout with the same intent:
  - `coords`, `world`, `generator`, `caves`, `trees`, `spawn`, `interaction`, `config`, `save`

  The pull request lists what changed in each.

## Test cases

1. **Coordinates.**
   - `chunkKey(-1, -2, 3)` is `"-1,-2,3"`.
   - World y −1 is in chunk −1 at local 15.
   - `localIndex` covers 0..4095 exactly once.
   - `inChunkBounds` rejects 16 and −1 on every axis.
2. **Deep and high blocks.**
   - With chunks loaded at y −40 and y +300 (and column tops installed), `setBlock` then `getBlock` round-trips at both.
   - `getBlock` in an unloaded chunk is AIR.
   - `setBlock` there returns false.
3. **Edits survive reload.** An edit at y −40 is re-applied when its chunk is created again from the generator.
4. **Generator slices.**
   - For seed 42 and 4 columns, chunks `cy` 0..7 stacked equal the legacy column byte for byte.
   - `cy = −3` is all STONE.
   - `cy = 9` is all AIR.
5. **Exact column tops.**
   - For seed 42, over a 4×4 area of columns that includes a tree, open water and a beach, the generated tops equal a brute-force scan of the stacked generated chunks.
   - Water counts as sky-blocking; GLASS and AIR don't.
6. **Top updates.**
   - Placing stone 50 blocks above the top raises it.
   - Placing glass there leaves it unchanged.
   - Removing the top block of a cell lowers the top to the next blocker.
   - When the next blocker is in an unloaded chunk, the fallback is used, and the world's chunk count does not change.
7. **Tops include saved edits.**
   - Installing generated tops for a column with an edit "stone at y = 300" gives 300 for that cell.
   - An edit that removed the generated top block gives the next block below.
8. **Trees and caves unchanged.** The ported `trees.test.ts` and `caves.test.ts` assert the same properties as today on stacked chunks.
