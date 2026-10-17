# Tasks: Voxel Game

Compiled 2026-10-17 against `main` at **`adf5aba`**. Every item was read in the code, not taken from a commit message or a status line.

Sources: `README.md`, `docs/HANDOFF.md`, `docs/ROADMAP.md`, `docs/specs/README.md`, `docs/specs/*.md`, `docs/plans/*.md`, plus direct inspection of `src/` and `tests/`.

IDs are stable — reference them in commits and PRs. Sections are ordered by what unblocks the most.

Status key: `[ ]` open · `[x]` done · `[~]` partial

---

## Resolved since this list was first drafted

The repo moved four commits (`08314af` → `adf5aba`) while this file was being written. `656c247 Approved fixes: tree sizes, spec numbers, biome borders, F3 overlay` closed all four owner decisions. Those tasks are kept below as `[x]` so the audit trail survives.

| Task | Landed in | What changed |
|---|---|---|
| T-B1 tree size | `656c247` | Oak 27–40 blocks (8.1–12.0 m), spruce 30–40, birch 27–35, pine 30–40, jungle giant 36–40, acacia 27–32, dead snag 27–33 (`src/config.ts:297`) |
| T-B2 spec numbers | `fb17054` | Duplicates renumbered to 42/43/44; specs `29-calendar-and-seasons.md` and `30-feature-system.md` written |
| T-B3 biome borders | `656c247` | `blendSurfaceBlocks` wired into the generator via `ditheredSurface` (`src/world/biome.ts:144`, `src/world/generator.ts:41`), tested in `tests/biome.test.ts` |
| T-B4 / T-F6 F3 overlay | `656c247` | `src/ui/debugText.ts:61-62` now prints biome, temperature, rain, season, day and weather |
| T-E1 blending | `656c247` | `BIOME_BLEND_BLOCKS = 3` dither with distance falloff |

Also landed, not previously tracked: `abd4435` puts block updates on a fixed 20 Hz game tick (`GAME_TICKS_PER_SECOND = 20`, `WATER_TICK_DELAY = 5`, `src/config.ts:244-245`), matching Minecraft's overworld delays.

---

## A. Test and build health

`npm run check` is **red on this machine**. CI (`ubuntu-latest`, Node 22) is probably green — unverified, see T-A2.

- [x] **T-A1 — Annotate the slow tests, or raise the default `testTimeout`.** Closed 2026-10-17. `testTimeout: 30_000` added to `vite.config.ts`; no test file touched. Full suite green: 464 tests in 55 files.
  - Zero annotation in every file that fails: `tests/chunkManager.test.ts` (10 tests, 3 fail), `tests/chunkJobs.test.ts` (4, 1), `tests/batchEdit.test.ts` (5, 1), `tests/relight.test.ts` (2, 1), `tests/plants.test.ts` (5, 2). `tests/region.test.ts` (26 tests, 0 annotation) can also fail: its `is deterministic` case timed out on one run and passed on the next, which is the clearest evidence that these are timeouts rather than logic bugs.
  - Partly annotated: `tests/generator.test.ts` has 14 of 22. The one that fails is `classifies columns from real climate, not one always-on fallback`.
  - Convention to follow: `tests/generator.test.ts:88` uses `{ timeout: 60000 }`; `tests/trees.test.ts:49` and `tests/spawn.test.ts:14` use the positional `}, 30_000)` form. **Both forms work** in Vitest 4.0.18 — verified with a throwaway probe, since the published `.d.ts` only advertises `(name, options?, fn?)`.
  - Done when: `npm run check` is green on the owner's machine, twice in a row.

