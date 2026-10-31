# Spec 16: Water buoyancy and drag for the player

**Built by:** Claude. First slice of Phase 5 item 5 (liquid physics) in `docs/ROADMAP.md`, brought forward ahead of
phases 3 and 4 at the owner's request. Replaces the swim constants of the phase 1 swim code.

## Goal

In water the player floats, swims with drag, and sinks only when the swim physics say so. Today the body sinks at a
fixed 2 m/s and swims at a fixed 60% of walking speed. After this slice, buoyancy and quadratic drag set both, so the
swim speed and the float level follow from the body and the water.

## Requirements

1. **Water and body densities.** `WATER_DENSITY` = 1,000 kg/m³ and `PLAYER_DENSITY` = 800 kg/m³ in `src/config.ts`.
   At 800 kg/m³ the body floats with about 80% under water: the chin is at the surface when still.
2. **Submerged fraction.** `submergedFraction` is the share of the body's height below the water surface. The surface
   is the top of the highest water block in the body's column (y + 1 for a water block at y). Result in [0, 1].
   It is 0 with no water and 1 when the surface is above the head. It lives in `src/player/player.ts`.
3. **Buoyancy.** While the submerged fraction is above 0, the body gets an upward acceleration of
   `GRAVITY × (WATER_DENSITY / PLAYER_DENSITY) × fraction`. Gravity is applied as before.
4. **Quadratic drag.** While swimming (waist in water, not flying), each velocity component is scaled by
   `1 − WATER_DRAG × |v| × dt`, where `|v|` is the 3D speed. `WATER_DRAG` is written per metre, 0.9, and converted to
   blocks (`× BLOCK_SIZE_M`), because drag in blocks gives the same result.
5. **Swim stroke.** While swimming, a wish direction adds `SWIM_THRUST` (6 m/s²) along it. Horizontal speed is not
   lerped toward a target any more: drag sets the top swim speed, `sqrt(thrust / drag)` ≈ 2.6 m/s.
6. **Swim up.** Holding jump in water adds `SWIM_UP_ACCEL` (6 m/s²). With buoyancy and drag it reaches about 3.8 m/s.
7. **Removed.** `SWIM_GRAVITY`, `SWIM_SINK_SPEED`, `SWIM_SPEED_FACTOR` and `SWIM_UP_SPEED` are deleted: the physics
   above replace them.
8. **Unchanged.** Wall climb out of water, the ledge rule, step-up (disabled in water, as now), flying, jumping on land,
   the water checks at waist and feet height, fog and the underwater check in the game.

## Out of scope (later slices of item 5)

- Currents from the flow direction, and the flow of water levels.
- Wading slow-down and the walking drag in shallow water (only buoyancy applies there).
- Splash on entry and fall damage reduced by water depth (needs phase 7 health).
- Lava: fire and the slower lava physics.
- Physics for dropped items and creatures (they need the entity system).

## Acceptance criteria

- `npm run check` passes.
- `npm run smoke` passes except the favicon 404 (see `docs/HANDOFF.md`).
- In the game, a still player in a pool floats with the chin near the surface, swims forward at a steady speed, and
  rises when jump is held.

## Test cases (`tests/swimming.test.ts`, plus new tests in the same file)

1. Still in deep water, the body rises and bobs around a submerged fraction of about 0.8. The average over 2 s is between 0.75 and 0.85. It does not sink. Quadratic drag damps the bobbing slowly at low speed, so it can take about 10 s to settle.
   This replaces the old "sinks slowly" test; its intent was that water slows the body, now stated as the float level.
2. Holding jump in water raises the body above its start (ported from the existing test).
3. Holding forward in water, the horizontal speed converges to `sqrt(SWIM_THRUST / WATER_DRAG)` within 2%.
4. A body fully under water rises, and one above the surface falls at full gravity.
5. The submerged fraction is 0 with no water, 1 with the surface above the head, and in between for a surface partway
   up the body.
6. The ledge climb and the waist-height water check still pass (ported from the existing tests, unchanged in intent).
