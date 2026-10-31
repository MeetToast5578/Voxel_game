# Spec 54: Engine rewrite at 0.6 m blocks

**Built by:** Claude, after an engine review the owner asked for.
**Status:** built. Phases 1–11 were built in `src/` beside the old game; phase 12 (2026-10-31) replaced the old game,
so the code described here is now `src/`, and `index.html` loads it.

## Why

The old engine had:
- a short view (38 m at 0.3 m blocks);
- light recomputed over 27 chunks for every mesh;
- about 11 ms of main-thread work per edit;
- remesh storms near flowing water;
- string chunk keys on hot paths;
- world generation on the main thread;
- saves that grew forever;
- horizon and ice drawn wrongly;
- one 1,500-line `game.ts`.

The owner chose a full rewrite with 0.6 m blocks and 16³ chunks (9.6 m).

## Layout

| Folder | Holds |
| --- | --- |
| `src/config.ts` | Every tunable number, in meters, seconds and m/s. Cell counts derive through `cells()`; a test checks every `_CELLS` value. |
| `src/core` | Packed integer chunk keys, a growable `IntQueue`, RNG, math, the fixed-step loop. |
| `src/engine` | Block registry, palette chunks, the world store, light, mesher, streaming, cave culling. |
| `src/worldgen` | Climate fields, biomes, density terrain, rivers and lakes, caves, ores, groundwater, trees. Pure; runs in workers. |
| `src/sim` | Block updates (fluids, falling blocks, support, growth, snow and ice), calendar, weather, environment. |
| `src/game` | Player physics, input, raycast, inventory, crafting, furnaces, mining, survival, the `Play` system. |
| `src/creatures` | Species and behaviour. |
| `src/render` | Renderer, terrain material, chunk meshes, sky, clouds, precipitation, horizon, highlight, creatures, tiles. |
| `src/storage` | Chunk codec, saver, IndexedDB and memory stores, archives, settings. |
| `src/ui` | Preact HUD, inventory screens, menu; touch controls. |
| `src/workers` | Worker pool and the chunk worker. |
| `src/main.ts` | The composition root. Systems get what they need explicitly; nothing patches another system. |

## Key decisions

- **Chunks:**
  - 16³ cells, stored as a palette: uniform (one state), 8-bit or 16-bit indices.
  - Light is one byte per cell (sky and block nibbles), held only when it varies.
  - Keys are numbers.
- **Light:**
  - Stored, not recomputed.
  - Sky light is full above each column's sky top. Workers light their own chunks.
  - The main thread stitches borders, only where light can cross, and keeps light exact through edits with remove
    and add flood fills.
  - A test checks the result against a full recompute after random edits.
- **Meshing:**
  - Runs in workers, from an 18³ padded copy of cells and light.
  - Greedy merging of faces; two uint32 words per vertex; tiles in a texture array.
  - Four passes: opaque without discard, cutout, water, ice.
  - Each pass is drawn from pools of 131,072 quads: one multi-draw per pool (three's `BatchedMesh`, with space
    handed out first-fit by `ChunkMeshes`). The shader finds a chunk's origin from `gl_DrawID`. The terrain takes
    about 10 draw calls, whatever the view distance.
  - A mesh result is never thrown away: a chunk that changed meanwhile is meshed again. Player edits are meshed
    first.
- **Streaming:**
  - Per column: the surface band, the sea surface, and a short cylinder around the player.
  - Each column always goes to the same worker, so its cache keeps hitting. Never-meshed chunks go first.
  - Cave culling walks face connectivity from the camera.
- **World generation:**
  - Climate fields and 3D density terrain.
  - Rivers come from a world-wide drainage network: nodes on three grids, each draining to its lowest neighbour.
    Every decision is local, so there are no region seams.
  - Caves are sized in meters, with a roof under water. Groundwater and lava fill deep caves.
  - Ores are placed per volume. Trees are built whole and clipped per column.
- **Saves:**
  - Whole changed chunks, with their light, deflated, with states stored by name.
  - Sky tops of changed columns, plus one meta record holding the player, time, block updates, play state and
    creatures.
  - A revision check stops another tab from overwriting the save. Worlds export and import as JSON.
- **Simulation:**
  - Scheduled ticks at 20 Hz. Ticks for unloaded chunks wait and are saved.
  - Random ticks run at a fixed rate per chunk near the player, so they don't depend on the view distance.

## Measured (benchmark and headless Chromium with SwiftShader)

- **Per chunk:** generation about 1.1 ms, meshing about 0.5 ms, worker light about 0.19 ms, stitching about 0.3 ms.
  `scripts/benchmark.mjs --assert` gates them at 2, 1, 1 and 1 ms.
- **Edits:** 0.3–1.9 ms on the main thread; on screen within 2 frames (`scripts/smoke.mjs`).
- **View distance 12 chunks (115 m):** about 2,700 chunks loaded and about 330,000 quads in 13 draw calls. Before
  pooling it was 500–650 draw calls. The old engine needed 3,000–4,000 chunks and 340 draw calls to show 38 m.

## Known shortcuts and open items

- **Collision:** stairs and closed doors collide as whole cells. The step height is a whole cell, so stairs still
  climb, and a closed door blocks its doorway either way.
- **Creatures:** only hunters path-find (A* on the cell grid, 300 nodes, replanned every second); other creatures
  steer and turn back at water, cliffs and walls.
- **Drops:** items lie in the world only when they do not fit, are thrown (Q) or are scattered on death; broken
  blocks still go straight into the inventory.
- **Rivers:** there are no stony shores or sandbars. Waterfalls are generated only where a river steps down more
  than one cell. Where a lake spills over a wide edge, the waterfall is as wide as the edge.
- **Pools:** `ChunkMeshes` reaches into `BatchedMesh`'s private geometry table (three is pinned at 0.186.0); a test
  fails if an upgrade changes it. Freed space is reused, never compacted.
- **Light:** below the loaded chunks, the generated sky top is assumed.

## Phase 12: switch-over (done 2026-10-31)

1. The old 0.3 m game (`src/`, `tests/` and its scripts) was deleted; `next/` became `src/` and `next.html` became
   `index.html`.
2. `scripts/smoke.mjs` and `scripts/benchmark.mjs` are the former `next-smoke` and `next-benchmark`; CI runs
   `npm run check`, the benchmark budgets and the smoke test.
3. Old saves are not migrated: a 0.3 m world cannot be mapped onto 0.6 m cells without loss. Worlds made in the new
   game keep working (its IndexedDB database is still `voxel-next`).