- [x] **T-A2 — Confirm whether CI is actually green.** Closed 2026-10-17: **CI is not green.** The `check` job passes on CI (33 s at `aca8978`), so T-A1 was a local-only problem. The `smoke` job **fails on every run since `0a98002`** (region simulation); the last green smoke was `6a7aead` (14:21), and a docs-only commit (`5019faa`) also failed, so the breakage is in `0a98002`. Failing smoke steps run 2m16s–3m21s vs 1m49s green, which suggests a late failure or timeout but does not establish which check failed. Raw CI logs and the screenshots artifact are not retrievable from the cloud session (the log and blob hosts are blocked), so the exact failing check could not be read from past runs — see T-A2a.
- [~] **T-A2a — Fix the failing smoke job.** (Raised in `log.txt` during T-A2; tracked here.) CI and a local Chromium 153 run both fail in the inventory check. Chromium was recovered from an npm-distributed binary outside the repository; the Playwright CDN remains blocked. Done so far:
  - `scripts/smoke.mjs` now tracks the running check, reports `smoke failure during "<check>"`, and on GitHub Actions prints every collected error as an `::error title=smoke::` annotation, readable from the check-runs API and the run page even when the log zip is not retrievable. The next red run names its failure.
  - The pick-block check waited a fixed 500 ms after teleporting `+4` blocks; the spawn area is a slope since region simulation, the landing is inside the rising ground, and the wait was fps-dependent. It now waits for `onGround || inWater` (20 s). This addresses a possible timing sensitivity; it is not the confirmed cause of the CI failure.
  - `ROCKS` in the "deep and high chunks" check grew from spec 15's five rocks to include the spec 20 strata (limestone 22, slate 23, basalt 24) and the spec 26 ores that can host at that depth (28–34). The old list could fail on a legal column.
  - A Node repro of the deterministic smoke assertions for seed 1 (spawn search, the pick-block column, the hardcoded swim spot, the deep rock) passes on current `main`, but that does not establish the CI failure's cause; the annotations subsequently identified the inventory check.

- [~] **T-A3 — Give spec 28 a real budget guard.** Regression guard tightened 2026-10-17; the required **3 ms guard remains open**, coupled to T-J1. Premise corrected: a millisecond assertion did exist (`expect(ms).toBeLessThan(50)`, since `cdff912`) — but 50 ms is 16× the target, so the point stood. Tightened to **15 ms**, about 3× the slowest documented measurement (4.1 ms alone, 5.20 ms best-of-2 in the cloud container): it catches a real regression (the spec 39 tree bug was ~100×) without flaking on a slow laptop under parallel load. A comment in the test records that the 3 ms target is still not met and that the guard tightens toward it when T-J1 lands.

- [x] **T-A4 — Make the timeouts consistent.** Closed 2026-10-17. The rule is documented in a `vite.config.ts` comment: 30 s default; 60 s for mountain-column, strata and ore scans; 120 s for the region-simulation tests. The older positional `}, 30_000)` annotations (spawn, trees) are redundant with the default but harmless and were left alone. No test timing changed.

**Evidence for T-A1** — the failure count is load-dependent, the signature of a timeout rather than a logic bug:

| Run | Files failed | Tests failed |
|---|---|---|
| `npm run check` @ `08314af`, full suite | 8 | 14 |
| `npm run test` @ `08314af`, full suite | 7 | 12 |
| 7 previously-failing files only, @ `08314af` | 4 | 5 |
| `npm run check` @ `adf5aba`, full suite | 6 | 9 |
| `npm run check` @ `adf5aba`, full suite, second run | 5 | 8 |

**Every failure is `Test timed out in 5000ms`. No assertion has ever failed.** `npx vitest run tests/trees.test.ts` alone passes 9/9 in 12.16 s. Reducing the set to 7 files makes `trees`, `batchEdit` and `relight` pass outright, which is contention, not code.

---

## B. Owner decisions — all four closed

- [x] **T-B1 — Tree size.** Closed in `656c247`. Every species now sits inside 8–12 m (`src/config.ts:297`, `HANDOFF.md:61`).
  - **Leftover — closed 2026-10-17:** `TREE_HEIGHT_MIN_M` / `TREE_HEIGHT_MAX_M` (`src/config.ts:89-90`) were referenced nowhere; the species table is hard-coded in blocks. Kept as the band's source of truth: `tests/config.test.ts` now enforces that every species except the bush (small on purpose, owner decision 1) fits inside 8–12 m converted to blocks. The constants are no longer orphans, and the documented band cannot drift silently.

- [x] **T-B2 — Spec numbering.** Closed in `fb17054`. 42 entity system, 43 weather model, 44 survival; specs 29 and 30 written.

- [x] **T-B3 — Biome borders.** Closed in `656c247`. Surface blocks dither over `BIOME_BLEND_BLOCKS` (3).
  - Known limit recorded at `HANDOFF.md:66`: biomes are picked **per 16×16 chunk column**, so borders fall on 4.8 m grid lines. See T-E10.

