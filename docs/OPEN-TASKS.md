# Open tasks: Voxel Game

Status on 2026-10-23, against `origin/main` at `08b8582`. `npm run check` passes: typecheck, 680 tests in 80 files, and the production build.

This is a short, grouped list to work from. The detailed tracker is `docs/tasks.md`, and the IDs here match it. When an item closes, tick it here and there.

Legend: `[ ]` open, `[~]` partly done, `[x]` done since this list was written.

---

## 1. Owner acceptance

Headless tests cannot close these. Run them with `npm run dev` on your own machine (see `docs/HANDOFF.md`).

- [ ] **T-C1 — 10-minute playtest.** Real mouse and keyboard: pointer lock, mouse look, audio, and stepping up 0.6 m (2-block) ledges. Anything broken goes to the top of the queue.
- [ ] **T-C2 — Clearance.** A 2 m tunnel fits the player; a 1.5 m one does not.
- [ ] **T-C3 — Frame rate on your machine.** Target hardware is an i5-8265U (4c/8t, 1.6 GHz). The 8 fps smoke figure is SwiftShader and says nothing about real performance.
- [ ] **T-C4 — Phase 1 manual checks.** Dig a 30 m (100-block) shaft: chunks keep appearing below and the sky shows above. From a valley, hills show to the full render distance. Save, dig 9 m down, wait 10 s, reload: hotbar, hole and roughly the same time of day return.
- [ ] **T-C5 — Terrain after spec 22 and region simulation.** Peaks at most about 232 m. Check rivers, lakes and region seams from a valley and from a ridge. Caveat: edits in an existing save may float, because unedited ground regenerates.
- [ ] **T-C6 — River continuity across region seams.** Sample 50 seams on the debug map; there must be no breaks. This gates the Phase 2 "done when". Spec 51's synthetic checks do not replace it.
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
- [~] **T-J14 — Dense-forest mesh budget.** The standard guard passes. The docs disagree about the forest guard (see below). Re-run the benchmark on owner hardware before closing.
- [ ] **T-J13 — Edit remesh cost.** One edit remeshes up to 8 chunks on the main thread, about 3 ms each. Worse now that block updates run at 20 Hz.
- [ ] **T-J2 — Section visibility culling** (cave culling via per-chunk face connectivity).
- [ ] **T-J3 — Fewer draw calls** through batched buffers.
- [ ] **T-J4 — Packed vertex format** (positions as bytes, packed light and colour).
- [ ] **T-J5 — Palette compression** for chunk storage.
- [ ] **T-J6 — Adaptive time budgets and memory caps.**
- [ ] **T-J7 — Quality presets.**
- [ ] **T-J8 — Frame-time graph in F3.**

Measure first (T-C3), then pick the J items that the measurements point at.

---

## 3. Visuals and weather

- [x] **T-F5 — Wind.** Done: foliage sway, slanted rain and snow, wind-driven clouds.
- [ ] **T-F7 — Seasonal visuals.** Foliage colour shifts through the year. Deciduous leaves render bare in winter through the shader, with no block changes. Grass browns in a dry summer.
- [ ] **T-F8 — Smooth lighting.** Per-vertex light averaging in the mesher, done together with ambient occlusion. Mesher core, so build it directly.
- [x] **T-F14 — Lightning flashes and delayed thunder.** Done in #40.

---

## 4. Living world

- [ ] **T-G2 — Snow layers.** 8 heights, built up on exposed tops during snowfall and melted above 0 °C. Ice forms on still water and thaws.
- [ ] **T-G3 — Saplings.** Grow into their species' tree through the feature generator, respecting existing blocks.
- [ ] **T-G4 — Crops.** Wheat, carrots and potatoes with growth stages, affected by season and temperature.
- [ ] **T-G5 — Plant succession** on bare ground.
- [ ] **T-G6 — Autumn leaf litter.**
- [ ] **T-G7 — Catch-up on reload.** A chunk reloaded after Δt applies expected outcomes directly (crops advanced by Δt × rate, snow set from current weather) instead of replaying ticks. Depends on T-G2 and T-G4.
- [ ] **T-G10 — River flow direction** from the drainage simulation, used for animated flow textures.
- [ ] **T-G11 — Waterfalls** where rivers drop.
- [ ] **T-G12 — Currents.** Flowing fluid pushes bodies along its flow vector. Strong rivers carry the player, and waterfalls push down. Not blocked any more, since fluid levels exist.
- [~] **T-G15 — Fluid and snow rendering.** Lava rendering is done. Still open: fluid texture animation and snow layers (depends on T-G2).

