# Handoff: Voxel Game (MeetToast5578/Voxel_game)

Last updated 2026-10-23. Checked against the code on that date: `npm run check` passes (118 tests in 28 files, build OK) and `npm run smoke` passes (14 checks).

## Where things stand

`main` contains:
- the working browser voxel game (PR #1)
- the owner's working-style skill (PR #2)
- specs for the next batch of work (PR #3)

Nothing is in progress. `src/`, `tests/`, `scripts/` and `package.json` are unchanged since PR #1; PRs #2 and #3 only added docs and the skill. None of the four polish specs has been implemented: there is no `.github/` folder, `SAVE_VERSION` is still 1, there is no `STEP_HEIGHT`, and trees still only grow at local x/z 2–13.

- No CI exists yet. Spec 1 adds it. Until then, verify locally with `npm run check` and `npm run smoke`.
- The smoke test failed once on a first run with an unexplained `404` console error (the missing resource was not identified) and passed on three re-runs. If CI shows it, suspect a missing `favicon.ico` (`index.html` has no icon link), which would be an easy fix.
- Not hand-tested with a real mouse and keyboard (pointer lock, mouse look, audio). It has only been tested headless. A 5–10 minute playtest is worth doing before new features; anything broken there should jump the queue.

## How the owner wants to work

Read `.claude/skills/working-style/SKILL.md` first. In short:
- Do exactly what is asked. A request for a plan or spec gets a plan or spec, not a build.
- Ask before big decisions (scope, tech, plan detail, build vs plan).
- Be token-conscious.
- Specs meant for Claude Haiku 5.5 are prose only: requirements, acceptance criteria and test cases, with no implementation code unless asked.

## Next up: the polish batch

Decided:
- The next work is the polish batch.
- Delivery is mixed:
  - Small, self-contained items are given to Haiku as specs.
  - Work touching the mesher, the lighting or the worker pipeline is built directly by Claude.

The specs are in `docs/specs/`. Its `README.md` has the order and the rules every spec shares.

| # | Spec | Size | Status |
|---|------|------|--------|
| 1 | CI (GitHub Actions: `check` and `smoke` jobs) | small | ready; do first |
| 2 | Save hotbar contents and time of day | small | ready once decision B is confirmed |
| 3 | Auto step-up onto 1-block ledges | medium | ready once decision A is confirmed |
| 4 | Trees at chunk borders | medium | ready once decision C is confirmed |

Specs 2–4 are independent and can be done in any order after spec 1. Each spec gets its own branch and pull request.

### Open decisions (owner has not confirmed yet)

- **A. Spec 3, step-up style.** The spec uses physics step-up: the body rises as part of the move and the camera catches up over 0.12 s. The alternative is Minecraft-style auto-jump. If the owner prefers auto-jump, rewrite spec 3 before handing it off.
- **B. Spec 2, save key.** The spec keeps the storage key `voxel-game-save-v1` and bumps the version field inside the save to 2, upgrading v1 saves on load. Renaming the key would orphan existing saves.
- **C. Spec 4, existing worlds.** Existing worlds will gain trees in the formerly empty border lanes, including areas already explored. Player edits still win. The spec treats this as accepted.

### Reviewing the Haiku pull requests

Specs 3 and 4 are the trickiest. When reviewing them, check:

- **Spec 3**
  - `moveAndCollide` with no step height behaves exactly as before, and `tests/physics.test.ts` is unchanged.
  - The camera offset is interpolated between ticks, so the eye never dips below its pre-step height.
  - No stepping happens while flying, swimming or airborne.
- **Spec 4**
  - The generator stays stateless, with no caches.
  - The new pure cave helper doesn't change carving (`tests/caves.test.ts` is unchanged).
  - `getHeight` is called only for columns that pass the hash check.
- **All specs**
  - `package.json` and `package-lock.json` are not in the diff.

### Deferred from the polish batch

- **Smooth lighting.** It changes the mesher and interacts with AO, so it should be built directly.
- **Torches.** They need a non-cube mesh, the same work as cross-shaped plants in the Variety backlog, so do them together.

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
  - `blocks.ts`: `BlockId`/`Tile` are objects, not enums. 14 ids (13 placeable blocks plus air). Ids run AIR 0, STONE 1, DIRT 2, GRASS 3, SAND 4, WATER 5, LOG 6, LEAVES 7, PLANKS 8, GLASS 9, BEDROCK 10, COBBLESTONE 11, BRICK 12, GLOWSTONE 13.
  - `chunk.ts`: 16×128×16 `Uint8Array`, indexed `(y*16+lz)*16+lx`.
  - `world.ts`: the chunk map plus the `edits` map, which is what gets saved.
  - `generator.ts`:
    - fbm height map, beaches, sea at y = 40
    - trees only at local x/z 2–13 (spec 4 changes this)
    - spaghetti caves
  - Also: `chunkManager.ts`, `light.ts`, `spawn.ts`, `time.ts`.
- `src/render`:
  - `mesher.ts`: pure. Does face culling, per-vertex AO and lighting, and takes 9 neighbour chunks.
  - Also: `faces.ts`, `tiles.ts`, `atlasPixels.ts` (procedural textures), `renderer.ts`, `chunkMeshes.ts`, `lightMaterial.ts`, `highlight.ts`, `clouds.ts`.
- `src/player`:
  - `physics.ts`: AABB sweep in the order Y → X → Z.
  - `player.ts`: walk, sprint, jump, fly, swim.
  - `raycast.ts`: Amanatides–Woo.
  - Also: `interaction.ts`, `hotbar.ts`.
- `src/ui`: HUD, menu, F3 overlay.
- `src/input`, `src/audio`: procedural noise SFX.
- `src/storage`: settings, and save v1 in `localStorage`.
- `src/workers`: `WorkerPool`, which implements `ChunkJobs`.
- `src/game.ts` wires everything together. `src/debugApi.ts` exposes `window.__game`.

### Key mechanics

- **Pure modules.** `core`, `world`, `player`, the mesher, `storage` and `ui/debugText` must not import three or touch the DOM. They are unit-tested in Node.
- **ChunkManager.**
  - Generates chunks within renderDistance + 2.
  - Meshes chunks within renderDistance once all 8 neighbours exist.
  - Unloads chunks beyond renderDistance + 3.
  - Time budgets apply on the main thread.
  - With workers, at most 8 jobs are in flight, and a per-chunk version counter drops stale results.
- **Lighting.**
  - Sky light and block light are computed fresh for each mesh from the 3×3 chunk region. This is exact because light reaches at most 14 blocks.
  - An edit remeshes its chunk immediately and marks the 8 neighbours dirty.
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
- **Debug API.** `ready`, `state()`, `teleport`, `look`, `setFlying`, `getBlock`, `setBlock`, `breakTarget`, `placeTarget`, `pickTarget`, `selectSlot`, `save`, `setTimeOfDay`. Spec 2 adds `setHotbarSlot` and `state().hotbar`.

### Gotchas

- TS 5.9 needs `Uint8ClampedArray<ArrayBuffer>` for `new ImageData`.
- `toEqual` treats −0 and 0 as different.
- Catch `requestPointerLock()` rejections.
- Create the worker as `new Worker(new URL('./chunkWorker.ts', import.meta.url), { type: 'module' })`.

## Known gaps

- No CI (spec 1).
- Hotbar contents (after pick-block) and time of day aren't saved (spec 2).
- No auto step-up onto 1-block ledges (spec 3).
- Tree-free lanes along chunk borders (spec 4).
- Flat lighting, not smooth (deferred).
- Each edit causes a ~20 ms main-thread remesh when lighting is on (figure from the original build, not re-measured).
- Water is static; it doesn't flow.
- World height is capped at 128.
- Not hand-tested with a real mouse and keyboard.

## Backlog (multiplayer is parked)

1. **Polish:** CI, save hotbar + time, step-up, chunk-edge trees (all specced), smooth lighting, torches.
2. **Variety:** biomes, ores and more blocks, plants (cross-shaped meshes), tree types, falling sand/gravel, structures, a taller world.
3. **Survival:**
   1. health, fall damage, drowning, respawn
   2. mining time and a crack overlay
   3. an inventory with drops
   4. crafting and tools
   5. hunger (optional)
   6. a creative/survival toggle
4. **Living world:** passive animals (needs an entity system), hostile mobs at night, flowing water.
5. **Building tools:** undo/redo; fill, copy and paste; slabs, stairs and doors; world export/import and IndexedDB.
6. **Visuals:**
   - sun, moon and stars
   - particles
   - view bobbing, sprint FOV
   - animated water, 3D clouds
   - settings for gamma, invert, fullscreen and screenshots
   - isometric hotbar icons
7. **Platform/perf:** greedy meshing (conflicts with AO), far-terrain LOD, gamepad, touch controls, PWA.