- [x] **T-B4 — F3 overlay.** Closed in `656c247`, together with T-F6.

---

## C. Manual verification (owner)

Nothing below can be done headless (`HANDOFF.md:45-57`). **This is the real blocker** — every system has only been tested in headless Chromium at ~8 fps on SwiftShader.

- [ ] **T-C1 — 10-minute playtest** with a real mouse and keyboard: pointer lock, mouse look, audio, and stepping up 0.6 m (2-block) ledges. Anything broken jumps the queue.
- [ ] **T-C2 — Clearance.** A 2 m tunnel fits the 1.75 m player; a 1.5 m one does not.
- [ ] **T-C3 — Frame rate on the owner's machine.** The smoke run loads ~3,900 chunks and draws 249 calls (`HANDOFF.md:51`). The owner's CPU is slow (i5-8265U, 4c/8t @ 1.6 GHz). The 8 fps smoke figure is SwiftShader and says nothing about real performance.
- [ ] **T-C4 — Phase 1 manual checks.** Dig a 30 m (100-block) shaft; chunks keep appearing below and the sky shows above. From a valley, hills visible to the full render distance. Save, dig 9 m down, wait 10 s, reload: hotbar, hole and roughly the same time of day return.
- [ ] **T-C5 — Terrain after spec 22 and region simulation.** Peaks at most ~232 m. Check rivers, lakes and region seams from a valley and a ridge. **Caveat:** edits in an existing save may float, because unedited ground regenerates.
- [ ] **T-C6 — River continuity across region seams.** `ROADMAP.md:137` specifies a spike: 50 seams sampled on the debug map, no breaks. This gates the phase 2 "done when".
  - Fallback if it fails: noise-shaped rivers, and use the simulation only for erosion, lakes and moisture.
- [ ] **T-C7 — Look of the new rock and plants.** Limestone, slate, basalt, deepslate and the mushrooms have only been checked as atlas code and in headless smoke.
- [ ] **T-C8 — Tool panel and creative block picker by hand.** Smoke-tested only.
- [ ] **T-C9 — Re-check the four closed decisions by eye.** None has been looked at: tree heights in F3, biome border dithering, and the new F3 lines.

---

## D. Phase 2 — Terrain

- [ ] **T-D1 — Riverbed gravel and clay.** `ROADMAP.md` item 5 tail. Unblocked now that rivers exist (spec 41).
- [ ] **T-D2 — Caves beyond noise.** Item 6. Basic noise caves only. Needs cheese caverns, spaghetti tunnels, noodle tunnels and ravines.
- [ ] **T-D3 — Aquifers.** Item 6. A local water table, so caves below sea level are not all flooded.
- [ ] **T-D4 — Underground lakes and lava pools** at depth. Item 6.
- [ ] **T-D5 — Cave openings that respect rivers and the sea.** Item 6.
- [ ] **T-D6 — Coasts and oceans.** Item 7, not started. Beaches, cliffs, stony shores and sandbars decided by wave exposure; continental shelf dropping to deep ocean.
- [ ] **T-D7 — Horizon LOD.** Item 8, not started, and the reason mountains are capped at 60 m (`HANDOFF.md:72`): taller peaks read as walls until this exists. Coarse heightfield rings out to kilometres, biome-coloured, fading into the chunk meshes.

---

## E. Phase 3 — Biomes and flora

- [x] **T-E1 — Wire `blendSurfaceBlocks` into the generator.** Closed in `656c247`.
- [ ] **T-E2 — Per-vertex colour blending.** The *other* half of `ROADMAP.md` item 3, and still open: grass, foliage and water tints must blend smoothly **per vertex** from a climate colour map. Only the surface **block** choice was blended. No tint code exists in `src/world/biome.ts` or `src/render/`.
- [ ] **T-E3 — Flowers by biome.** Item 6.
- [ ] **T-E4 — Reeds.** Item 6.
- [ ] **T-E5 — Boulders.** Item 6.
- [ ] **T-E6 — Fallen logs.** Item 6.
- [ ] **T-E7 — Lily pads.** Item 6.
- [ ] **T-E8 — Moss.** Item 6.
- [ ] **T-E9 — New blocks and procedural textures** for all of the above. Item 7. Still generated in code, no asset files.

