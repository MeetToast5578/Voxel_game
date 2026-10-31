# Open tasks: Voxel Game

> **Historical (2026-10-31):** this file describes the old 0.3 m game, which was deleted when the 0.6 m rewrite
> replaced it (spec 54, phase 12). Paths such as `src/world/…` and `tests/` refer to code that no longer exists.
> Current state: `docs/HANDOFF.md` and `docs/specs/54-engine-rewrite.md`.

Status on 2026-10-24, against `origin/main` at `178e8df`. `npm run check` passes: typecheck, 777 tests in 95 files, and the production build.

This is a short, grouped list to work from. The detailed tracker is `docs/tasks.md`, and the IDs here match it. When an item closes, tick it here and there.

Legend: `[ ]` open, `[~]` partly done, `[x]` done since this list was written.

---

## 1. Owner acceptance

Headless tests cannot close these. Run them with `npm run dev` on your own machine (see `docs/HANDOFF.md`).

- [ ] **T-C1 — 10-minute playtest.** Real mouse and keyboard: pointer lock, mouse look, audio, and stepping up 0.6 m (2-block) ledges. Anything broken goes to the top of the queue.
- [ ] **T-C2 — Clearance.** A 2 m tunnel fits the player; a 1.5 m one does not. Headless proxy passes (`tests/player.test.ts`, 2026-10-24); confirm by eye.
- [ ] **T-C3 — Frame rate on your machine.** Target hardware is an i5-8265U (4c/8t, 1.6 GHz). The 8 fps smoke figure is SwiftShader and says nothing about real performance.
- [ ] **T-C4 — Phase 1 manual checks.** Dig a 30 m (100-block) shaft: chunks keep appearing below and the sky shows above. From a valley, hills show to the full render distance. Save, dig 9 m down, wait 10 s, reload: hotbar, hole and roughly the same time of day return.
- [ ] **T-C5 — Terrain after spec 22 and region simulation.** Peaks at most about 232 m (headless proxy 2026-10-24, seed 1, 4 × 4 regions: highest surface 168.6 m). Check rivers, lakes and region seams from a valley and from a ridge. Caveat: edits in an existing save may float, because unedited ground regenerates.
- [ ] **T-C6 — River continuity across region seams.** Sample 50 seams on the debug map; there must be no breaks. This gates the Phase 2 "done when". Spec 51's synthetic checks do not replace it. **Headless proxy 2026-10-24 found breaks:** on seed 1, 8 of 25 river crossings of region seams break, e.g. a river ends at the z = 2048 seam near x = -976, and one stops 16 blocks short of the x = -2048 seam near z = 912 and resumes on the other side. Likely cause: each region's drainage is simulated alone, so a river whose catchment reaches past the region's margin gets too little flow on one side. Fixing it changes how rivers are computed (larger margins, inflow from neighbours, or a coarse global drainage pass), so it needs an owner decision.
- [ ] **T-C7 — Look of new rock and plants.** Limestone, slate, basalt, deepslate and mushrooms.
- [ ] **T-C8 — Tool panel and creative block picker.** Only smoke-tested so far.
- [ ] **T-C9 — Re-check the four closed decisions by eye.** Tree heights in F3, biome border dithering, and the new F3 lines.
- [~] **T-E11b — Owner visual review of the 16 tree species in-game.** Completes T-E11 (section 2).
- [~] **T-K3 — Inventory access.** The HUD button and E key work headless. The original physical-browser complaint is not yet confirmed closed.
- [~] **T-K4 — GUI on a physical browser.** Captures at four sizes and touch and keyboard tests pass; owner acceptance is open.
- [~] **T-K6 — Installed PWA.** Needs HTTPS or localhost and one completed online install.

---

## 2. Terrain and performance

- [~] **T-D7 — Horizon LOD.** Spec 51 fixed the big seams. Still open: coarse distant coastlines are approximate, distant vegetation and buildings are missing, and owner visual acceptance is pending. See `docs/specs/51-terrain-visual-acceptance.md`.
- [~] **T-E11 — 16 tree species.** All 16 are implemented. Only the owner review (T-E11b) remains.
- [~] **T-J9 — Chunk generation at or under 3 ms.** Warm generation is guarded in CI (mean 1.365 ms). Cold region and column preparation is still over 3 ms, and the full cold streaming path is not measured within budget.
- [~] **T-J14 — Dense-forest mesh budget.** Re-measured 2026-10-24 here: forest (216,-140) 1.91/1.31 ms and (240,-108) 1.99/2.86 ms generation/meshing, all under 3 ms. Re-run on owner hardware before closing.
- [x] **T-J13 — Edit remesh cost.** Done: an edit remeshes at once only the chunks the cell faces (at most 4, was 8); edge and corner chunks, which only change shading, wait for the budgeted queue.
- [ ] **T-J2 — Section visibility culling** (cave culling via per-chunk face connectivity).
- [ ] **T-J3 — Fewer draw calls** through batched buffers.
- [ ] **T-J4 — Packed vertex format** (positions as bytes, packed light and colour).
- [ ] **T-J5 — Palette compression** for chunk storage.
- [x] **T-J6 — Adaptive time budgets and memory caps.** Done: chunk budgets shrink to half on slow frames (`chunkWorkShare`); over `MAX_LOADED_CHUNKS` (10,000) the render distance steps down, and back up once well under (`src/world/budgets.ts`).
- [x] **T-J7 — Quality presets.** Done: Low, Medium and High set render distance and the new resolution setting.
- [x] **T-J8 — Frame-time graph in F3.** Done: the last 120 frames as bars against the 60 and 30 fps budgets, plus average and worst.

