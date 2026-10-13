# Handoff: Voxel Game (MeetToast5578/Voxel_game)

Last updated 2026-10-13.

## Where things stand

`main` contains:
- the working browser voxel game (PR #1) and the owner's working-style skill (PR #2)
- `docs/ROADMAP.md` and the phase 1 specs in `docs/specs/` (PR #5, with spec 1)
- phase 1 specs 1–4: CI (PR #5), world scale (PR #6), step-up (PR #7), 16-bit block states (PR #8)

Specs 5–7 (cubic chunks: data, light and mesher, streaming) are built together on one branch and pull request,
as `docs/specs/README.md` allows. After they merge, the next step is spec 8 (save v2 in IndexedDB), the last spec
of phase 1. Claude was asked to build all of them, including the ones marked "Haiku".

### Local verification on the owner's machine (Windows, slow CPU)

The owner's machine struggles with heavy runs. Prefer CI, or a cloud session, for `npm run check` and `npm run smoke`.

- CI runs both on every pull request. The two local failures seen before CI existed (the mesher timing test under parallel load, and a screenshot error in "swims in water") both pass in CI.
- In cloud sessions, `npm run smoke` passes every check but ends with `console.error: Failed to load resource: 404`. The same happens on unchanged `main` there and not in CI; it is the cloud container's full Chromium (most likely its favicon request). Run it with `CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
- **No git identity is configured here.** Commits were made with `git -c user.name="Yunus Alizade" -c user.email=62231698+MeetToast5578@users.noreply.github.com`.

### Still open

- Not hand-tested with a real mouse and keyboard (pointer lock, mouse look, audio). It has only been tested headless. A 5–10 minute playtest is worth doing before new features; anything broken there should jump the queue.

## How the owner wants to work

Read `.claude/skills/working-style/SKILL.md` first. In short:
- Do exactly what is asked. A request for a plan or spec gets a plan or spec, not a build.
- Ask before big decisions (scope, tech, plan detail, build vs plan).
- Be token-conscious.
- Specs meant for Claude Haiku 5.5 are prose only: requirements, acceptance criteria and test cases, with no implementation code unless asked.

## Next up: phase 1 of the roadmap

The polish batch grew into a full plan. **Read `docs/ROADMAP.md`**: it has the vision, the decisions, the scale reference and phases 0–8.

Decided (2026-10-13):
- **A.** Physics step-up (no auto-jump).
- **B.** Superseded. The world format changes completely, so the new save lives in IndexedDB and old saves aren't loaded.
- **C.** Accepted, and now moot.
- **Scale.** 1 block = 0.6 m; the player is about 3 blocks tall.
- **Height.** Cubic chunks with unlimited height.
- **Terrain.** Hybrid: noise plus region drainage and erosion.
- **Scope.** Everything: ecology, fluids, creatures and survival.

Delivery is mixed:
- Small, self-contained specs go to Haiku.
- Work on the mesher, lighting, worker pipeline, region simulation or renderer core is built directly by Claude.

The phase 1 specs are in `docs/specs/`. Its `README.md` has the order, who builds each spec, and the rules every spec shares.

### Reviewing the phase 1 pull requests

- **Spec 2 (scale).** Every distance or speed constant is written in meters and converted in `config.ts`. There are no stray literals left in `player.ts` or `game.ts`.
- **Spec 3 (step-up).**
  - `moveAndCollide` with no step height behaves exactly as before.
  - The camera offset is interpolated between ticks.
  - No stepping happens while flying, swimming or airborne.
- **Specs 5–7 (cubic).**
  - Column tops always equal a scan of generated-plus-edited blocks.
  - Light stays exact across vertical borders.
  - Surface-band loading keeps hills visible from valleys.
- **Spec 8 (save).** Hotbar and time are repaired, never rejected. `voxel-game-save-v1` is never touched.
- **All specs.** `package.json` and `package-lock.json` are not in the diff.

## Stack (versions pinned on purpose)

TypeScript 5.9.3, Vite 7.3.6, Vitest 4.0.18, three 0.186.0, simplex-noise 4.0.3, Playwright 1.56.1.
- Do NOT upgrade Vitest to 4.1.x: `npm install` crashes ("Cannot read properties of null (reading 'edgesOut')").
- Node 20+ works; the dev container runs Node 22, and spec 1 uses Node 22 in CI.

## Commands

- `npm run dev`: opens http://localhost:5173; click Play.
- `npm run check`: typecheck, 118 unit tests in 28 files, then build.
- `npm run smoke`:
  - Builds, then opens `/?seed=1&autostart=1&nosave=1` in headless Chromium (SwiftShader WebGL).
  - Runs 14 checks through `window.__game` and writes `screenshots/*.png`.
  - Needs `npx playwright install chromium`, or set `CHROMIUM_PATH`.

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
  - `generator.ts` (phase 1 interim):
    - the old 128-high terrain as a "legacy column" (y 0..127): fbm height map, beaches, sea at y = 40, spaghetti caves
    - solid stone below y = 0, air above y = 127; bedrock is no longer generated
    - trees only at local x/z 2–13 (the phase 3 feature system replaces this)
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
- `src/storage`: settings, and a temporary save (`voxel-game-save-v2`, 3D chunk keys) in `localStorage`. Spec 8 replaces it.
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
  - `?nosave=1`, `?autostart=1`, `?workers=0`.
- **Debug API.** `ready`, `state()`, `teleport`, `look`, `setFlying`, `getBlock`, `setBlock`, `breakTarget`, `placeTarget`, `pickTarget`, `selectSlot`, `save`, `setTimeOfDay`. Spec 8 adds `setHotbarSlot` and `state().hotbar`.

### Gotchas

- TS 5.9 needs `Uint8ClampedArray<ArrayBuffer>` for `new ImageData`.
- `toEqual` treats −0 and 0 as different.
- Catch `requestPointerLock()` rejections.
- Create the worker as `new Worker(new URL('./chunkWorker.ts', import.meta.url), { type: 'module' })`.

## Known gaps and backlog

See `docs/ROADMAP.md`. Phase 1 covers:
- CI
- the scale change
- step-up
- the height limit
- saving the hotbar and time
- the `localStorage` size limit

Later phases cover everything else from the old backlog. Multiplayer is still parked.

Still true until phase 1 lands:
- Not hand-tested with a real mouse and keyboard.
- Each edit causes a ~20 ms main-thread remesh when lighting is on.
