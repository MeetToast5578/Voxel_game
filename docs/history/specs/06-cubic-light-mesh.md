# Spec 6: Cubic chunks, part 2: light and mesher

**Built by:** Claude.
**Depends on:** spec 5.

## Goal

Lighting and meshing work on 16³ chunks and are exact across chunk borders in all three directions, including vertically. Sky light is seeded from column tops, so it's correct even when the chunks above aren't loaded.

## Current behaviour

- `light.ts` builds a 48×128×48 region from 9 column chunks. Sky light falls from `WORLD_HEIGHT` down to the first block that isn't AIR or GLASS, then floods.
- `mesher.ts` builds an 18×130×18 padded volume with a bedrock floor at y = −1, and treats faces outside the world as fully sky-lit.

## Requirements

### Light (`src/world/light.ts`, pure)

1. **Region.**
   - A light region is the 3×3×3 chunks around the chunk being meshed: 48×48×48 cells.
   - Neighbour arrays are indexed `(dy+1)*9 + (dz+1)*3 + (dx+1)`; the centre is index 13.
   - Region y = 0 is world y `(cy − 1) * 16`.
2. **Sky light** takes the region and the 3×3 column tops around it (9 arrays of 256, indexed like the neighbours in x and z).
   - A cell is in direct sunlight (15) when its world y is above its column's top.
   - If a column's top is below the region, the whole column is sunlit. If it's above the region, no cell in it is directly sunlit.
   - Seeding and flooding work as today: seed only sunlit cells next to a darker column, plus each column's lowest sunlit cell, then flood with −1 per step through non-opaque cells.
   - The flood is bounded by the region on all six sides.
3. **Block light:** as today, in 3D.
4. **Exactness argument (keep it in a comment).** Light reaches at most 14 blocks, so every cell of the centre chunk and its 1-block border receives the same light it would from an infinite world. The centre chunk sits 16 cells from every region face.

### Mesher (`src/render/mesher.ts`, pure)

5. **Input.** The mesher takes the 27 neighbour arrays and the 9 column-top arrays, and builds an 18×18×18 padded volume. There's no bedrock floor and no "outside the world" case: every face reads its light from the region.
6. **Quick exits** (both must give exactly the same result as full meshing):
   - The centre chunk is all AIR: return empty meshes without computing light.
   - The centre chunk is all opaque, and every neighbour cell touching it is opaque: return empty meshes without computing light.
7. Positions stay relative to the chunk origin. Faces, AO, the AO diagonal flip, layers and the `aLight` attribute work exactly as today.

### Worker protocol (`src/workers/protocol.ts`, `chunkWorker.ts`, `workerPool.ts`)

8. The mesh request carries the 27 block arrays and the 9 column-top arrays, all transferred, not copied. The interface the chunk manager calls (`ChunkJobs.mesh`) changes to match. Spec 7 wires it up.

## Out of scope

- Smooth lighting (phase 4)
- Cave culling and draw-call batching (phase 8)
- Streaming (spec 7)

## Acceptance criteria

- `npm run check` passes.
- `light.test.ts`, `litMesher.test.ts`, `relight.test.ts` and `mesher.test.ts` are ported to 27 neighbours with the same intent. The pull request lists what changed.
- **Performance.** Measure the average mesh time of 50 surface chunks of seed 42 in Node and report it in the pull request. Target: ≤ 3 ms. If it's slower, say so; don't weaken the tests.

## Test cases

1. **No faces between stacked chunks.** Stone fills the top layer of chunk (0, 0, 0) and the bottom layer of chunk (0, 1, 0). Neither mesh has a face on the shared plane.
2. **Faces at a vertical border.** Stone in chunk (0, 0, 0)'s top layer with air above in (0, 1, 0) gives top faces. Their AO reads blocks from the chunk above: a stone block above-diagonal darkens the right vertices, exactly as within one chunk.
3. **Column top below the region.** Tops of −1000 everywhere and an all-air region: every cell's sky light is 15.
4. **Column top above the region.** Tops of +1000 everywhere and an all-air region: every cell's sky light is 0. There's no sunlight anywhere, and nothing to flood from.
5. **Shaft.** Tops of +1000 everywhere except one cell whose top is −1000.
   - That cell's column is 15.
   - Its horizontal neighbours at the same y are 14.
   - The light drops by 1 per block of horizontal distance.
6. **Light crosses a vertical chunk border.** Glowstone in chunk (0, −1, 0) at local y 15. The cell directly above it, in the centre chunk at local y 0, has block light 14.
7. **Overhang.** A sky-blocking block in the chunk above shades the cells below it. Their sky light comes from the side flood (≤ 14), not 15.
8. **Quick exits are exact.**
   - An all-air centre chunk gives empty meshes.
   - An all-stone centre chunk surrounded by stone gives empty meshes.
   - An all-stone centre chunk with one air neighbour cell gives exactly the one face that full meshing gives.
9. **Edits relight.** `relight.test.ts`, ported: removing a block from a cave roof spills light correctly into the chunk below.
