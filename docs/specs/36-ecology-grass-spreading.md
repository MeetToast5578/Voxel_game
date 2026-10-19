# Spec 36: Ecology rules — grass spreading

**Goal:** Grass spreads onto adjacent lit dirt blocks over time, driven by the tick system. This is the first ecology rule, making the world feel alive as grass gradually colonizes bare dirt.

**Why:** Phase 5, item 2 of the roadmap. Builds on spec 25 (tick core) and spec 35 (biome integration). Grass spreading is the simplest ecology rule and demonstrates the tick system in action.

**Scope (ponytail):**
- `src/world/ecology.ts` (pure): Grass spreading logic. Each tick, for each grass block, check adjacent dirt blocks. If the dirt block is lit (sky light > 0), there's a small chance the dirt becomes grass.
- `src/world/generator.ts`: Register grass spreading as a scheduled tick. When a dirt block is adjacent to grass and lit, schedule a grass-spread tick.
- `src/world/world.ts`: The tick handler for grass spreading checks light level and converts dirt to grass.
- Config: `GRASS_SPREAD_CHANCE` (probability per tick), `GRASS_SPREAD_LIGHT_MIN` (minimum sky light for spread).
- Tests: Grass spreads to adjacent lit dirt, doesn't spread to unlit dirt, doesn't spread to non-dirt blocks, deterministic.

**Out of scope:**
- Sapling growth (needs tree generator integration)
- Leaf decay (needs leaf block tracking)
- Crop growth (needs farming system)
- Grass dying (needs survival/weather integration)

**Files:** `src/world/ecology.ts` (new), `src/world/generator.ts` (modify), `src/world/world.ts` (modify), `src/config.ts` (add constants), `tests/ecology.test.ts` (new).

**Acceptance criteria:**
- `npm run check` passes.
- `tests/ecology.test.ts`: Grass spreads to lit dirt adjacent to grass, doesn't spread to unlit dirt, doesn't spread to stone/other blocks, deterministic.
- Grass spreading ticks are scheduled during world generation.
