# Spec 33: Sky rendering (atmospheric scattering)

**Goal:** Replace the static sky color with an atmospheric scattering sky shader that shows sunrise/sunset colors, a sun, moon, and stars. The sky color and sun/moon position are driven by the time of day and the calendar (season, solar declination).

**Why:** Phase 4 item 2 of the roadmap. Builds on spec 29 (calendar/seasons). The current sky uses a simple day/night color lerp; this adds a proper atmospheric sky with celestial bodies.

**Scope (ponytail):**
- `src/render/sky.ts` (three.js): a Sky class that creates a sky material (atmospheric scattering approximation), a sun mesh (billboard quad), a moon mesh, and a star field (points). Updates sun/moon position and sky colors each frame based on time of day, season, and solar declination.
- `src/render/skyMaterial.ts`: custom three.js ShaderMaterial for the atmospheric sky (Rayleigh scattering approximation), sun glow, and star field.
- `src/game.ts`: create Sky in constructor, update each frame, dispose on cleanup. Replace the simple day/night sky color lerp with the sky material.
- Config: `SUN_SIZE`, `MOON_SIZE`, `STAR_COUNT`, `SKY_INTENSITY` (already have DAY_LENGTH_S, START_TIME_OF_DAY).
- F3: no change needed (season already shown).

**Out of scope:**
- Clouds beyond the existing decorative layer (they already exist).
- Weather (pressure systems, precipitation) — phase 4 item 3.
- Moon phases, star rotation beyond fixed positions — later refinement.
- Atmospheric scattering that affects ground lighting (just the sky visual).

**Files:** `src/render/sky.ts` (new), `src/render/skyMaterial.ts` (new), `src/game.ts` (modify), `src/config.ts` (add constants if needed).

**Acceptance criteria:**
- `npm run check` passes.
- `npm run build` passes.
- Sky renders with day/night color transition.
- Sun is visible during day, moon at night, stars at night.
- No console errors related to shaders.
- Existing renderer tests still pass.
