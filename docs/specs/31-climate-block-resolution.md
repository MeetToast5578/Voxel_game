# Spec 31: Climate model at block resolution

**Goal:** Temperature and precipitation are available at block resolution, derived from the climate/shape fields (spec 12). Temperature = base field − altitude lapse rate (6.5 °C per km). Precipitation comes from the humidity field, modified by orographic lift (windward slopes wetter, rain shadow drier).

**Why:** Phase 3 item 1 of the roadmap. This is the prerequisite for biome assignment (item 2) and flowers by biome. Everything else (trees, terrain features) is already placed without climate.

**Scope (ponytail):**
- `src/world/climate.ts` (pure): `blockTemperature(wx, wy, wz, fields)` and `blockPrecipitation(wx, wy, wz, fields)` functions.
- Temperature: `temperature field − (heightM / 1000) × 6.5`, clamped to a reasonable range.
- Precipitation: `humidity field` modified by orographic lift based on column detail amplitude (steeper = wetter windward, drier leeward).
- Config: `TEMPERATURE_LAPSE_M_PER_C = 6.5` (6.5 °C per km), `OROGRAPHIC_LIFT_M = 0.2` (precipitation boost factor per unit of amplitude).
- No biome table yet (that's item 2). No seasonal variation yet (that's phase 4).
- Tests: determinism, temperature decreases with altitude, precipitation varies with humidity, same inputs give same outputs.

**Out of scope:**
- Biome table (item 2, next spec).
- Seasonal temperature variation (phase 4).
- Using climate for anything yet (no callers changed except tests).

**Files:** `src/world/climate.ts` (new), `src/config.ts`, `tests/climate.test.ts` (new).

**Acceptance criteria:**
- `npm run check` passes.
- `tests/climate.test.ts`: temperature decreases with altitude at constant field, precipitation scales with humidity, same inputs → same outputs, outputs are finite numbers.
- No existing tests break.
