# Handoff: Voxel Game (MeetToast5578/Voxel_game)

Last updated 2026-10-15. Read this first, then `docs/ROADMAP.md` and the specs in `docs/specs/`.

## Start here: the world generation is wrong

The owner says the world generation is "messed up" after spec 13. They have not said what they see. **Ask them first**
for specifics: which look is wrong, where (coordinates or a screenshot), and whether it is slow loading, shape or
something else. Do not guess a fix before knowing the symptom.

What was observed on 2026-10-15 (seed 1, spawn at about (−26.5, 8, −26.5)):

- **Terraced look on gentle slopes.** Screenshots show flat horizontal bands of grass and dirt. The surface heights are
  smooth (8 → 6 blocks over 20 blocks, so one step every three blocks). The bands are whole-block steps. It may not be
  a bug, but it reads as one.
- **Slow generation.** `generateChunk` takes about 8 ms, against 2.5 ms before spec 13 (six climate fields per column,
  where there were two noises). On first load the game had about 2,600 chunks pending at 15 fps. The main-thread budget
  is 4 ms per frame, so this is only hidden by Web Workers.
- **Mountains.** The tallest column within about 450 m of spawn is 770 m, at (−990, −1500). Nobody has looked at it
  in the game yet.
- Nothing is reported as broken by the tests or the smoke test. The problem is in how the terrain looks and feels,
  which the tests do not cover.

## Where things stand

- Phase 0 (CI), Phase 1 (cubic chunks, 0.6 m → 0.3 m blocks) and Phase 1b (meter-based scale and trees) are done.
- Phase 2 (terrain), roadmap items:
  1. Debug map (`?map=1`): done, spec 11.
  2. Climate and shape fields: done, spec 12 (`src/world/shape.ts`).
  3. Region simulation (rivers, lakes, erosion, moisture): **not started**. The roadmap says to spike seam continuity
     first. Spec 13 was the switch-over that the item 2 fields needed; it is not item 3.
  4–8. Upsampling, geology, caves, coasts, horizon LOD: not started.
- Phases 3–8 and the Later items: not started. Physics (Phase 5 fluids, buoyancy, currents) is not started.
- Assets: the owner chose **CC0 only, with a license file per asset**. Candidates were found but nothing is imported.
  The README still says there are no asset files. Kenney's Nature Kit (CC0) is the candidate for trees and plants.

## Terrain as it is now

Files:

- `src/world/shape.ts` (pure): six fields, each in [−1, 1], sampled in meters: continentalness (6000 m), erosion
  (1500 m), peaks (700 m, ridged), temperature (4000 m), humidity (3000 m), weirdness (2000 m). `heightMeters(fields)` is
  a spline of continentalness (−300 m deep ocean to 150 m inland), plus `2300 m × land × rugged × ridge` for mountains.
  Temperature, humidity and weirdness are sampled but unused.
- `src/world/generator.ts`: `getHeight(wx, wz)` = `floor(metersToBlocks(heightMeters(...)))`, clamped to the band.
  Heights are cached per column (`columnHeights`, `heightAt`). `fillRange` writes a y range of one column: terrain
  layers (stone below soil, dirt, grass or sand on beaches, water up to y = 0), caves, then trees. Caves are the
  "spaghetti" noise and only carve y ≥ 2. `columnTops` scans chunks from the top down, starting above
  `reachMaxHeight + MAX_TREE_RISE`, and stops once every cell has a sky-blocking block.
- `src/world/trees.ts` (pure): a 2×2 trunk (0.6 m), 4–6 branches that step one axis at a time, a crown from the trunk top
  to the tree top. Heights 8–12 m. Trees are generated whole per anchor and clipped to the chunk being filled, so
  crowns across chunk borders match. There is no slope check: trees can grow on steep mountain sides.

Key numbers (`src/config.ts`): `BLOCK_SIZE_M` 0.3; `CHUNK_SIZE` 16 (4.8 m); `SEA_LEVEL` 0; `TERRAIN_MAX_M` 2450;
`TERRAIN_CHUNK_BOTTOM` −84 (about −400 m; chunks below are stone); `LEGACY_HEIGHT` 8672 and `LEGACY_CHUNKS` 542 (top of
the band, about 2,600 m; the name is from phase 1); `DEFAULT_RENDER_DISTANCE` 8 (about 38 m); `STEP_HEIGHT` 2 blocks
(0.6 m); `TREE_CHANCE` 0.00108 per column.

