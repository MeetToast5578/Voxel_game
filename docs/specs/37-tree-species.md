# Spec 37: Tree species — parametric species rules

**Goal:** Trees come from parametric species rules rather than one template. Different biomes grow different tree shapes: oaks in temperate forests, spruce in taiga, jungle giants in rainforests, etc. Trees are grown from species rules, not stamped from one template.

**Why:** Phase 3 item 5 of the roadmap. Builds on spec 30 (feature system) and spec 32 (biome table). Currently all trees look the same; this adds species variety.

**Scope (ponytail):**
- `src/world/trees.ts`: Extend tree generation to support species-specific rules. Each species has: trunk height range, trunk width (1×1 or 2×2), branch count/length, leaf cluster radius, and maximum height.
- `src/world/biome.ts`: Add `treeSpecies(biomeKey)` returning a species key, or null if no trees in that biome.
- `src/world/generator.ts`: When placing trees via the feature system, look up the species for the column's biome and pass it to tree generation.
- Species: oak (temperate), spruce (taiga), birch (temperate), jungle giant (tropical), acacia (savanna), pine (cold), dead snag (rare), bush (small).
- Trees only grow on soil columns (not bare rock, not beach), unchanged from spec 18.
- Config: per-species height min/max, branch min/max, blob radius, trunk width.
- Tests: each species produces distinct shape, species maps to expected biome, trees only grow on soil columns.

**Out of scope:**
- Tree growth over time (ecology, phase 5)
- Saplings as items (survival, phase 7)
- Different leaf colors by season (phase 4)
- Different wood planks per species (survival, phase 7)

**Files:** `src/world/trees.ts`, `src/world/biome.ts`, `src/world/generator.ts`, `src/config.ts`, `tests/trees.test.ts` (extend), `tests/biome.test.ts` (extend).

**Acceptance criteria:**
- `npm run check` passes.
- `npm run build` passes.
- Different biomes grow different tree shapes.
- Trees only grow on soil columns (not bare rock, not beach).
- All existing tree tests still pass.
- Determinism: same seed + anchor gives same tree.
