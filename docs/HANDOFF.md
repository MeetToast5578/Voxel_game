# Handoff: Voxel Game (MeetToast5578/Voxel_game)

## Latest local batch — 2026-10-21 (spec 48)

Completed T-D6/T-D7/T-E2/T-E3/T-E4: wave-exposed coasts/deep shelves, worker-built
horizon to ~2.4 km, climate vertex colours, biome flower mixtures and shoreline reeds.
Latest validation: 599 tests / 72 files, typecheck/build, enabled-tint worker guards
(generation 1.312 ms; meshing 1.286 ms), GPU regressions and all 30 gameplay smoke
checks pass. Horizon and shoreline screenshots inspected. Generated-terrain LOD excludes
saved distant structures and workers=0; mountains retain their approved cap. New reed
state appends after existing IDs; saved edits/dependencies/save format remain intact.

Next: boulders, fallen logs, lily pads, moss/art, then finer biome resolution (T-E10).
Owner playtests/river-seam acceptance and current CI remain unrun. The owner authorized
commits/pushes; the prior batch is checkpointed as 2396e91. The new batch is committed as dd1d991
and pushed on codex/coasts-horizon-flora; origin was verified against the local SHA. See tasks.md
and log.txt for the current queue/evidence; older uncommitted-status notes are historical.

## Current local batch — 2026-10-21

The live queue and acceptance evidence are in `docs/tasks.md`; older session notes below
are historical. Current local changes complete T-A6/T-D3 (mining fixture, aquifers) and
T-D4/T-G8/T-G9/T-G13/T-G14 (underground pools, lava, cooling, water-cushioned falls and
survival fire/extinguishing). Specs 46–47 describe the implementation and limits.

Validation: typecheck, 584 tests / 68 files, production build, isolated worker guards
(generation 1.428 ms; meshing 1.356 ms), GPU regressions and all 28 gameplay smoke checks
pass. Old IDs, dependencies and save format are preserved; new lava/obsidian states append.
Unedited terrain regenerates with new caves/groundwater/basins; saved edits remain. Fire is
transient. Next: coasts/oceans (T-D6), then horizon LOD (T-D7). Owner playtests and current
CI remain unrun. All work and corrections are logged in `log.txt`; changes remain local
and uncommitted. No push, PR, merge or publication occurred in this session.

## Session note — 2026-10-19 (reference gap map, PR #25)

Worked on branch `claude/zealous-allen-odrdj5`. Merged into `main` as `d8bd22d`.

- **Added `docs/REFERENCE-GAPS.md`.** Every open roadmap item is mapped against `nrz/Voxels`, a Java sandbox from 2016–17, with citations to its files. Three earlier claims in the doc were corrected: the reference's water flow is dormant, its dropped items are never picked up, and its jump and impact sounds are not played.
- **Ideas only.** The reference is GPL. The repo has no licence file, and no reference code is copied. Copying code would need a licence decision first.
- **Licence added, then removed.** `LICENSE` (GPL-3), the `package.json` licence field and a README section were added, then removed on the owner's request (`5833712`). Their commits remain in history, since the branch is not force-pushed.
- **Dropped items were not kept.** A spec 23 dropped-items feature was built on this branch. `main` already had the same feature as spec 24 (`docs/specs/24-inventory-and-items.md`, `src/items/itemEntities.ts`), so the branch's copy was removed. Spec 23 on `main` is grass blocks.
- **Local smoke is unreliable here.** On the merged tree, `npm run smoke` failed at different checks on two runs, at about 33 fps, while the code matched `main`. Treat local smoke results in this sandbox as weak evidence. GitHub CI is the real check.
- **Open question for the owner.** Which of the remaining gaps should get a spec first: water levels, greedy meshing, or mobs. Dropped items are done on `main` (spec 24). The gap doc notes that greedy meshing needs measuring first, because per-vertex AO and light limit how many quads can merge.

## Current handoff — 2026-10-19

The user authorized autonomous implementation, testing, logging, task-list updates and pushes to `main`. This session is pinned to the branch `arena/f70f1800-voxel-game`, so work is committed there and offered to `main` through a pull request.

