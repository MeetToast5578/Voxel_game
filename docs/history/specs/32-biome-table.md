# Spec 32: Biome table (Whittaker diagram)

**Goal:** Assign a biome to every land column from temperature and precipitation (the Whittaker diagram), modified by height, slope, water, and weirdness. About 25 biomes across oceans, coasts, open land, forests, cold/high, and rare types.

**Why:** Phase 3 item 2 of the roadmap. Builds on spec 31 (climate at block resolution). Prerequisite for biome-specific surface blocks, tree species, and flowers by biome.

**Scope (ponytail):**
- `src/world/biome.ts` (pure): `BiomeRegistry`, `BiomeDef`, `biomeAt(temperatureC, precipitationMm, heightM, detailAmpM, isWater, weirdness)` returning a biome key.
- ~25 biomes: warm/temperate/cold/frozen ocean, beach, stony shore, river, lake, swamp, mangrove, plains, meadow, steppe, savanna, shrubland, desert, badlands, temperate deciduous, birch, old-growth dark forest, taiga, snowy taiga, tropical rainforest, tundra, alpine meadow, scree/bare rock, glacier, volcanic.
- Whittaker diagram: temperature (cold → hot) × precipitation (dry → wet), with height/slope overrides (alpine above snow line, scree on steep ground).
- Config: biome temperature/precipitation bounds, snow line height, steep slope threshold.
- No caller integration yet (no blocks change). No blending yet (that's spec 33).
- Tests: Whittaker lookups at key points, height overrides, water overrides, determinism, all biomes reachable.

**Out of scope:**
- Biome-specific surface blocks (waits for biome integration in generator).
- Biome blending/dithering at borders (spec 33).
- Seasonal biome shifts (phase 4).
- Tree species by biome (spec 33+).

**Files:** `src/world/biome.ts` (new), `src/config.ts`, `tests/biome.test.ts` (new).

**Acceptance criteria:**
- `npm run check` passes.
- `tests/biome.test.ts`: Whittaker lookups return expected biomes at key (temp, precip) points; height overrides put alpine/tundra at high elevation; water returns ocean variants; same inputs → same biome; all 25 biomes are reachable.
- No existing tests break.
