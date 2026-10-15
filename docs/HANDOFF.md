# Handoff: Voxel Game (MeetToast5578/Voxel_game)

Last updated 2026-10-15.

## Where things stand

**Phase 1 of `docs/ROADMAP.md` is complete and merged** (PRs #5–#10), and so is phase 1b (meter-based scale, specs 9–10):
- CI (spec 1), world scale (spec 2), step-up (spec 3)
- 16-bit block states with names (spec 4)
- cubic 16³ chunks with no height limit, 3D light and mesher, 3D streaming (specs 5–7)
- the world save in IndexedDB, including the hotbar and time of day (spec 8)
- 0.3 m blocks, realistic trees and the save version 3 (specs 9–10)

**Phase 2 (terrain) is under way.** Merged:
- the debug map `?map=1` (spec 11)
- climate and shape fields (spec 12)
- terrain from those fields (spec 13)
- Minecraft-style 3D density, so the surface is lumpy and can overhang (spec 14, PR #16)

`npm run check` (198 tests in 32 files) and `npm run smoke` (15 checks) are green on `main`. Smoke's only error in cloud sessions is the favicon 404 (see below).

The owner is continuing with **Claude Haiku 5.5** to save tokens. The next section is written for that.

## For the next session (Haiku)

### Do first

1. Read `.claude/skills/working-style/SKILL.md`. It overrides everything else: do exactly what is asked, ask before big decisions, keep replies short.
2. Ask the owner what they want next. Don't start a phase on your own.

### Waiting on the owner (not code)

- **Playtest.** 5–10 minutes with a real mouse and keyboard. Everything so far has only been tested headless.
  - Check pointer lock, mouse look, audio, and stepping up 0.6 m ledges (2 blocks).
  - Check that a 2 m high tunnel fits the player (1.75 m tall) and a 1.5 m high one doesn't.
  - Anything broken here jumps the queue.
- **Frame rate on the owner's machine.** Cubic chunks mean more draw calls. CI's headless Chromium shows about 18 FPS once everything is loaded (303 draw calls). The owner's machine has a slow CPU.
- **Manual checks from the phase 1 PRs:**
  - Dig a shaft 30 m (100 blocks) down: chunks keep appearing below and the sky shows above.
  - From a valley, hills are visible to the full render distance.
  - Pick a new block into the hotbar, dig 9 m (30 blocks) down, wait 10 s and reload: the hotbar, the hole and roughly the same time of day come back.

### Good Haiku-sized tasks (only when the owner asks)

- **Refresh these docs** if they drift from the code again.
- **Cloud smoke test favicon.** In cloud sessions `npm run smoke` passes every check, then fails on `console.error: Failed to load resource: 404`. That's the full Chromium's favicon request; CI doesn't hit it.
  - A likely fix is `<link rel="icon" href="data:,">` in `index.html`.
  - Verify: smoke passes in the cloud with `CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
- **Geology, phase 2 item 5** (strata by noise, soil depth by slope). Write `docs/specs/15-geology.md` first, then build it. This is the next roadmap item for Haiku.
- **Bug fixes from the playtest**, one per branch and pull request.
- **Any spec written in `docs/specs/` style:** prose requirements, acceptance criteria and test cases.

### Not Haiku-sized (raise with the owner first)

- **Phase 2 region simulation (item 3):** rivers, erosion, lakes and moisture. Needs a plan and specs first, and the roadmap marks region simulation as work for a larger model. Haiku should not design it.
- **Phase 2 horizon LOD (item 8)** and the caves beyond spaghetti (item 6).
- **The mesher, lighting, worker pipeline, chunk streaming and renderer core.** Changes there are easy to get subtly wrong; light must stay exact across chunk borders.
- **Mesh time.** It averages 3.1–3.7 ms per surface chunk in Node, against spec 6's 3 ms target. The remaining cost is region building and the face loop.
- **Cold column generation.** A cold surface chunk builds its column and takes about 8.4 ms median in Node (2.4 ms before spec 14). Warm chunks take about 0.6 ms. Fixing this touches the column cache and the surface scan.
- **Draw calls.** Cave culling and batching are phase 8.

### How to work in this repo

- **One spec or fix per branch and per pull request.**
  - Don't refactor code the task doesn't mention.
  - Don't add, remove or upgrade packages (see Stack).
- **Run `npm run check` before every push.** Smoke runs in CI; locally it's heavy on the owner's machine.
- **Pure modules stay pure:** `src/core`, `src/world`, `src/player`, `src/render/mesher.ts`, `src/storage` (except `worldStore.ts`'s IndexedDB class) and `src/ui/debugText.ts`. No three.js and no DOM; they're tested in Node.
- **Tunable numbers live in `src/config.ts`.** Distances and speeds are written in meters and converted with `metersToBlocks`.
- **Test helpers** live in `tests/support/`:
  - `stackedColumn.ts`: stacks chunks into a column, up to the column's top
  - `testWorld.ts`: 27 neighbour arrays plus exact column tops for light and mesher tests
  - `fakeGenerator.ts`: given tops, for ChunkManager tests
- **No git identity is configured in cloud sessions.** Commit with `git -c user.name="Yunus Alizade" -c user.email=62231698+MeetToast5578@users.noreply.github.com`.
- **The owner's machine is Windows with a slow CPU.** Prefer CI or a cloud session for `npm run check` and `npm run smoke`.

## Decisions so far (updated 2026-10-15)

- **Scale.** 1 block = 0.3 m (spec 10; it was 0.6 m). The player is 1.75 m: about 5.8 blocks tall and 1.6 blocks wide.
- **Step-up.** Physics step-up, not auto-jump. Its height is 0.6 m (2 blocks).
- **Height.** Cubic chunks with unlimited height. Terrain lives in the band −400 m to +2,600 m (spec 13).
- **Sea level.** y = 0 m (spec 13).
- **Terrain (phase 2).** The shape fields set the large scale (spec 12). A 3D density gives the surface its shape (spec 14). Region drainage and erosion (item 3) are still to come.
- **Scope.** Everything on the roadmap: ecology, fluids (including liquid physics), creatures and survival. Multiplayer is parked.
- **Saves.** IndexedDB, block states stored by name. The save version is 3 (spec 10). A save of another version is not loaded, and its chunk records are cleared on load. `voxel-game-save-v1` (the 128-high world) is never read, written or deleted.

## Stack (versions pinned on purpose)

TypeScript 5.9.3, Vite 7.3.6, Vitest 4.0.18, three 0.186.0, simplex-noise 4.0.3, Playwright 1.56.1.
- Do NOT upgrade Vitest to 4.1.x: `npm install` crashes ("Cannot read properties of null (reading 'edgesOut')").
- Node 20+ works; the dev container runs Node 22, and spec 1 uses Node 22 in CI.

## Commands

- `npm run dev`: opens http://localhost:5173; click Play.
- `npm run check`: typecheck, 198 unit tests in 32 files, then build.
- `npm run smoke`:
  - Builds, then opens `/?seed=1&autostart=1&nosave=1` in headless Chromium (SwiftShader WebGL).
  - Runs 15 checks through `window.__game` and writes `screenshots/*.png`.
  - Then logs a measurement: the time until everything is loaded, the FPS, and the chunk and draw-call counts.
  - Needs `npx playwright install chromium`, or set `CHROMIUM_PATH`. In cloud sessions, use `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.

## Architecture

- `src/config.ts`: every tunable constant (world size, physics, render, storage keys).
- `src/core`:
  - math (`floorDiv`/`mod`)
  - seeded random (`mulberry32`, `hash2`)
  - coords
  - fixed-timestep loop (1/60 s steps, frames clamped to 0.25 s)
- `src/world`:
  - `blocks.ts`: `BlockId`/`Tile` are objects, not enums. Ids run AIR 0, STONE 1, DIRT 2, GRASS 3, SAND 4, WATER 5, LOG 6, LEAVES 7, PLANKS 8, GLASS 9, BEDROCK 10, COBBLESTONE 11, BRICK 12, GLOWSTONE 13.
  - `chunk.ts`: 16×16×16 `Uint16Array` of block states, indexed `(ly*16+lz)*16+lx`, addressed by `(cx, cy, cz)`. No height limit.
  - `world.ts`: the chunk map, the `edits` map (what gets saved), and per-column **tops** (world y of the highest sky-blocking block per cell), kept exact on every edit.
  - `shape.ts`: the six climate fields and `heightMeters` (a spline of continentalness, plus mountains), and `detailAmpMeters` (the density's amplitude).
  - `density.ts`: `TerrainDensity`. A block is solid where `offset − y + amp × noise > 0`, with two octaves of 3D simplex noise.
  - `generator.ts`:
    - the surface is the highest solid block of each column (`getHeight`), found by scanning the density down from above the offset
    - sea level 0: air at or below it becomes water
    - stone below the band, air above it
    - caves carved below the surface, trees (`trees.ts`) from anchors within reach
    - per-column data (surface, offsets, amplitudes) cached, `COLUMN_CACHE_LIMIT` columns
  - `debugMap.ts`: the colouring for `?map=1`.
  - Also: `chunkManager.ts`, `light.ts`, `spawn.ts`, `time.ts`.
- `src/render`:
  - `mesher.ts`: pure. Does face culling, per-vertex AO and lighting, and takes 27 neighbour chunks plus 9 column-top arrays.
  - Also: `faces.ts`, `tiles.ts`, `atlasPixels.ts` (procedural textures), `renderer.ts`, `chunkMeshes.ts`, `lightMaterial.ts`, `highlight.ts`, `clouds.ts`.
- `src/player`:
  - `physics.ts`: AABB sweep in the order Y → X → Z.
  - `player.ts`: walk, sprint, jump, fly, swim.
  - `raycast.ts`: Amanatides–Woo.
  - Also: `interaction.ts`, `hotbar.ts`.
- `src/ui`: HUD, menu, F3 overlay.
- `src/input`, `src/audio`: procedural noise SFX.
- `src/storage`:
  - settings in `localStorage`
  - the world save in IndexedDB (`voxel-game`): one meta record (seed, player, hotbar and block states by name, time of day) plus one record per edited chunk. Only chunks edited since the last write are written; `WorldSaver` never runs two writes at once.
  - `main.ts` opens and loads the save before creating the `Game`; without IndexedDB the game runs on a memory store and the menu says so.
- `src/workers`: `WorkerPool`, which implements `ChunkJobs`.
- `src/game.ts` wires everything together. `src/debugApi.ts` exposes `window.__game`.

### Key mechanics

- **Pure modules.** `core`, `world`, `player`, the mesher, `storage` and `ui/debugText` must not import three or touch the DOM. They are unit-tested in Node.
- **ChunkManager.**
  - Loads column tops within renderDistance + 2, then chunks; one list sorted by distance from the eye.
  - Meshes the near cylinder (renderDistance horizontally, `VERTICAL_RENDER_DISTANCE` = 4 up and down) plus each column's surface band (lowest top − 1 up to highest top), once all 26 neighbours and 9 column tops exist.
  - Unloads with hysteresis (meshes beyond +1, blocks beyond +3; surface bands are kept).
  - Time budgets apply on the main thread. With workers, at most 16 jobs are in flight, slots are refilled as soon as results arrive, and a per-chunk version counter drops stale results.
- **Lighting.**
  - Sky light and block light are computed fresh for each mesh from the 3×3×3 chunk region. This is exact because light reaches at most 14 blocks. Sunlight is seeded from the column tops, so it is right even when the chunks above are not loaded.
  - An edit remeshes its chunk (and any neighbour whose padded volume holds the block) immediately and marks the rest of the 3×3×3 dirty; if it moved a column top, chunks around the old and new top are marked dirty too.
- **Day/night.**
  - A shader patch (`onBeforeCompile`) multiplies colour by `max(aLight.sky * uDaylight, aLight.block)`.
  - Every chunk geometry MUST have an `aLight` attribute, or it renders black.
- **Conventions.**
  - Y is up.
  - Yaw 0 looks toward −Z, and moving the mouse right decreases yaw.
  - Camera rotation order is `'YXZ'`.
  - Player position is the centre of the feet.
- **URL params.**
  - `?seed=N` also disables saving.
  - `?nosave=1`, `?autostart=1`, `?workers=0`, `?map=1`.
- **Debug API.**
  - Methods: `ready`, `state()`, `teleport`, `look`, `setFlying`, `getBlock`, `setBlock`, `breakTarget`, `placeTarget`, `pickTarget`, `selectSlot`, `setHotbarSlot`, `save()` (returns a promise), `setTimeOfDay`.
  - `state()` also includes `hotbar`, `areaMeshed` (the 3×3×3 around the feet is meshed), `drawCalls` and the chunk stats.

### Gotchas

- TS 5.9 needs `Uint8ClampedArray<ArrayBuffer>` for `new ImageData`.
- `toEqual` treats −0 and 0 as different.
- Catch `requestPointerLock()` rejections.
- Create the worker as `new Worker(new URL('./chunkWorker.ts', import.meta.url), { type: 'module' })`.
- `getHeight` is the highest **solid** block, not the top of the water. For the sky-blocking top (water counts), use `columnTops`.
- The surface is not one height per column any more (spec 14), so do not assume the blocks under `getHeight` are all solid.

## Known gaps and backlog

See `docs/ROADMAP.md` for phases 2–8. Known gaps after phase 2 items 1–2 and specs 13–14:
- **Testing.** No real mouse-and-keyboard playtest yet.
- **Mesh time.** 3.1–3.7 ms per surface chunk, against a 3 ms target.
- **Cold column generation.** About 8.4 ms median (see above).
- **Plains.** Some stepped ground remains on gentle slopes (spec 14 out-of-scope note).
- **Terrain.** Geology (item 5), region simulation with rivers and erosion (item 3), caves beyond spaghetti (item 6), coasts (item 7) and horizon LOD (item 8) are still to come.
- **Draw calls.** A loaded world has ~1,800 meshed chunks, ~300 drawn after frustum culling. Cave culling and batching are phase 8.
- **Edits.** An edit remeshes up to 8 chunks on the main thread at once, about 3 ms each.