**CI is green on the current batch.** PR #31 (`98706b2`, the CI repair) was merged into `main` as `697f926`. PR #32 carries `58ae409` (T-D2 plus the smoke-chain fixes); run 39259305015 on that commit passed both jobs — `check` 1m5s (meshing 1.243 ms, generation 1.256 ms, hash unchanged) and `smoke` 6m58s, all 25 checks. The earlier repair, kept for the record:

The checkout was the one-commit snapshot `49bc873`. Both CI jobs were red at that commit, and both failures reproduced locally:

- `check`: `npm run check` passed (533 tests), but the worker benchmark failed at a **mesh mean of 3.555 ms** against the strict 3 ms guard. The 2.787 ms figure in the previous handoff had only ~7 % headroom, so a slower runner tipped it. Fixed by real optimisation rather than a looser budget: per-state tables, precomputed face/AO/UV/region offsets, growable typed-array vertex buffers, reusable region/light scratch, and 32-bit row copies in `buildRegion`. Node 22 now measures **1.715 ms** (passes 2.114 / 1.502 / 1.529) with the mesh hash byte-identical (`803974a7770501157d9409fc8622d26838a45e03e5c06ed3661d8989843715ae`). The benchmark step now publishes its numbers as Actions notices/annotations; the 3 ms assertion is unchanged.
- `smoke`: "no crack stage shown while breaking Grass" was a polling race (a 0.5 s block leaves stage 0 between two Playwright round trips on software rendering). The render loop now records `breakStageSeen`, exposed in `state()`, and the check reads it. Two further sequence-dependent failures were fixed: auxiliary pages now load while the primary game is `setIdle(true)` (a debug hook that pauses simulation and rendering only), and the smoke browser disables Chromium's background-tab `requestAnimationFrame` throttling, which had starved the mining check after tab switches. Full smoke passes all 25 checks locally; see `log.txt` for the timeline evidence.

**Verification after the repair batch:** `npm run check` PASS (542 tests / 63 files, typecheck, build); Node-22 benchmark PASS with the hash above; full gameplay smoke PASS, 25 checks, 4,012 chunks loaded / 2,063 meshed / 340 draw calls / 20 fps on SwiftShader (software rendering, not owner hardware). The Playwright CDN is blocked here; smoke ran on Chromium 138 from the `@sparticuz/chromium` npm artifact with its AL2023 NSS libraries, unpacked under `/tmp` outside the repository, so no dependency or lockfile changed.

**The slab work described in the previous handoff is not in this checkout.** There is no `stash@{0}` and no `/tmp/voxel-slab-before-ci.patch` here, and no slab code exists in `src/` (`BlockShape` is still `'cube' | 'cross'`, and `src/player/placementTarget.ts` does not exist). Treat `docs/plans/slabs-inventory-gui.md` as the source if that batch is restarted; the `?nosave=1` settings-persistence failure it mentions cannot be reproduced because the code is not present.

**T-D2 (caves beyond noise) is done and verified on CI** in `58ae409`: four systems in `src/world/caves.ts` with tuning in `src/config.ts` (cheese caverns ~6 % of the underground, spaghetti ~3 %, noodles ~1 %, ravines ~1 %), a fading 4–24-block surface roof, cave mouths only from the cheese field, the spec 14 shore/river/lake roof still applied, and `TerrainGenerator` delegating to `caveKind`. Spec 45 documents the rules; tests cover per-system volume bands, the roof, ravine taper, determinism and the forced-open river/lake roof. The smoke suite also stopped depending on spawn history: see the T-D2 entry in `log.txt` for the five test-side fixes.

The next intended work is engine-first, in this order: terrain generation (aquifers next, then lava pools), world physics, then gameplay. `docs/tasks.md` remains the live backlog and the recorded evidence of what is actually done.

Baseline audited 2026-10-17 against `main` (`adf5aba`, eleven commits after `0322d20`); follow-up verification updated 2026-10-18 on the working branch. Baseline status below is supplemented by the dated task-batch results, checked in code, tests and smoke rather than only commit messages.

## Latest autonomous batch (2026-10-18)

Tree implementation committed and pushed to `main` as `bef031a`: all 16 species, habitat wiring, cactus blocks, conifer/palm/umbrella/wetland silhouettes, 515 passing tests and all 25 gameplay smoke checks. T-E11a and existing inventory-backed hotbar T-I10 are done. T-E11 remains partial for owner visual review.