Newly found while auditing:

- [ ] **T-E10 — Biome resolution is per chunk column.** `HANDOFF.md:66` records the limit: biomes are picked per 16×16 chunk column, so borders land on 4.8 m grid lines and dithering only softens them. The doc says "the terrain work should fix the grid itself" — that work is not itemised anywhere.
- [~] **T-E11 — Complete the 16 roadmap tree species.** Five of the missing eight are now implemented in the parametric table: maple, fir, larch, baobab and palm (13 species total). Host biomes mix secondaries deterministically on 30% of tree anchors: temperate deciduous → maple, taiga → larch, snowy taiga → fir, savanna → baobab, rainforest → palm. Tests cover distinct deterministic geometry, connected logs, bounds, height bands and biome wiring. **Still open:** willow, mangrove and saguaro; species-specific silhouettes and owner visual review. Parameter differences alone do not establish that every species looks different in play.
- [x] **T-E12 — Two species are unreachable.** Closed 2026-10-17. `pine` wired to snowy taiga, `dead_snag` to tundra. The audit found the deeper bug: `treeSpeciesAt` grows a species only where the biome's surface block is GRASS, so **`spruce` was unreachable too** (taiga and snowy taiga had DIRT surfaces), and tundra's DIRT would have blocked the dead snag as well. Taiga, snowy taiga and tundra now have GRASS surfaces (soil unchanged). A new invariant test in `tests/biome.test.ts` asserts every species in the table is named by at least one grass-surface biome, so this bug class cannot return silently — including for T-E11's new species. Worldgen change: taiga and tundra columns now grow plants and trees; edits in existing saves may float.
- [ ] **T-E14 — Shrubland and steppe name `bush` on DIRT surfaces**, so no bush grows there (the bush itself stays reachable through the meadow, so the T-E12 invariant test passes). Either give both biomes GRASS surfaces or drop the naming. Found while closing T-E12.
- [x] **T-E13 — Type `treeSpecies` as `TreeSpecies | null`.** Closed 2026-10-17. `BiomeDef.treeSpecies` is typed as the union and the `as` cast in `treeSpecies()` is gone; a biome naming a nonexistent species now fails typecheck.

---

## F. Phase 4 — Sky, seasons and weather

- [ ] **T-F1 — Moon phases.** Spec 33 is partial without them.
- [ ] **T-F2 — Stars that rotate.** Spec 33 is partial without them.
- [ ] **T-F3 — Wet-surface darkening.** `weather.ts` computes `wetness` (`src/render/weather.ts:32-84`) and nothing outside that file reads it. Spec 43/34 is partial without it.
- [ ] **T-F4 — Morning valley fog and humidity haze.** Only the static distance fog exists.
- [ ] **T-F5 — Wind.** Foliage sway in the vertex shader, slanted particles, drifting clouds. Item 4.
- [x] **T-F6 — F3 weather lines.** Closed in `656c247` with T-B4.
- [ ] **T-F7 — Seasonal visuals.** Item 5. Foliage colours shift through the year; deciduous leaves render bare in winter through the shader with no block changes; grass browns in a dry summer.
- [ ] **T-F8 — Smooth lighting.** Item 6, deferred since phase 1. Per-vertex light averaging in the mesher, done together with AO.

---

## G. Phase 5 — Living world

All six sandbox-physics slices (spec 25) are built and tested. One known shortcut and several open items remain.

