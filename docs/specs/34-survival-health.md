# Spec 34: Survival mode and health (Phase 7, items 1–2)

**Goal:** Add survival and creative game modes, health, and fall damage. In survival mode, the player can take damage and die; in creative mode (current behaviour), the player is invulnerable with instant block breaking and flight.

**Why:** Phase 7 items 1–2 of the roadmap. Builds on the existing inventory, timed breaking, drops, pick-up, and entity systems.

**Scope (ponytail):**
- `src/game.ts`:
  - `gameMode` field: `'survival'` | `'creative'` (default: `'creative'` for backwards compatibility)
  - `health` field: 0..20 (10 hearts), starts at 20
  - `hunger` field: 0..20, starts at 20
  - Take fall damage: impact speed > threshold → damage
  - Drown: air meter, damage when air runs out
  - Die: respawn at spawn point, drop inventory on ground
  - Debug API: `setGameMode(mode)`, `setHealth(health)`, `damage(amount)`
- `src/config.ts`:
  - `FALL_DAMAGE_THRESHOLD_M_S`: impact speed above which fall damage occurs
  - `FALL_DAMAGE_MULTIPLIER`: damage per m/s above threshold
  - `DROWN_DAMAGE_PER_S`: damage per second when drowning
  - `HEALTH_MAX`, `HUNGER_MAX`
- `src/debugApi.ts`: expose new debug methods
- Tests (Node, vitest): game mode toggle, fall damage calculation, death and respawn, health bounds

**Out of scope:**
- Hunger system (eating food, starvation) — needs food items (Phase 7 item 4)
- Temperature/hypothermia — needs weather integration
- Healing/regeneration — needs food/items
- Tools, crafting, durability — Phase 7 item 3

**Files:** `src/game.ts`, `src/config.ts`, `src/debugApi.ts`, `tests/survival.test.ts` (new)

**Acceptance criteria:**
- `npm run check` passes.
- `tests/survival.test.ts`: game mode defaults to creative, fall damage applies in survival but not creative, health clamps to [0, MAX], death respawns at spawn, damage reduces health.
- Default game mode is creative (existing worlds behave as before).