The follow-on rendering batch fixes sun/daylight alignment, clipped and position-dependent sky, precipitation altitude/units/roof culling, seasonal weather timing, and wetness overshoot. Moon phases (T-F1), wet tops (T-F3), humidity/dawn valley fog (T-F4) and their regression checks are implemented. `npm run check`: 527 tests / 62 files, typecheck and build PASS. Full gameplay smoke PASS; GPU regression script PASS with a cold Vite cache. An earlier concurrent-validation run failed at a HUD inventory state wait; diagnostics and auxiliary-page error collection were strengthened, with focused retest tracked in `log.txt`. Physical-browser acceptance remains open. Lightning flash/thunder wiring is still missing (T-F14).

The riverbed batch completes T-D1 and T-D5: seeded sand/gravel/clay sediment, stable old block IDs, local-water-level cave roofs and no underwater terrestrial plants. Generation/registry/atlas tests and the full 25-check gameplay smoke pass.

Performance follow-on completes T-A3/T-J1 and measurements T-J10–T-J12. A profiled three-line bulk region-copy change preserves all mesh bytes and brings the Node-22 reference fixture from 4.011 ms to 2.787 ms; isolated 3 ms guards are added to CI. Warm generation is 1.365 ms, while cold preparation remains outside that budget (T-J9 partial). Full checks: 533 tests / 63 files, GPU and all 25 gameplay checks PASS.

The older phase summary below contains historical details; use `docs/tasks.md` and `log.txt` for the latest per-task evidence.

## Where things stand

Status key: **done** = in code and tested; **partial** = some of the item is in code; **not started** = no code.

- **Phase 0 (groundwork):** CI (spec 1) done. The hand playtest is not done (owner).
- **Phase 1 (foundation):** done in code, specs 2–8. The manual checks in "Waiting on the owner" are open.
- **Phase 1b (meter scale):** blocks are 0.3 m (spec 10), and the save is version 3. Trees are 8–12 m (see "Decided" 1).
- **Phase 2 (terrain):**
  - done: debug map (spec 11), climate and shape fields (12), terrain from the fields (13), 3D density (14), strata, bare rock and deepslate (15, 20), ores (26), mountains capped at 60 m (22)
  - done: region simulation (41), which sets the surface offset, carves river channels and lake basins, and sets moisture for the biome table. Whether rivers run without breaks at region seams is not yet checked by eye.
  - partial: caves (basic noise caves only, no aquifers, lava pools or ravines); the riverbed gravel and clay wait for the rivers
  - not started: coasts beyond the beach band (7), horizon LOD (8)
- **Phase 3 (biomes and flora):**
  - done: climate at block resolution (31), biome table (32), feature system (30, with trees as its only feature), tree species (37), tall grass, poppies, ferns, dandelions and mushrooms (18, 19, 21)
  - partial: biome integration (35, 39): the generator uses the biome for surface and soil blocks, and for trees. Blending across biome borders is **not wired**: `blendSurfaceBlocks` exists in `src/world/biome.ts` and has no caller or test.
  - not started: flowers by biome, reeds, boulders, fallen logs, lily pads, moss
- **Phase 4 (sky, seasons, weather):**
  - done: calendar and seasons with seasonal day length (29), sky dome with sun, moon and stars (33), weather model (32), weather particles and lightning (34)
  - not started: moon phases; stars do not rotate; the wetness value is computed but nothing uses it, so wet darkening is missing; no morning valley fog (only the static distance fog); seasonal foliage colours; smooth lighting
