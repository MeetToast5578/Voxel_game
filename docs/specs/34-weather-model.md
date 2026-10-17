# Spec 34: Weather model and rendering

**Goal:** Deterministic weather that drifts across the world: pressure systems, cloud cover, precipitation type (rain/snow/sleet) chosen by temperature, and weather rendering (clouds matching coverage, rain/snow particles blocked by column tops, wet-surface darkening, morning fog). All pure functions of seed, position, and time — nothing to save.

**Why:** Phase 4 item 3 of the roadmap. Builds on spec 29 (calendar/seasons) and spec 33 (sky rendering). Weather is the last major piece of phase 4 before seasonal visuals.

**Scope (ponytail):**
- `src/world/weather.ts` (pure): `WeatherModel` class. Pressure systems from large-scale noise sampled at positions offset by wind × time. Local factors: humidity, season, orographic lift. Precipitation type: rain/snow/sleet by temperature at altitude. Storms when moisture and heat are high. All deterministic from seed + position + time.
- `src/render/weather.ts` (three.js): `WeatherRenderer` class. Rain/snow particles around the camera, blocked by column tops (no precipitation under a roof). Wet-surface darkening on blocks. Morning valley fog and humidity haze. Lightning with delayed thunder (343 m/s).
- `src/config.ts`: weather constants (pressure system scale, wind speed, precipitation thresholds, lightning delay).
- `src/game.ts`: create WeatherModel and WeatherRenderer, update each frame, pass weather to renderer.
- F3: show temperature, humidity, precipitation type, weather.

**Out of scope:**
- Fluid levels / flowing water (phase 5 item 4) — rain doesn't fill cauldrons or raise water levels yet.
- Snow accumulation on blocks (phase 5 item 2) — snow falls but doesn't build up yet.
- Weather affecting crop growth or animal behavior (later phases).
- Saving weather state — weather is deterministic, regenerated on load.

**Files:** `src/world/weather.ts` (new), `src/render/weather.ts` (new), `src/config.ts`, `src/game.ts`, `tests/weather.test.ts` (new).

**Acceptance criteria:**
- `npm run check` passes.
- `npm run build` passes.
- `tests/weather.test.ts`: pressure systems drift deterministically, precipitation type matches temperature, same seed+position+time gives same weather, storms form when heat+moisture high.
- Weather renders without console errors.
- F3 shows weather info.