---

## 5. Creatures (Phase 6)

- [ ] **T-H1 — Wire `src/world/entity.ts` into the game.** It has gravity and collision (spec 42) but zero importers. Everything below depends on it.
- [ ] **T-H2 — Per-chunk persistence**, despawn and respawn rules.
- [ ] **T-H3 — Shared physics.** Reuse the player AABB sweep, including step-up, for bodies 1, 2 and 3 blocks tall.
- [ ] **T-H4 — Models.** Procedural textured cuboids with walk, idle and eat animations.
- [ ] **T-H5 — AI.** Utility-scored behaviours: wander, graze, flee, herd (boids), hunt, sleep, follow. Activity follows day/night and season.
- [ ] **T-H6 — A\* pathfinding** on the voxel grid, respecting body height and jump and fall limits.
- [ ] **T-H7 — Wildlife by biome.** Deer, rabbits, boars, wolves, bears, foxes, sheep, cows, mountain goats, camels, fish, and bird flocks (cosmetic).
- [ ] **T-H8 — Population caps** per biome. Spawn with world generation and slowly repopulate.
- [ ] **T-H9 — Hostile mobs** at night and in dark caves (light below 7), with melee combat and knockback.
- [ ] **T-H10 — Creature sounds.**

Done when (roadmap): a meadow at dawn has grazing herds that flee when approached, wolves hunt, hostile mobs appear at night, and 100+ entities run within the frame budget.

---

## 6. Survival (Phase 7)

- [x] **T-I11 — Enforce survival acquisition rules.** Done in #39. Open follow-up: dying in survival still refills the starting kit.
- [x] **T-I2 — Make hunger change.** Done in #41: hunger drains, starvation damages, and a survival HUD line shows health and hunger. Food is T-I8.
- [x] **T-I3 — Health regeneration.** Done in #41.
- [ ] **T-I4 — Body temperature.** From biome, altitude, weather, season, wetness, shelter, fire and clothing. Hypothermia and heatstroke.
- [ ] **T-I5 — Tools.** Mining time from block hardness and tool. Tiers and durability.
- [ ] **T-I6 — Crafting.** 2×2 grid in the inventory, 3×3 crafting table, recipes as a data table.
- [ ] **T-I7 — Furnaces** that smelt, as a block entity with timers.
- [ ] **T-I8 — Food.** Hunting, farming and cooking. Depends on T-H7 and T-G4.
- [ ] **T-I9 — Beds** to sleep through the night and set a spawn point.

Done when (roadmap): a new survival world is playable from punching a tree through to iron tools, and a winter is dangerous without shelter.

---

## 7. Building and platform

- [~] **T-K5 — Building tools.** Fill, undo, redo, copy/paste and world export/import are done. Remaining: stairs and doors.
- [~] **T-K6 — Input (code part).** Remaining: gamepad, and in-world touch controls for movement, look and building.
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

- **T-J14 forest guard.** `docs/HANDOFF.md` says the extra forest guard is still slightly over 3 ms. `docs/tasks.md` says all current strict guards pass after spec 51. Re-run the benchmark to settle it.
- **Tree sizes.** `docs/ROADMAP.md` (Phase 1b, dated 2026-10-17) still says 4.8–7.2 m. `docs/tasks.md` (T-B1) says the fix to 8–12 m is closed. The roadmap is out of date.
- **`docs/REFERENCE-GAPS.md`** is dated 2026-10-15. Many of its "open" items are done now. Treat it as history.