- **Phase 5 (living world):**
  - done: tick queue (25, slice 1), random ticks with a time budget (38), grass spreading (36), leaf decay (40), player buoyancy and quadratic drag (16), wading and splash (17)
  - **Sandbox physics (spec 25), all six slices are in code and tested:**
    - slice 1, tick queue: fixed in this pass. A tick scheduled while the queue runs could be dropped or run twice.
    - slice 2, rule fields: `falls`, `flows`, `supports` and `density` on every block type.
    - slice 3, falling sand and gravel: one cell per tick into air, water or plants, and across chunk borders. Pending falls are not saved; a scan on chunk load resumes them (shortcut, spec says save the ticks).
    - slice 4, flowing water: 8 levels with a falling flag, drains without a feed, the mesh stands at its level. Lava is not in the game, so water meeting lava is not built.
    - slice 5, structural collapse: a removed block's neighbours check their support within 4 blocks. Terrain and long roofs are held up by the edge of the check. Leaves never collapse.
    - block updates run at 20 game ticks a second, as in Minecraft: water moves one block every 5 ticks and falling blocks every 2 (`WATER_TICK_DELAY`, `GRAVITY_TICK_DELAY` in `src/config.ts`). They were running every frame, so a flow finished in a few frames.
    - slice 6, loose bodies: a collapse of 2 or more blocks tumbles as bodies that float or sink by density, and settle back into blocks or items. Bodies are saved as items.
  - not started: snow, crops and saplings; catch-up after reload; currents (flowing water pushing the player); fall damage from water; waterfalls and river flow
- **Phase 6 (creatures):** partial. `src/world/entity.ts` is a pure entity system (spec 42) with gravity and collision, and the game does not use it yet. No animals, AI or pathfinding.
- **Build tools and block menu (this pass):** the build tool panel on screen always shows every setting, including in single-block mode. The inventory's Blocks (creative) tab puts any block into the selected hotbar slot. A solid shell with no cavity left becomes solid, and roofs are a horizontal layer built upward.
- **Phase 7 (survival):**
  - done: survival and creative modes, health, fall damage, drowning, death and respawn with the inventory dropped (34); mining hardness and crack stages (24)
  - partial: hunger is saved and shown, but nothing changes it (no food, no starvation)
  - not started: tools, crafting, food, beds, healing
- **Phase 8 (performance):** not started as a phase. Mesh time is 4.1 ms per surface chunk when run alone (target 3 ms; spec 28 is open).

**Current follow-up batch (2026-10-18):** calendar advancement is wired into the fixed simulation update (T-F9), dead snags are leafless (T-E15), and the planned HUD Inventory button works through the shared toggle (T-K3). Start/pause menu inventory closes back to its originating menu; only inventory opened from play requests capture on close. Code review checked clock readiness/pause/save behaviour, deterministic connected tree bounds, and HUD/menu/inventory stacking. `npm run check` passes: typecheck, **487 tests in 58 files**, build. Full local browser smoke **passes all 25 checks** on Chromium 153, including pointer-free HUD access, pause-overlay clicks, visible keyboard focus and native Tab/Enter/Space activation. Final measurement: 3,967 loaded chunks, 340 draw calls, 6 fps on SwiftShader (not owner hardware). T-F9 and T-E15 are closed. T-K3 remains partial until the owner's physical-browser check; biome plants, wet-surface rendering and slabs are not part of this batch.