Measure first (T-C3), then pick the J items that the measurements point at. T-J2 to T-J5 are big engine changes with no measured need yet (meshing 1.2 ms, generation 0.9 ms, 100 to 350 draw calls here), so they wait for the owner-hardware numbers.

---

## 3. Visuals and weather

- [x] **T-F5 — Wind.** Done: foliage sway, slanted rain and snow, wind-driven clouds.
- [x] **T-F7 — Seasonal visuals.** Done: autumn colour, bare winter leaves (decided by climate) and dry summer grass.
- [x] **T-F8 — Smooth lighting.** Done: per-corner light averaging with the AO samples.
- [x] **T-F14 — Lightning flashes and delayed thunder.** Done in #40.

---

## 4. Living world

- [x] **T-G2 — Snow layers.** Done: 8 snow layers that settle and melt, and ice that forms and thaws.
- [x] **T-G3 — Saplings.** Done: leaves drop saplings, which grow into their species' tree.
- [x] **T-G4 — Crops.** Done: wheat, carrots and potatoes that grow by stage with the temperature.
- [x] **T-G5 — Plant succession.** Done: bare open grass regrows its natural plant; tall grass and ferns where trees grow become saplings.
- [x] **T-G6 — Autumn leaf litter.** Done: leaves drop a thin litter layer in autumn where trees are deciduous; it rots after autumn and snow buries it.
- [x] **T-G7 — Catch-up on reload.** Done: a reloaded surface or edited chunk advances crops by the expected stages and moves snow and ice toward the current weather. Shortcut: the weather at reload stands for the whole absence; saplings and litter wait until loaded.
- [x] **T-G10 — River flow direction.** Done: river water pushes swimmers downstream (`RIVER_CURRENT`) and its ripples drift with the drainage simulation's flow.
- [x] **T-G11 — Waterfalls.** Done: where a river drops 0.6 m or more between columns, falling water fills the drop.
- [x] **T-G12 — Currents.** Done: flowing and falling fluid pushes the player and loose bodies. Rivers push too since T-G10, and dropped items drift along.
- [~] **T-G15 — Fluid and snow rendering.** Lava rendering is done. Snow layers render (T-G2). Water is animated: ripples follow the flow, and waterfall sides stream down. Still open: lava animation (lava draws with the solid blocks, whose per-vertex slot is taken).

---

## 5. Creatures (Phase 6)

- [x] **T-H1 — Entities in the game.** Done: `EntitySystem` is generic and drives `CreatureSystem` (`src/creatures/`).
- [x] **T-H2 — Per-chunk persistence.** Done: a column's creatures are stored when it unloads and come back with it; saved as `creatures` and `creatureColumns`. Hostiles are not saved.
- [x] **T-H3 — Shared physics.** Done: `moveAndCollide` with step-up (0.6 m, as the player), for bodies of every size.
- [x] **T-H4 — Models.** Done: textured cuboids per species, with walking legs, idle, grazing head and folded legs asleep; all creatures are one dynamic mesh (one draw call).
- [x] **T-H5 — AI.** Done: utility-scored wander, graze, flee, herd (boids), hunt, sleep and follow (wheat); day or night activity; bears hibernate in winter.
- [x] **T-H6 — A\* pathfinding.** Done: `findPath`, with body height, step and fall limits, for hunting and following round obstacles.
- [x] **T-H7 — Wildlife by biome.** Done: deer, rabbits, boars, wolves, bears, foxes, sheep, cows, mountain goats, camels, fish and bird flocks.
- [x] **T-H8 — Population caps.** Done: each column gets a group when first seen; repopulation near the player; caps per species within 48 m.
- [x] **T-H9 — Hostile mobs.** Done: zombies at night and in dark caves, melee bites with knockback; the player hits back with left click (tools hit harder). Shortcut: darkness is judged from the sky and nearby light sources.
- [x] **T-H10 — Creature sounds.** Done: calls pitched per species and a hurt sound.

