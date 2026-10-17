# Spec 43: Weather model (Phase 4, item 3)

**Goal:** A deterministic weather model that produces pressure systems, cloud cover, precipitation, and storms based on seed, position, and time — no state to save. Pure module, unit-tested in Node.

**Why:** Phase 4 item 3 of the roadmap. Weather drives precipitation type (rain/snow/sleet by temperature), storm formation, and feeds weather rendering (clouds, particles, lightning).

**Scope (ponytail):**
- `src/world/weather.ts` (pure, no three.js, no DOM): `WeatherModel` class
- Pressure systems: large-scale simplex noise sampled at positions offset by wind × time, so weather fronts drift across the world
- Local factors: cloud cover and precipitation follow the front field, adjusted by local humidity, season, and orographic lift
- Precipitation type: rain, snow, or sleet chosen by temperature at that altitude
- Storms: form when moisture and heat are high
- All outputs are deterministic: `weather(seed, x, z, timeOfYear, timeOfDay)` returns the same result every time
- Config: `WEATHER_WIND_SPEED_M_S`, `WEATHER_PRESSURE_WAVELENGTH_M`, `WEATHER_STORM_THRESHOLD`

**Out of scope:**
- Weather rendering (clouds, particles, lightning) — Phase 4 item 4
- Weather affecting gameplay (crop growth, snow accumulation) — Phase 5 item 2
- Saving weather state (it's a pure function, nothing to save)

**Files:** `src/world/weather.ts` (new), `tests/weather.test.ts` (new), `src/config.ts` (weather constants)

**Acceptance criteria:**
- `npm run check` passes.
- `tests/weather.test.ts`: determinism (same inputs → same output), pressure systems drift with time, precipitation type by temperature, storms form when moisture and heat are high, no NaN/Infinity outputs.
- Weather model stays pure: no three.js, no DOM imports.