- [ ] **T-G1 — Save pending falls.** Spec 25 slice 3 says save the ticks; the implementation resumes them with a scan on chunk load instead (`HANDOFF.md:29`). Replace the shortcut.
- [ ] **T-G2 — Snow layers.** 8 heights, building up on exposed tops during snowfall and melting above 0 °C. Ice forms on still water and thaws. Item 2.
- [ ] **T-G3 — Saplings.** Grow into their species' tree through the feature generator, respecting existing blocks. Item 2.
- [ ] **T-G4 — Crops.** Wheat, carrots and potatoes with growth stages, affected by season and temperature. Item 2.
- [ ] **T-G5 — Plants succeeding each other** on bare ground. Item 2.
- [ ] **T-G6 — Autumn leaf litter.** Item 2.
- [ ] **T-G7 — Catch-up on reload.** A chunk reloaded after Δt applies expected outcomes directly (crops advanced by Δt × rate, snow set from current weather) instead of replaying ticks. Item 3.
- [ ] **T-G8 — Lava.** Not in the game at all. Needs a slower tick plus per-fluid config properties (density ~3,100 kg/m³, high drag). Items 4 and 5.
- [ ] **T-G9 — Water meeting lava** makes stone, cobblestone or obsidian. Item 4.
- [ ] **T-G10 — Rivers carry a flow direction** from the drainage simulation, used for animated flow textures. Item 4.
- [ ] **T-G11 — Waterfalls** where rivers drop. Item 4.
- [ ] **T-G12 — Currents.** Flowing fluid pushes bodies along its flow vector; strong rivers carry the player; waterfalls push down. Item 5. Was blocked on fluid levels — those now exist.
- [ ] **T-G13 — Water breaks falls.** Impact speed reduced by entry depth, feeding phase 7 fall damage. Item 5.
- [ ] **T-G14 — Lava sets the body on fire**; water extinguishes it. Item 5 tail, needs phase 7 damage.
- [ ] **T-G15 — Rendering for the above:** fluid surfaces and flowing animation, snow layers. Item 6.

---

## H. Phase 6 — Creatures

- [ ] **T-H1 — Wire `entity.ts` into the game.** `src/world/entity.ts` is a pure entity system with gravity and collision (spec 42) and has **zero importers** in `src/`. This is the phase 6 entry point.
- [ ] **T-H2 — Per-chunk persistence**, despawn and respawn rules. Item 1.
- [ ] **T-H3 — Shared physics.** Reuse the player AABB sweep including step-up. Bodies in sizes of 1, 2 and 3 blocks tall. Item 2.
- [ ] **T-H4 — Models.** Procedural textured cuboids with walk, idle and eat animations. Item 3.
- [ ] **T-H5 — AI.** Utility-scored behaviours: wander, graze, flee, herd (boids), hunt, sleep, follow. Activity changes with day/night and season. Item 4.
- [ ] **T-H6 — A\* pathfinding** on the voxel grid, respecting body height, jump and fall limits. Item 4.
- [ ] **T-H7 — Wildlife by biome.** Deer, rabbits, boars, wolves (predator and prey), bears, foxes, sheep, cows, mountain goats, desert camels, fish, bird flocks (cosmetic). Item 5.
- [ ] **T-H8 — Population caps** per biome; spawn with world generation and slowly repopulate. Item 5.
- [ ] **T-H9 — Hostile mobs** at night and in dark caves (light < 7), with melee combat and knockback. Item 6.
- [ ] **T-H10 — Creature sounds.** Item 7.

---

## I. Phase 7 — Survival

- [x] **T-I1 — UI to pick the game mode.** Landed in `38c07f8` (committed after this list was drafted, checkbox missed): a Creative/Survival picker (radio group) in the start and pause menu; switching to survival tops health and hunger back up; the mode persists through the save meta. Reviewed 2026-10-17, one follow-up fixed: `debugApi.setGameMode` assigned `game.gameMode` directly, bypassing the menu sync and the vitals top-up; it now delegates to `Game.setGameMode`.
- [ ] **T-I2 — Make hunger change.** Set, saved, loaded and shown (`src/game.ts:111`, `:186`, `:392`), but no rule anywhere writes it. No food, no starvation.
- [ ] **T-I3 — Health regeneration.** Item 2.
- [ ] **T-I4 — Body temperature.** Item 2. From biome, altitude, weather, season, wetness, shelter, fire and clothing; hypothermia and heatstroke. `ROADMAP.md:290` calls this where the whole simulation pays off.
- [ ] **T-I5 — Tools.** Mining time from block hardness **and** tool. Tiers and durability. Items 3 and 5.
- [ ] **T-I6 — Crafting.** 2×2 grid in the inventory, 3×3 crafting table, recipes as a data table. Item 5.
- [ ] **T-I7 — Furnaces** that smelt, as a block entity with timers. Item 5.
- [ ] **T-I8 — Food.** Hunting, farming, cooking. Item 6.
- [ ] **T-I9 — Beds** to sleep through the night and set a spawn point. Item 7.
- [ ] **T-I10 — Inventory-backed hotbar** in survival. Item 4.