Done when (roadmap): a meadow at dawn has grazing herds that flee when approached, wolves hunt, hostile mobs appear at night, and 100+ entities run within the frame budget.

---

## 6. Survival (Phase 7)

- [x] **T-I11 — Enforce survival acquisition rules.** Done in #39. Dying now respawns with an empty inventory (owner decision, 2026-10-23).
- [x] **T-I2 — Make hunger change.** Done in #41: hunger drains, starvation damages, and a survival HUD line shows health and hunger. Food is T-I8.
- [x] **T-I3 — Health regeneration.** Done in #41.
- [x] **T-I4 — Body temperature.** Done: climate, season, altitude, wind, wetness, a roof and nearby lava or light sources; hypothermia below 35 °C and heatstroke above 39.5 °C. No clothing yet, and the body temperature is not saved.
- [x] **T-I5 — Tools.** Done: wooden and stone pickaxes, axes and shovels; the right tool divides break time by its tier; wear is the state variant. In survival stone-like blocks need a pickaxe to drop. Iron tools (speed 6, 250 uses) come from furnace ingots.
- [x] **T-I6 — Crafting.** Done: 2×2 grid in the inventory, 3×3 at the crafting table, recipes in `src/player/crafting.ts`. Beds are now craftable (wheat over planks).
- [x] **T-I7 — Furnaces.** Done: crafted from eight cobblestone; input, fuel and output with timers (`src/player/furnace.ts`), saved as `furnaces`, running while unloaded. Smelts iron ore, sand, cobblestone, clay, logs (to coal) and potatoes. Coal ore drops coal. Iron tools follow.
- [~] **T-I8 — Food.** Farming slice done: in survival, right click with a crop eats it (wheat 2, carrots 3, potatoes 4 hunger) unless aimed at grass or dirt, where it is planted. Cooking done: a furnace bakes potatoes (6 hunger). Hunting done: animals drop raw meat (3), which a furnace cooks (8).
- [x] **T-I9 — Beds.** Done: a half-height bed; right click sets the respawn point and, while the sun is down, sleeps to sunrise. Crafted from three wheat over three planks.

Done when (roadmap): a new survival world is playable from punching a tree through to iron tools, and a winter is dangerous without shelter.

---

## 7. Building and platform

- [x] **T-K5 — Building tools.** Done: fill, undo, redo, copy/paste, world export/import, stairs for every cube block (they climb away from the placer) and doors (2 × 7 cells, 0.6 × 2.1 m; right click opens the whole door). Shortcut: a closed door collides as whole cells.
- [x] **T-K6 — Input (code part).** Done: gamepad (`src/input/gamepad.ts`, standard mapping) and in-world touch controls (`src/ui/touchControls.ts`: stick, drag to look, jump, break, place, fly, slots, pause). Both play without pointer capture. Not done: navigating menus and the inventory with a gamepad (they need a pointer). Installed-browser review stays with the owner checks.
- [ ] **T-K8 — Pixel Aero HUD.** A separate HUD track described in `docs/pixel-aero-hud/README_FOR_CODEX.md`. Keep the nine-slot model, and do not mix it into the existing Preact GUI.

---

## 8. Parked

- [ ] **T-K7 — Multiplayer.** Parked. No action.

---

## 9. Code debt

- [ ] **Steepness shortcut** at `src/world/generator.ts:319`. Steepness is used as the detail amplitude, not the real slope, so lumpy flat ground can be left bare. Upgrade to finite differences if it looks wrong. This is from the code comment, not from `tasks.md`.

---

## Suggested order

`docs/tasks.md` has its own "next priorities". This order follows it, with two changes I'd suggest:

1. **T-C1 playtest and T-C3 frame-rate check.** Their results may reorder everything else.
2. **T-I11 survival gating.** It affects what players can do today.
3. **Terrain:** T-C6 river seams (gates Phase 2), then decide T-D7, T-J9 and T-J14.
4. **Visuals:** T-F5, then T-F7, T-F8, T-F14.
5. **Living world:** T-G2 to T-G6, then T-G7.
6. **Creatures:** T-H1 first, then T-H2 onward.
7. **Survival and building:** T-I2 to T-I9, T-K5 and T-K6 code parts.

T-K8 (Pixel Aero) can run alongside any of these.

---

## Where the docs disagree

- **T-J14 forest guard.** Settled 2026-10-24: re-run here, both forest fixtures pass (see T-J14). The HANDOFF note that it is over 3 ms is out of date.
- **Tree sizes.** `docs/ROADMAP.md` (Phase 1b, dated 2026-10-17) still says 4.8–7.2 m. `docs/tasks.md` (T-B1) says the fix to 8–12 m is closed. The roadmap is out of date.
- **`docs/REFERENCE-GAPS.md`** is dated 2026-10-15. Many of its "open" items are done now. Treat it as history.
