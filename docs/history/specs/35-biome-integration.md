# Spec 35: Biome integration into terrain generator

**Goal:** Make the terrain generator use the biome table (spec 32) to determine surface blocks per biome. Surface blocks vary by biome: deserts have sand, taiga has spruce-like terrain, tundra has bare rock, etc. Surface blocks dither across biome borders for smooth transitions.

**Why:** Phase 3 items 2-3 of the roadmap. The biome table (spec 32) exists but the generator still uses the same surface rules everywhere (grass on soil, sand on beaches, rock below). Biomes should change what grows on the surface.

**Scope (ponytail):**
- `src/world/biome.ts`: Add `surfaceBlock(biomeKey, isBeach, isWater)` returning the default surface block state for a biome. Add `soilBlock(biomeKey)` returning the soil block.
- `src/world/generator.ts`: In `fillRange`, call `biomeAt()` for each column to get the biome, then use `surfaceBlock()` and `soilBlock()` instead of hardcoded GRASS/DIRT. Beach columns still use SAND.
- `src/config.ts`: Add biome-to-surface-block mapping if needed (or hardcode in biome.ts).
- Biome blending: When adjacent columns have different biomes, dither the surface block between them (use a hash of position to decide which biome's surface block to use at the border).
- Tests: surface block matches biome at key locations, dithering at borders, determinism.

**Out of scope:**
- Tree species by biome (spec 36) — needs biome integration first, done separately
- Flowers by biome (phase 3 items 1-2) — needs biome integration first
- Biome-specific foliage colors (phase 4 seasonal visuals)

**Files:** `src/world/biome.ts`, `src/world/generator.ts`, `src/config.ts`, `tests/biome.test.ts` (extend), `tests/generator.test.ts` (extend).

**Acceptance criteria:**
- `npm run check` passes.
- Desert biome has sand surface, taiga has dirt/podzol surface, tundra has bare rock surface.
- Biome blending at borders: adjacent columns with different biomes show a mix of surface blocks.
- Same seed gives same surface blocks (determinism).
- All existing generator tests still pass (trees, ores, caves, strata).