---

## J. Phase 8 — Scale and performance

- [ ] **T-J1 — Mesh time 4.1 ms → 3 ms.** Spec 28. Open, and unguarded — see T-A3.
- [ ] **T-J2 — Section visibility culling** ("cave culling" via per-chunk face connectivity).
- [ ] **T-J3 — Fewer draw calls** through batched buffers.
- [ ] **T-J4 — Packed vertex format:** positions as bytes, packed light and colour.
- [ ] **T-J5 — Palette compression** for chunk storage.
- [ ] **T-J6 — Adaptive time budgets** and memory caps.
- [ ] **T-J7 — Quality presets.**
- [ ] **T-J8 — Frame-time graph in F3.**
- [ ] **T-J9 — Chunk generation ≤ 3 ms.** `ROADMAP.md` phase 2 "done when" sets this budget for generating one chunk in a worker. It has no measurement and no guard anywhere.
- [ ] **T-J10 — Re-measure cold column generation.** ~8.4 ms median in Node, taken *before* region simulation landed (`HANDOFF.md:193`).
- [ ] **T-J11 — Re-measure the spawn search.** ~200 ms per seed; `tests/spawn.test.ts` ~6 s for 30 seeds (`HANDOFF.md:194`).
- [ ] **T-J12 — Re-measure region simulation.** ~162 ms per region on seed 1337 (`HANDOFF.md:195`).
- [ ] **T-J13 — Edit remesh cost.** A single edit remeshes up to 8 chunks on the main thread, ~3 ms each (`HANDOFF.md:201`). Worse now that block updates run at 20 Hz.

---

## K. Plans not started

**`volumetric-tools.md` is fully built** — parts 1, 2 and 3 all landed (`World.setBlocks` at `src/world/world.ts:227`, `ToolKind` covering box/sphere/plane/wall/floor/roof/flatten at `src/player/buildTool.ts:23`, plus undo via `UNDO_LIMIT`). Nothing left from it. See T-L8.

**`slabs-inventory-gui.md` is not started.** Biggest single gap between the plan and the code.

- [ ] **T-K1 — Slab shape.** `BlockShape` is `'cube' | 'cross'` (`src/world/blocks.ts:92`) and no `SLAB` constant exists in `src/config.ts`. Needs a `slab` with `bottom`/`top` halves at 0.15 m, via `metersToBlocks`.
  - **Largest core change:** `isSolidAt` returns one yes/no per cell (`src/game.ts:263`), so a slab would block the whole cell. The sweep in `src/player/physics.ts` (`moveAndCollide`) needs each cell's solid height range (0–0.5 or 0.5–1 of the cell).
  - A walker can already step onto a 0.15 m slab; the step-up limit is 0.6 m.
  - `src/player/placementTarget.ts` does not exist yet and the plan puts placement logic there.
  - Planned shortcut to accept or reject: slabs never cull neighbour faces and never block light.
  - Default materials: planks, cobblestone, stone, sandstone, limestone. Owner's choice.
- [ ] **T-K2 — Slab items and icons**, drawn with `drawBlockIcon`, stacking normally. Note the plan cites `src/ui/hud.ts`, which is now `src/ui/hud.tsx`.
- [ ] **T-K3 — Inventory access root cause.** Partly worked around (HUD key hints, a pause-menu button) but the cause was never confirmed: E only works while the pointer is captured, since `src/game.ts:399` reads the key and `:401` gates on `this.playing`. The refusal path is dead too: `src/input/input.ts:40-42` catches the rejected lock and calls `emitLockFailed`, but `onPointerLockFailed` (`input.ts:46`) has **zero callers** anywhere in the repo, so the listener list is always empty. The comment at `input.ts:34` promises "the menu can say" — nothing registers. The plan flags this as a strong hypothesis, not a confirmed bug.
- [ ] **T-K4 — A proper GUI.** Planning only, per the plan doc.

From `ROADMAP.md` "Later":

- [ ] **T-K5 — Building tools:** fill, copy and paste; stairs, doors; world export and import. Undo/redo and the volume tools are done.
- [ ] **T-K6 — Input and platform:** gamepad, touch controls, PWA.
- [ ] **T-K7 — Multiplayer.** Parked, no action.