## Suspects, in order of likelihood

1. **Stepped heights.** Heights are whole blocks, so a slope of one block per three becomes regular steps. Options: keep
   it and say so, or smooth it (for example sub-block surface or a dithered top layer). The owner decides.
2. **Generation cost.** Sample the fields on a coarse grid per column and interpolate, or skip the three unused fields
   until biomes need them. Check `generateChunk` with the timing test in `tests/generator.test.ts` (threshold 30 ms, so
   it will not catch a slowdown; measure in a probe).
3. **Mountain shape.** Erosion and peaks decide how steep and how often mountains appear. Check the slope of the
   2300 m term near the peak above.
4. **Trees on steep ground.** `placeTrees` checks only the anchor column's height and cave state.
5. **Caves.** Only y ≥ 2 is carved, and the rate is about 1% of the underground. Check that caves are not cut open to
   the sky under mountains.

## How to look at the terrain

- `/?map=1&seed=N`: top-down map, 512 px at 31 m per pixel (about 16 km). Blue is sea, green to white is height.
  `src/world/debugMap.ts` is pure and tested.
- In Playwright (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`), the approach that worked here: `preview` from
  `vite` on a free port, then `window.__game` (`ready`, `state()`, `teleport`, `look`, `getBlock`, `setBlock`). Wait for
  `state().areaMeshed` and then `state().onGround` or `state().inWater` before reading. Delete throw-away scripts from
  `scripts/` afterwards.
- Seed 1: nearest deep ocean to spawn is (−40, 84). Seed 42 has land in the window (3..6, −4..−1) at chunk scale.

## Commands and checks

- `npm run check`: typecheck, 197 unit tests in 32 files, build. Must pass before any push.
- `CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run smoke`: all 15 checks pass in this container.
  The one failure is a console 404 for the favicon, which is known (fix: `<link rel="icon" href="data:,">` in
  `index.html`). The smoke script's positions: "deep" at y = −205, "high" at y = 8,400 (above the highest terrain), swim
  at seed 1's ocean (−39.5, 84.5).
- Tests build fixtures with `tests/support/stackedColumn.ts`: `stackedColumn` stacks a column only up to its highest
  sky-blocking block; `landColumns(g, n, minHeight)` picks dry land near the origin (the first columns are ocean now).

## Working rules

- Branch: `claude/serene-brown-4izylj`. Push with `git push -u origin claude/serene-brown-4izylj`. Never force-push.
  If its PR is merged, restart the branch from `origin/main` (`git checkout -B … origin/main`), then push a new PR.
- Commits: `git -c user.name="Yunus Alizade" -c user.email=62231698+MeetToast5578@users.noreply.github.com commit`,
  with the Co-Authored-By and Claude-Session trailers from the session instructions.
- One spec per PR. Specs 12 and 13 were on one branch and one PR (#15) because of that; do not repeat it.
- Pure modules (`core`, `world`, `player`, mesher, `storage`, `ui/debugText`) must not import three.js or the DOM.
- Tunable numbers live in `src/config.ts`. Lengths are in meters and converted with `metersToBlocks`.
- Old PR history: #5–#15 merged. #14 is the debug map, #15 is specs 12 and 13.

## Gotchas

- `hash2` returns a fraction in [0, 1). Never pass it to `mulberry32` as a seed; scale it to a 32-bit integer first.
- `ImageData` in TypeScript 5.9 needs `Uint8ClampedArray<ArrayBuffer>`.
- Vitest is pinned to 4.0.18. Do not upgrade to 4.1.x (`npm install` crashes).
- `toEqual` treats −0 and 0 as different.
- Vitest's default timeout is 5 s. Stacking or generating many columns needs an explicit `{ timeout }`.
- The owner's machine is Windows with a slow CPU. Prefer CI or a cloud session for `npm run check` and `npm run smoke`.
