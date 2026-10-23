# Spec 39: Biome integration fix (review of spec 35)

**Goal:** Biomes actually follow climate in the generated world. Before this, every land column in the game was classified as `tundra` (or `scree` on steep ground): the other ~28 biomes in the table were unreachable, so the whole surface was dirt and every "tree" was an oak stamped anywhere.

**Why:** Spec 35 (biome integration) connected `biomeAt` to the generator, but passed it the raw climate *fields* (`[-1, 1]`) where it expects temperature in °C and precipitation in mm/year. Every column then matched the `tundra` rule (`temp < 5 && temp >= -10 && precip < 500`), so the Whittaker table below it was dead code. A `?? 'oak'` fallback hid the second half of the bug by growing oak even where a biome grows no trees.

**What changed:**
- `src/world/generator.ts`
  - Column biome now uses `blockTemperature(fields, heightM)` and `blockPrecipitation(fields, detailAmpM)` (real °C and mm/year), plus the real weirdness field.
  - Plants only grow on a grass surface, so beaches, deserts and bare rock stay bare.
  - Trees grow only where the biome names a species *and* the surface is grass; no more oak on sand or dirt.
  - New public `treeSpeciesAt(x, z)` and `biomeKeyAt(x, z)` accessors so tools and tests ask the generator the same question it asks itself. `placeTreeFromAnchor` uses `treeSpeciesAt`.
- `tests/trees.test.ts`: the cross-chunk seamlessness test uses `treeSpeciesAt` so it matches the generated species.
- `tests/generator.test.ts`: new integration test — a wide scan must find more than three biomes (the old bug produced two).

**Also in this change (test robustness):** the three wall-clock performance tests (`generator`, `mesher`, `litMesher`) measured a mean over a few runs, which tracks machine load as much as the code when vitest runs files in parallel, and flaked red. They now measure the fastest run (min), which is robust to preemption and still catches a real slowdown (the tree regression was ~100×).

**Acceptance:** `npm run check` passes; a wide seed-1 scan finds several distinct biomes; deserts and beaches have no plants or oak.
