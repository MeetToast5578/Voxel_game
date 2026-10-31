# Spec 33: Sky rendering — atmospheric scattering (Phase 4, item 2)

**Goal:** An atmospheric scattering sky shader with sunrise/sunset colours, sun, moon, and stars. The sky colour changes with time of day and season.

**Why:** Phase 4 item 2 of the roadmap. Builds on the existing day/night cycle, calendar, and weather systems. Replaces the current simple sky colour lerp.

**Scope (ponytail):**
- `src/render/sky.ts` (new): `Sky` class — Three.js shader material with atmospheric scattering
- Sky colour: blends day/night colours based on `daylightAt(timeOfDay)` and season
- Sun: directional light + visible sun disc near horizon at sunrise/sunset
- Moon: phase based on time of month, visible at night
- Stars: rotate with time, visible at night
- Integrates with existing `game.ts` render loop (replaces `renderer.setSkyColor` call)

**Out of scope:**
- Clouds (already have decorative cloud layer)
- Weather affecting sky colour (storm darkening) — can be added later
- Volumetric lighting / god rays

**Files:** `src/render/sky.ts` (new), `src/game.ts` (wiring), `src/render/renderer.ts` (optional: remove setSkyColor if unused)

**Acceptance criteria:**
- `npm run check` passes.
- Sky renders without errors.
- Sky colour changes with time of day and season.
- Sun, moon, stars are visible at appropriate times.