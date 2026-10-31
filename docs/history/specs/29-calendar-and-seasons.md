# Spec 29: Calendar and seasons

Status: built (this spec was written after the code, to document it). Phase 4, item 1 of [the roadmap](../ROADMAP.md).

**Goal:** A year clock that runs apart from the day clock. The year has four seasons of `DAYS_PER_SEASON` days each. Day length changes with the season for a fixed world latitude, and the solar declination follows the year.

**Requirements (as built, `src/world/calendar.ts`, `src/config.ts`):**
- `seasonName(timeOfYear)` gives spring, summer, autumn or winter. `timeOfYear` runs 0..1 and wraps, with 0 at the spring equinox.
- `dayOfSeason(timeOfYear, daysPerSeason)` gives a 1-based day within the season.
- `solarDeclination(timeOfYear)` is `AXIAL_TILT_DEG` (23.5°) times the sine of the year's phase: 0 at the equinoxes, +23.5° at the summer solstice, −23.5° at the winter solstice.
- `dayLengthMinutes(latitude, declination)` is the day length from the hour angle. It clamps at the polar cases, so polar day and night do not produce NaN.
- The `Calendar` class advances `timeOfYear` by real seconds: one year is `4 * DAYS_PER_SEASON` days of `DAY_LENGTH_S` seconds each.
- `Game.fixedUpdate` calls `Calendar.advance` with the same fixed simulation delta as the day clock, only after spawn is ready. Both clocks continue in menus, matching the existing simulation behaviour; this does not introduce a new pause rule. Loaded `timeOfYear` continues advancing and is saved as before.
- Config: `DAYS_PER_SEASON` = 7, `WORLD_LATITUDE_DEG` = 45.

**Acceptance criteria:**
- The season changes every quarter of the year, and wraps.
- The solar declination is 0 at the equinoxes and at its extremes at the solstices.
- Day length is longer in summer than in winter at 45° north.
- The day clock and the year clock stay independent.

**Test cases:** `tests/calendar.test.ts` (11 tests) covers season boundaries, day numbers, declination, day length and the clamp at the poles. `tests/gameLifecycle.test.ts` adds four actual-game clock regressions: fixed delta, loading guard, loaded-year boundaries/wrap and menu-time advancement (T-F9).
