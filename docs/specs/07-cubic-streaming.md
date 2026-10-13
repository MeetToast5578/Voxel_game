# Spec 7: Cubic chunks, part 3: streaming, workers and rendering

**Built by:** Claude.
**Depends on:** specs 5 and 6. After this spec the game runs again, with no height limit.

## Goal

Chunks load around the player in 3D. The terrain surface is always loaded out to the full horizontal render distance, so from a valley floor you still see the mountains around you, and from a mountaintop you see the land below. Deep underground and high in the sky, only the chunks near the player are loaded.

## Current behaviour

`ChunkManager`:
- generates columns within `renderDistance + 2`
- meshes those within `renderDistance` once all 8 neighbours exist
- unloads beyond `renderDistance + 3`
- with workers, keeps at most 8 jobs in flight, and drops stale results with per-chunk version counters

## Requirements

### Config

1. Add:
   - `VERTICAL_RENDER_DISTANCE = 4`: chunks above and below the player's chunk.
   - `SURFACE_BAND = 1`: extra chunks below each column's lowest top.
   - `MAX_JOBS_IN_FLIGHT = 16`: moved here from `chunkManager.ts`.

   Render distance (horizontal) stays a setting.

### Load sets (`src/world/chunkManager.ts`)

2. With the player in chunk `(px, py, pz)`, R the render distance and V the vertical render distance:
   - **Column set.** Columns within horizontal distance R + 2 (a circle in chunk units, as today). Their column tops are requested first.
   - **Mesh set.** The union of two sets:
     - the **near cylinder**: horizontal distance ≤ R and |cy − py| ≤ V
     - the **surface band**: for each column within R whose tops are known, every chunk from the one holding its lowest top minus `SURFACE_BAND`, up to the one holding its highest top
   - **Generate set.** The mesh set, grown by 1 chunk in all three directions, so that every meshed chunk has its 26 neighbours.
3. **Order.**
   - Within each set, nearest first, by 3D distance in blocks from the player's eye to the chunk centre.
   - Tops come before chunks of the same column.
   - Recompute the sets when the player changes chunk (in any axis) or when the render distance changes, as today.
4. **Meshing a chunk** requires the chunk, its 26 neighbours and the 9 column tops around it.
5. **Unloading**, with hysteresis as today:
   - A mesh is removed when its chunk is more than R + 1 away horizontally, or more than V + 1 away vertically and outside the surface band.
   - A chunk's blocks are dropped at R + 3 / V + 3, with the same surface-band exception.
   - Column tops are dropped when no chunk of that column is loaded and the column is outside R + 3.

### Jobs and workers

6. `ChunkJobs` has three jobs:
   - compute a column's tops
   - generate one chunk
   - mesh one chunk (27 arrays + 9 tops, from spec 6)

   The worker pool and worker implement all three. Results for chunks or columns that are no longer wanted are dropped, as today.
7. **Main-thread mode** (`?workers=0`) runs the same three jobs inline, within the per-frame budgets, with the same ordering.
8. **Version counters** move to 3D chunk keys. A mesh result is dropped if its chunk's version changed, or if the chunk left the mesh set.

### Edits

9. `onBlockChanged(x, y, z)`:
   - Immediately remesh every loaded, meshed chunk whose padded volume contains the block. That's the chunk itself, plus up to 7 neighbours when the block is on a face, edge or corner of its chunk.
   - Mark the other chunks of the 3×3×3 neighbourhood dirty.
   - When the edit changed a column top from `a` to `b`: also mark dirty every meshed chunk in the 3×3 columns around it whose y range intersects `[min(a, b) − 15, max(a, b) + 1]`. Sky light below the old or new top changed.

### Rendering and game

10. **`ChunkMeshes` and `MeshSink`** take `(cx, cy, cz)`. Meshes are placed at `(cx·16, cy·16, cz·16)`.
11. **Renderer.**
    - The camera far plane covers the horizontal view distance plus the surface band height visible from the player. Use the largest top-to-player height difference among loaded columns, capped at 2,000 blocks.
    - Fog stays horizontal-distance-based as today.
12. **Spawn and readiness.**
    - The game waits for the spawn column's tops.
    - It puts the feet at `surfaceY`.
    - It waits until the 3×3×3 chunks around the feet chunk are meshed (3D `isAreaMeshed`).
    - Then it places the player.
    - A saved player position is used as today, waiting on the 3×3×3 around it.
13. **Physics safety.** As today, unloaded chunks count as solid for the player (now 3D), so the player can never fall into an unloaded chunk.
14. **Stats and F3.** Stats add the loaded column count and jobs in flight. F3 shows the player's chunk as `cx, cy, cz`.

### Smoke test (`scripts/smoke.mjs`)

15. Add a check called **"deep and high chunks"**:
    - Fly the player to y = −200, wait until ready-meshed there (via the stats), and confirm `getBlock` 5 blocks below the feet is STONE.
    - Then teleport to y = +300 above the spawn column, `setBlock` a glass block next to the player, and confirm it reads back.
    - Restore the original position.

## Out of scope

- Horizon LOD (phase 2)
- Cave culling and batching (phase 8)
- A vertical-distance setting in the menu

## Acceptance criteria

- `npm run check` and `npm run smoke` pass, including the new check.
- The ported `chunkManager.test.ts` and `chunkJobs.test.ts` keep their intent: ordering, budgets, stale-result dropping and unloading. The pull request lists the changes.
- **Performance, reported in the pull request (measured, not estimated).** With default settings:
  - time from Play to ready
  - loaded and meshed chunk counts at spawn
  - FPS in the headless smoke test and on the owner's machine, if available
- Manual check with `npm run dev`:
  - Dig a shaft 100 blocks down: chunks keep appearing below, and the sky still shows above the shaft.
  - From a valley, the surrounding hills are visible to the full render distance.

## Test cases (`tests/chunkManager.test.ts`, `tests/chunkJobs.test.ts`)

Use a fake generator whose column tops are given per column.

1. **Surface band.**
   - The player is at cy = 0, and a column at horizontal distance R − 1 has tops between y 200 and 230.
   - That column's chunks covering y 176..239 (cy 11..14) are in the mesh set.
   - Its chunks at cy 6..9 are not.
2. **Near cylinder.** With flat tops at y = 0 and the player at cy = −20, chunks cy −24..−16 at the player's column are meshed. The surface chunks (cy −1..0) of columns within R are also meshed.
3. **Neighbours required.** A chunk isn't meshed while any of its 26 neighbours or 9 column tops is missing.
4. **Order.** With an unlimited budget, the first chunk meshed is the player's own chunk, and meshing proceeds by non-decreasing distance.
5. **Unloading.**
   - Moving the player 40 chunks down removes the old near-cylinder meshes that aren't in the surface band.
   - It keeps surface-band meshes within R.
6. **Stale results.** A mesh result that arrives after an edit to its chunk is dropped. So is one that arrives after the player has moved far away.
7. **Top-change dirtiness.**
   - Placing a block 20 above a column top marks dirty the meshed chunks of that column and its 8 neighbours whose y range touches `[top − 15, top + 21]`.
   - It doesn't mark chunks far below.