---

## L. Documentation hygiene

- [x] **T-L1 — Stale commit hash.** Closed in `38c07f8` (work recorded in `log.txt`; the checkbox was missed there): `HANDOFF.md:3` now verifies against `adf5aba`.
- [x] **T-L2 — Contradictory test counts.** Closed in `38c07f8`: the Commands section says 464 in 55 files. (This session's changes raise it to 467; the line is updated with the next handoff edit.)
- [x] **T-L3 — Self-contradiction on physics.** Closed in `38c07f8`: the "Known gaps" line now lists the actually-open items (snow, saplings, crops, catch-up, lava) instead of contradicting the phase list.
- [x] **T-L4 — Unqualified pass claim.** Closed in `38c07f8`: `HANDOFF.md:43` is qualified — CI `check` green, CI `smoke` red, see T-A2/T-A2a.
- [x] **T-L7 — Missing test-case sections, restated accurately.** Closed 2026-10-17, with this task's own count corrected: a direct scan finds **16** files with no test-case section — 10, 28 and 31–44. Specs 25, 29 and 30 *do* have test-case lists (25's is per slice), so the "19 including 25, 29, 30" figure was wrong. The `docs/specs/README.md` bullet now states the 16-file list.
- [x] **T-L8 — Mark `volumetric-tools.md` done.** Closed 2026-10-17: a status header on the plan names what landed; the file stays as the design record.
- [x] **T-L11 — Specs 34 and 43 are both titled "Weather model".** Raised in `log.txt`, tracked here. Closed 2026-10-17: cross-reference notes at the top of both files split the record — 43 is the reference for the pure `WeatherModel`, 34 owns the rendering half and wins nothing about the model.
- [x] **T-L9 — Three stale rows in `docs/specs/README.md`**, left behind by `656c247`. Closed in `38c07f8`:
  - `35-biome-integration.md` still says "Partial — Border blending is not wired". It is wired.
  - `37-tree-species.md` still says "Done, sizes open — trees are 4.8-7.2 m (oak)". Oak is now 8.1–12.0 m.
  - `34-weather-model.md` still says "the F3 weather lines are missing". They exist.
- [x] **T-L10 — Dangling cross-reference in `HANDOFF.md:190`.** Closed in `38c07f8`: it now points at "Decided (owner approved, 2026-10-17)".
- [x] **T-L5 — Duplicate spec numbers.** Closed in `fb17054`.
- [x] **T-L6 — Missing spec files.** Closed in `fb17054`.

---

## Suggested order

1. **T-A1, T-A2** — a red suite hides every other defect. Nothing below can be trusted until this is settled.
2. **T-C1** — the 10-minute playtest. Everything so far is headless-only, so this may surface bugs that outrank everything here. Pair it with **T-C9**, since none of the four approved fixes has been looked at by a human.
3. **T-I1** — survival mode is unreachable by a player. Small, and it makes a whole phase testable.
4. **T-L1 … T-L4, T-L9, T-L10** — cheap, and they stop the next handoff repeating these findings.
5. **T-E11, T-E12, T-E13** — the species list is half-built and two entries are dead. The tree-size decision just landed; finishing the table is the natural follow-on.
6. Then the phase work, in roadmap order: **T-D** → **T-E** → **T-F** → **T-G** → **T-H** → **T-I** → **T-J**.
7. **T-K** (slabs) is independent of the phases and can run in parallel; it is the largest single piece of new work in the plans.

## Latest verification notes

- PR #30 CI on `a0456dc`: check passed; smoke failed during **“E opens the inventory and Escape closes it”**. The new annotations successfully exposed the failure. Earlier attribution to pick-block timing was a hypothesis, not the confirmed CI cause.
- Local browser support was recovered using a Chromium binary distributed via npm, installed outside the repository (no dependency changes). Chromium 153 differs from CI's Playwright-pinned browser. Full smoke reproduced the same inventory failure; the inventory check alone passed. T-A2a remains open while the sequence-dependent failure is isolated.
- The T-B1 test was reviewed again: it now compares actual metre heights directly rather than rounding the minimum down, which had incorrectly allowed a 7.8 m tree.
