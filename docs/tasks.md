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

- [ ] **T-A2 — Confirm whether CI is actually green.** `HANDOFF.md:43` asserts `npm run check` passes. Nothing here proves it, and the assertion was never machine-checked. If CI is red too, T-A1 is urgent rather than cosmetic.

- [ ] **T-A3 — Give spec 28 a real budget guard.** `tests/litMesher.test.ts:49` (`meshes 50 surface chunks of seed 42 fast enough`) is a 30 s timeout with **no millisecond assertion**. The 3 ms target in `docs/specs/28-mesh-performance.md` is checked by nothing. It is the only performance budget in the codebase with no automated guard.

- [ ] **T-A4 — Make the timeouts consistent.** 21 annotations use three magnitudes (30 s, 60 s, 120 s) with no stated rule. A comment or shared helper would stop the next slow test from being missed.

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
  - **Leftover:** `TREE_HEIGHT_MIN_M` / `TREE_HEIGHT_MAX_M` (`src/config.ts:89-90`) still hold 8 and 12 and are **still referenced nowhere**. The new table is hard-coded in blocks, so the orphaned metric constants remain dead. Delete them or make the table derive from them.

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
- [ ] **T-E11 — 8 of the 16 roadmap tree species do not exist.** `ROADMAP.md:179` names oak, birch, maple, spruce, pine, fir, larch, acacia, baobab, jungle giant, palm, willow, mangrove, saguaro, dead snag and bushes. `TREE_SPECIES` has 8. **Missing: maple, fir, larch, baobab, palm, willow, mangrove, saguaro.** The phase 3 "done when" is "every species looks different", which cannot hold at half the list.
- [ ] **T-E12 — Two species are unreachable.** `pine` and `dead_snag` exist in `TREE_SPECIES` but no biome names either, so neither can ever generate. Either wire them to biomes or drop them.
- [ ] **T-E13 — Type `treeSpecies` as `TreeSpecies | null`.** `src/world/biome.ts:23` declares `treeSpecies: string | null`, looser than the `TreeSpecies` union it feeds. No biome names a missing species today, so there is no live bug — but a future biome entry naming `maple` (see T-E11) would fail silently rather than at compile time.

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

- [ ] **T-I1 — UI to pick the game mode.** `gameMode` exists, is saved and loaded (`src/game.ts:107`, `:184`), defaults to creative, and **nothing in the UI ever sets it** — `src/ui/menu.tsx` has no reference. The mode is unreachable by a player.
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

- [ ] **T-L1 — Stale commit hash.** `HANDOFF.md:3` claims verification against `0322d20`. HEAD is `adf5aba`, eleven commits ahead. The header was not updated by `adf5aba` even though that commit fixed other lines in the same file.
- [ ] **T-L2 — Contradictory test counts.** `HANDOFF.md:90` says "419 in 51 files"; the verification line says 464. The old number survives in Commands.
- [ ] **T-L3 — Self-contradiction on physics.** `HANDOFF.md:198` says "Sandbox physics slices 2-6 are open", while `HANDOFF.md:26` says "all six slices are in code and tested". The line-26 list is correct — each slice is described with its implementation.
- [ ] **T-L4 — Unqualified pass claim.** `HANDOFF.md:43` states `npm run check` passes. It does not on this machine. Qualify it as "passes on CI hardware; times out locally on a 1.6 GHz laptop".
- [ ] **T-L7 — Missing test-case sections, restated accurately.** `docs/specs/README.md:71` claims "specs 28 and 31-41". A direct scan finds **19** files with no test-case section: 10, 25, 28, 29, 30, 31–44. The bullet omits 10, 25, 29, 30 and 42–44, and the two specs written this week (29, 30) have none.
- [ ] **T-L8 — Mark `volumetric-tools.md` done.** The plan reads as future work but all three parts are implemented.
- [ ] **T-L9 — Three stale rows in `docs/specs/README.md`**, left behind by `656c247`:
  - `35-biome-integration.md` still says "Partial — Border blending is not wired". It is wired.
  - `37-tree-species.md` still says "Done, sizes open — trees are 4.8-7.2 m (oak)". Oak is now 8.1–12.0 m.
  - `34-weather-model.md` still says "the F3 weather lines are missing". They exist.
- [ ] **T-L10 — Dangling cross-reference in `HANDOFF.md:190`.** It points the reader at the "Open decisions" section "above", which `adf5aba` renamed to "Decided (owner approved, 2026-10-17)" at line 59.
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