**Previous task-batch verification (2026-10-18):** `npm run check` passes locally: typecheck, **476 tests in 57 files**, production build. The inventory smoke failure was isolated to ~20 s GPU readback while creating an uncached icon; CPU-backed atlas/icon canvases reduce the same call to ~3 ms. After fixing later screenshot/mining/water timing races, **both CI jobs pass at `615c101`** ([run 39075601314](https://github.com/MeetToast5578/Voxel_game/actions/runs/39075601314)): `check` 55 s and full `smoke` 6m30s. The full local smoke also passed on Chromium 153 (4,012 loaded chunks, 339 draw calls, 7 fps on SwiftShader). T-A2a is closed; this does not substitute for the owner-only playtests. Stars now rotate (T-F2), and shrubland/steppe now generate their named bushes (T-E14). T-E11 is still partial: 13 of 16 tree species, with willow, mangrove, saguaro and silhouette review remaining.

**Verification on 2026-10-17 (after the physics and tool pass):** `npm run check` passes: typecheck, **464 tests in 55 files**, and the build. The CI `check` job is green on `ubuntu-latest`. The CI `smoke` job, however, **fails** — see the "Known gaps" list. `npm run smoke` passes its checks in headless Chromium at about 8 fps (SwiftShader, so this number is not the owner's). The smoke test has an intermittent failure at the pick-block check: the player is standing above a cell that reads as air, and it is not yet explained. It also failed in the original code in one run.

## Waiting on the owner (not code)

- **Playtest.** 5–10 minutes with a real mouse and keyboard. Everything so far has only been tested headless.
  - Check pointer lock, mouse look, audio, and stepping up 0.6 m ledges (2 blocks).
  - Check that a 2 m high tunnel fits the player (1.75 m tall) and a 1.5 m high one doesn't.
  - Anything broken here jumps the queue.
- **Frame rate on the owner's machine.** Cubic chunks mean more draw calls. The smoke run loads about 3,900 chunks and draws 249 calls. The owner's machine has a slow CPU.
- **Manual checks from the phase 1 PRs:**
  - Dig a shaft 30 m (100 blocks) down: chunks keep appearing below and the sky shows above.
  - From a valley, hills are visible to the full render distance.
  - Pick a new block into the hotbar, dig 9 m (30 blocks) down, wait 10 s and reload: the hotbar, the hole and roughly the same time of day come back.
- **Terrain after spec 22 and region simulation (spec 41).** Peaks are at most about 232 m. Check rivers, lakes and seams from a valley and from a ridge. Edits made in an existing save may float, because unedited ground regenerates.
- **Look of the new rock and plants.** The limestone, slate, basalt, deepslate and mushroom textures were checked only as atlas code and in headless smoke, not by eye.

## Decided (owner approved, 2026-10-17)

1. **Tree size.** Every species now sits inside the documented 8–12 m (27–40 blocks). Oak 27–40, spruce 30–40, birch 27–35, pine 30–40, jungle giant 36–40, acacia 27–32, dead snag 27–33. Bushes stay small. This changes the trees in every world.
2. **Spec numbers.** The duplicates are renumbered: entity system is 42, weather model is 43, survival is 44. Specs 29 (calendar) and 30 (feature system) are written to match the code.
3. **Biome borders.** Surface blocks dither into the neighbouring biome over `BIOME_BLEND_BLOCKS` (3) blocks from the border, with a weight that falls off with distance. Beaches and soil stay as they are.
4. **F3 overlay.** Shows the biome, temperature, rain, season, day and weather at the player.

Known limit: biomes are picked per 16×16 chunk column, so biome borders fall on 4.8 m grid lines. Blending softens them, but the terrain work should fix the grid itself.

## Decisions so far

- **Scale.** 1 block = 0.3 m (spec 10). The player is 1.75 m: about 5.8 blocks tall and 1.6 blocks wide.
- **Step-up.** Physics step-up, not auto-jump. Its height is 0.6 m (2 blocks).
- **Height.** Cubic chunks with unlimited height. Terrain lives in the band −400 m to +2,600 m (spec 13). The surface stays under 232 m: mountains add at most 60 m (spec 22). Taller peaks would read as infinite walls until horizon LOD exists (phase 2 item 8).
- **Sea level.** y = 0 m (spec 13).
- **Terrain.** The shape fields set the large scale (spec 12). A 3D density gives the surface its shape (spec 14). Region simulation (spec 41) sets the surface offset, river channels and lakes.
- **Water.** The player floats at about 80% under water (`PLAYER_DENSITY` 800 kg/m³ against 1000 for water). Swim speed comes from quadratic drag and a stroke: about 2.6 m/s (spec 16). Wading slows the walk by half the submerged fraction (spec 17).
- **Plants.** Tall grass, ferns, poppies, dandelions and mushrooms grow on grass surfaces only, one per cell above the surface, by one hash per column (specs 18, 19, 21). Plants are walk-through and do not block the sun.
- **Biomes.** Each column's biome comes from real temperature (°C, lapse rate applied) and precipitation (mm/year, from the region moisture). Trees grow only where the biome names a species and the surface is grass.
- **Scope.** Everything on the roadmap: ecology, fluids, creatures and survival. Multiplayer is parked.
- **Saves.** IndexedDB, block states stored by name. Save version 3 (spec 10). A save of another version is not loaded, and its chunk records are cleared on load. `voxel-game-save-v1` (the 128-high world) is never read, written or deleted.

## Stack (versions pinned on purpose)

TypeScript 5.9.3, Vite 7.3.6, Vitest 4.0.18, three 0.186.0, simplex-noise 4.0.3, Playwright 1.56.1, preact 10.29.8.
- Do NOT upgrade Vitest to 4.1.x: `npm install` crashes ("Cannot read properties of null (reading 'edgesOut')").
- Node 20+ works; the dev container runs Node 22, and CI uses Node 22.

## Commands

- `npm run dev`: opens http://localhost:5173; click Play.
- `npm run check`: typecheck, the unit tests (542 in 63 files; 2026-10-19 verification), then the build.
- `npm run smoke`:
  - Builds, then opens `/?seed=1&autostart=1&nosave=1` in headless Chromium (SwiftShader WebGL).
  - Runs 24 checks through `window.__game` and writes `screenshots/*.png`.
  - Then logs a measurement: the time until everything is loaded, the FPS, and the chunk and draw-call counts.
  - Needs `npx playwright install chromium`, or set `CHROMIUM_PATH`. In cloud sessions, use `CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.

## Architecture

- `src/config.ts`: every tunable constant (world size, physics, render, storage keys, tree species, weather, survival).
- `src/core`: math (`floorDiv`/`mod`), seeded random (`mulberry32`, `hash2`), coords, fixed-timestep loop (1/60 s steps, frames clamped to 0.25 s).
- `src/world`:
  - `blocks.ts`: `BlockId`/`Tile` are objects, not enums. Ids run AIR 0, STONE 1, DIRT 2, GRASS 3, SAND 4, WATER 5, LOG 6, LEAVES 7, PLANKS 8, GLASS 9, BEDROCK 10, COBBLESTONE 11, BRICK 12, GLOWSTONE 13, GRANITE 14, DIORITE 15, ANDESITE 16, SANDSTONE 17, TALL_GRASS 18, POPPY 19, FERN 20, DANDELION 21, LIMESTONE 22, SLATE 23, BASALT 24, DEEPSLATE 25, BROWN_MUSHROOM 26, RED_MUSHROOM 27, COAL_ORE 28, IRON_ORE 29, GOLD_ORE 30, REDSTONE_ORE 31, DIAMOND_ORE 32, EMERALD_ORE 33, LAPIS_ORE 34 (35 types including air). Each type has a `shape`: `'cube'` (default) or `'cross'` for plants.
  - `chunk.ts`: 16×16×16 `Uint16Array` of block states, indexed `(ly*16+lz)*16+lx`, addressed by `(cx, cy, cz)`. No height limit.
  - `world.ts`: the chunk map, the `edits` map (what gets saved), per-column **tops** (world y of the highest sky-blocking block per cell), kept exact on every edit, `tickStep` and `randomTickStep`.
  - `shape.ts`: the climate fields and `heightMeters` (a spline of continentalness, plus mountains up to `MOUNTAIN_M` = 60 m), and `detailAmpMeters`.
  - `climate.ts`: `blockTemperature` and `blockPrecipitation` at block resolution (spec 31).
  - `biome.ts`: the Whittaker table `biomeAt`, `surfaceBlock`, `soilBlock`, `treeSpecies` (spec 32, 35). `blendSurfaceBlocks` dithers the surface across biome borders.
  - `density.ts`: `TerrainDensity`. A block is solid where `offset − y + amp × noise > 0`, with two octaves of 3D simplex noise.
  - `region.ts`: region simulation (spec 41). Regions of 128 cells of 32 blocks, with a margin on each side. Drainage, lakes, river cells, moisture.
  - `generator.ts`:
    - the surface is the highest solid block of each column (`getHeight`), found by scanning the density down from above the offset
    - the region sample sets the column offset, damps the detail noise inside river channels and lakes, and gives the water level
    - sea level 0: air at or below it becomes water
    - caves carved below the surface; trees (`trees.ts`) from anchors within reach through the feature registry
    - rock: below the soil, a block's rock comes from its strata layer, bent by a 2D warp noise (spec 15). Below −100 m the rock is deepslate. Ores by depth and rock type (spec 26). Columns with a detail amplitude of at least 12 m are bare rock.
    - plants: `plantAt` picks one plant per grass column from one hash, in bands (specs 18, 19, 21)
    - `treeSpeciesAt` and `biomeKeyAt` are the accessors tools and tests use
    - per-column data cached, `COLUMN_CACHE_LIMIT` = 2048 columns
  - `trees.ts`: `treeBlocks(seed, ax, ground, az, species)`, pure. Heights come from the species table, inside 8–12 m.
  - `feature.ts`: `FeatureRegistry`, the anchor system that keeps multi-chunk features seamless (spec 30). Trees are its only feature.
  - `calendar.ts`: seasons, day of season, solar declination, day length by latitude (spec 29).
  - `weather.ts`: the pure `WeatherModel` (spec 43).
  - `tick.ts`, `randomTick.ts`, `ecology.ts`, `leafDecay.ts`: scheduled ticks, random ticks, grass spreading, and leaf decay (specs 25, 38, 36, 40).
  - `entity.ts`: the pure entity system (spec 42). Not used by the game yet.
  - `debugMap.ts`: the colouring for `?map=1`.
  - Also: `chunkManager.ts`, `light.ts`, `spawn.ts`, `time.ts`, `editQueue.ts`.
- `src/render`:
  - `mesher.ts`: pure. Face culling, per-vertex AO and lighting, takes 27 neighbour chunks plus 9 column-top arrays. Cube blocks give faces; `shape: 'cross'` blocks (plants) give two diagonal quads.
  - `sky.ts`, `skyMaterial.ts`: the sky dome with sun, moon and stars (spec 33).
  - `weather.ts`: `WeatherRenderer`, particles and lightning (spec 34).
  - Also: `faces.ts`, `tiles.ts`, `atlasPixels.ts` (procedural textures), `renderer.ts`, `chunkMeshes.ts`, `lightMaterial.ts`, `highlight.ts`, `clouds.ts`, `heldBlock.ts`, `itemMeshes.ts`, `blockGeometry.ts`.
- `src/player`:
  - `physics.ts`: AABB sweep in the order Y → X → Z.
  - `player.ts`: walk, sprint, jump, fly, swim. Buoyancy and quadratic drag (spec 16); `submergedFraction`; wading (spec 17); `splashSpeed`.
  - `raycast.ts`: Amanatides–Woo.
  - Also: `interaction.ts`, `inventory.ts` (36 slots, the hotbar is the first 9, spec 24), `breaking.ts` (timed breaking with crack stages), `buildTool.ts` and `volumes.ts` (volume tools and undo).
- `src/items`: `itemEntities.ts`, dropped items: gravity, friction, lifetime, the cap of 256, pick-up (spec 24).
- `src/ui`: HUD, menu, F3 overlay (`debugText.ts`).
- `src/input`, `src/audio`: procedural noise SFX.
- `src/storage`:
  - settings in `localStorage`
  - the world save in IndexedDB (`voxel-game`): one meta record (seed, player, hotbar, block states by name, time of day, game mode, health, hunger, air, dropped items) plus one record per edited chunk. Only chunks edited since the last write are written; `WorldSaver` never runs two writes at once.
  - `main.ts` opens and loads the save before creating the `Game`; without IndexedDB the game runs on a memory store and the menu says so.
- `src/workers`: `WorkerPool`, which implements `ChunkJobs`.
- `src/game.ts` wires everything together, including survival (`updateSurvival`, `die`). `src/debugApi.ts` exposes `window.__game`.

### Key mechanics

- **Pure modules.** `core`, `world`, `player`, the mesher, `storage` and `ui/debugText` must not import three or touch the DOM. They are unit-tested in Node.
- **ChunkManager.**
  - Loads column tops within renderDistance + 2, then chunks; one list sorted by distance from the eye.
  - Meshes the near cylinder (renderDistance horizontally, `VERTICAL_RENDER_DISTANCE` = 4 up and down) plus each column's surface band, once all 26 neighbours and 9 column tops exist.
  - Unloads with hysteresis (meshes beyond +1, blocks beyond +3; surface bands are kept).
  - Time budgets apply on the main thread. With workers, at most 16 jobs are in flight, and a per-chunk version counter drops stale results.
- **Lighting.**
  - Sky light and block light are computed fresh for each mesh from the 3×3×3 chunk region. This is exact because light reaches at most 14 blocks. Sunlight is seeded from the column tops.
  - An edit remeshes its chunk (and any neighbour whose padded volume holds the block) immediately and marks the rest of the 3×3×3 dirty.
- **Day/night.**
  - A shader patch (`onBeforeCompile`) multiplies colour by `max(aLight.sky * uDaylight, aLight.block)`.
  - Every chunk geometry MUST have an `aLight` attribute, or it renders black.
- **Survival.** Fall damage uses `GRAVITY_M_S2` (config) for the impact speed. Drowning costs air, and damage starts when the air runs out. Death drops the inventory and respawns at the spawn point.
- **Conventions.**
  - Y is up.
  - Yaw 0 looks toward −Z, and moving the mouse right decreases yaw.
  - Camera rotation order is `'YXZ'`.
  - Player position is the centre of the feet.
- **URL params.**
  - `?seed=N` also disables saving.
  - `?nosave=1`, `?autostart=1`, `?workers=0`, `?map=1`.
- **Debug API.**
  - Methods: `ready`, `state()`, `teleport`, `look`, `setFlying`, `getBlock`, `setBlock`, `breakTarget`, `placeTarget`, `pickTarget`, `selectSlot`, `setHotbarSlot`, `holdButton` (presses a mouse button, for timed breaking), `save()` (returns a promise), `setTimeOfDay`, `setGameMode`, `setHealth`, `damage`, `setHunger`, `setAir`.
  - `state()` also includes `hotbar`, `inventory`, `areaMeshed` (the 3×3×3 around the feet is meshed), `drawCalls`, the chunk and tick stats, and the survival fields.

### Gotchas

- TS 5.9 needs `Uint8ClampedArray<ArrayBuffer>` for `new ImageData`.
- `toEqual` treats −0 and 0 as different.
- Catch `requestPointerLock()` rejections.
- Create the worker as `new Worker(new URL('./chunkWorker.ts', import.meta.url), { type: 'module' })`.
- `getHeight` is the highest **solid** block, not the top of the water. For the sky-blocking top (water counts), use `columnTops`.
- The surface is not one height per column any more (spec 14), so do not assume the blocks under `getHeight` are all solid.
- A plant is not solid and does not block the sky, so `solid`, `opaque` and `blocksSky` must all be checked for it, not one of them.
- Changing a plant, rock or tree chance in `config.ts` changes every generated world, not only new ones.
- `getHeight(x, z)` takes **block** coordinates, and `heightMeters` takes **meters**. A scan that mixes them looks at the wrong place (this caused a wrong 2.4 km reading during spec 22). Multiply blocks by `BLOCK_SIZE_M` to get meters.
- Tests that need a mountain use `PEAK` in `tests/generator.test.ts`, a rugged point found by a field scan. If the shape changes, find a new point and update `PEAK` rather than loosening the assertion.
- Tests that time the generator or mesher take the fastest of several runs, and the slow ones have explicit timeouts (spec 39 and `tests/spawn.test.ts`). Do not make them tighter to pass.

## Known gaps and backlog

See `docs/ROADMAP.md` for the phase list, and the "Decided (owner approved)" above for choices the owner has already made.
- **Testing.** No real mouse-and-keyboard playtest yet.
- **Mesh time.** 4.1 ms per surface chunk when run alone (target 3 ms, spec 28).
- **Cold column generation.** About 8.4 ms median in Node (last measured before region simulation; not re-measured).
- **Spawn search.** `tests/spawn.test.ts` takes about 6 s for 30 seeds (about 200 ms per seed), so it needs its explicit timeout.
- **Region simulation.** About 162 ms per region on seed 1337 (spec 41). Not re-measured.
- **Biomes.** Biomes are chunk-column-sized (4.8 m), so borders are on a grid. Flowers by biome, reeds and boulders are open.
- **Sky and weather.** No moon phases; stars do not rotate; no wet darkening; no morning valley fog; no seasonal foliage.
- **Living world.** Snow layers, saplings, crops, catch-up on reload and lava are open. Fluid levels and currents exist but are not wired to bodies. Sandbox physics (spec 25) is complete: all six slices, see the phase 5 list above.
- **Entities.** Not used by the game yet. No creatures.
- **Survival.** Hunger does not change; no food, tools, crafting or beds.
- **Edits.** An edit remeshes up to 8 chunks on the main thread at once, about 3 ms each.
