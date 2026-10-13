# Spec 3: Auto step-up onto 1-block ledges

## Goal

Walking into a ledge 1 block high carries the player up onto it without pressing jump. The movement doesn't stop, there's no hop, and the camera rises smoothly instead of snapping.

## Design decision (confirm before starting)

This spec uses **physics step-up**: the body rises as part of the horizontal move, and the camera catches up over about 0.12 s.

The alternative is Minecraft-style **auto-jump** (trigger a real jump when blocked by a 1-block ledge). Step-up was chosen because:

- it keeps horizontal speed
- it works at any angle and at corners
- it avoids a visible hop

## Current behaviour

`moveAndCollide` in `src/player/physics.ts` sweeps the box along Y, then X, then Z. A horizontal hit stops that axis and zeroes its velocity. A 1-block ledge blocks the player until they jump.

## Requirements

### Config

1. Add two constants to `src/config.ts`:
   - `STEP_HEIGHT = 1`: the highest ledge, in blocks, the player steps onto.
   - `STEP_SMOOTH_S = 0.12`: the seconds the camera takes to catch up after a full 1-block step.

### Physics (`src/player/physics.ts`)

2. `moveAndCollide` takes an optional step height.
   - When it's left out or 0, the behaviour is exactly as today, and every existing test in `tests/physics.test.ts` passes unchanged.
   - `CollisionResult` gains `stepped`: how far the body rose this move, or 0.
3. A step is tried separately for the X move and the Z move. It's tried only when all of these hold:
   - the step height is greater than 0
   - that axis collided
   - the body landed on the ground in this same move's Y phase

   A standing player lands every tick, because gravity pulls them down a little each step.
4. A step succeeds only if all three of these hold:
   1. The body, raised by the step height at its current horizontal position, overlaps nothing. This rules out a ceiling in the way.
   2. That axis's move, done at the raised height, completes without colliding.
   3. The body is then lowered back until it rests on top of whatever it moved onto, so it ends standing on the ledge, not hovering above it.
5. When a step succeeds:
   - That axis's velocity is not zeroed, and its hit flag is false.
   - `onGround` stays true.
   - `stepped` adds the rise.
6. When a step fails, the result (position, velocity and flags) is exactly what it would have been without step-up.
7. Two cases that never happen:
   - **No stepping while airborne.** Jumping next to a wall, or falling past a ledge, must not snap the player up.
   - **No snapping down.** Walking off a ledge still falls normally.
8. The existing precondition (each axis moves less than 0.6 per call) must still hold. Don't change it.

### Player (`src/player/player.ts`)

9. `Player.update` passes `STEP_HEIGHT` only when the player is neither flying nor swimming (waist in water). Otherwise it passes 0. The existing "climb out of the water onto a ledge" jump is unchanged.
10. Camera smoothing:
    - The player keeps a visual eye offset. When a step happens, the offset decreases by the rise, so the eye starts where it was.
    - Each update the offset moves back toward 0 at `STEP_HEIGHT / STEP_SMOOTH_S` blocks per second, clamped so it never goes past 0.
    - The offset is interpolated between ticks the same way the position is (keep a previous value). The rendered eye must never dip below its pre-step height and never rise above the true eye height.
    - `eyePosition(alpha)` includes the interpolated offset.
    - `setPosition` resets the offset to 0, so teleporting never leaves a lagging camera.
11. Physics, collisions and `position` never use the offset. It only affects `eyePosition`.

### Docs

12. In `README.md`, under the movement line, mention that the player steps up 1-block ledges automatically.

## Out of scope

- A setting to turn step-up off
- Sneaking
- Snapping down
- Changes to swimming or flying
- Smoke-test changes (unit tests are the acceptance for this spec)

## Acceptance criteria

- All test cases below pass in a new file, `tests/stepUp.test.ts`.
- All existing tests pass unchanged, including `physics.test.ts`, `player.test.ts` and `swimming.test.ts`.
- `npm run smoke` still passes.
- Manual check with `npm run dev`:
  - Walk into a single block placed on flat ground: you glide up onto it with no hop and no camera snap.
  - A 2-block wall still blocks you.

## Test cases

### Common setup

- Ground is solid for y < 10.
- A player's feet start at y = 10.
- Unless a case says otherwise, drive a `Player`:
  - `yaw = −π/2` (faces +X)
  - forward held
  - 60 updates of `FIXED_DT` (1 second)
- "Ledge at x = 3" means a raised floor: the block at y = 10 is solid for every x ≥ 3 and every z. The player can't walk off the far side and fall back down.
- "Wall at x = 3" means blocks at y = 10 and y = 11 are solid for every x ≥ 3.
- A single "block at (x, y)" is solid for every z.
- The player starts at x = 2.5, z = 0.5.

### Cases

1. **1-block ledge.** Ledge at x = 3.
   - Final `position.y` is 11 (within 0.001).
   - `position.x` > 3.5.
   - `onGround` is true.
2. **2-block wall.** Wall at x = 3.
   - `position.x` stops at about 2.7 (3 − half width, within 0.001).
   - `position.y` stays 10.
3. **No headroom above the ledge.** Ledge at x = 3 plus a block at (3, 12), so only 1 block of air sits above the ledge.
   - No step: `x` ≈ 2.7, `y` = 10.
4. **Ceiling above the player.** Ledge at x = 3 plus a block at (2, 12), directly over the player's head.
   - No step: `x` ≈ 2.7, `y` = 10.
5. **Flying.** A flying player hovering at y = 10.5, no vertical input, ledge at x = 3.
   - No step: `x` ≈ 2.7, `y` stays 10.5.
6. **Swimming.** Water at y 10–12 wherever there's no solid block, ledge at x = 3, jump not held.
   - After 1 second, `x` ≤ 2.71.
7. **Airborne.** Call `moveAndCollide` directly with step height 1:
   - start at x = 2.65, y = 10.2, so this one move reaches the ledge
   - velocity +3 on Y (rising) and +5 on X
   - ledge at x = 3
   - Expect `hitX` to be true, `stepped` to be 0, and `x` ≈ 2.7.
8. **Default is off.** Calling `moveAndCollide` without a step height into the case 1 ledge is blocked.
9. **Diagonal.**
   - Setup: yaw = −π/4 (the yaw that faces +X and −Z at 45°), ledge at x = 3, 2 seconds of updates.
   - Expect `y` = 11, `x` > 3.5, and `z` to have kept decreasing after the step.
10. **Staircase.** Solid from the ground up to:
    - y = 10 at x = 3
    - y = 11 at x = 4
    - y = 12 for every x ≥ 5

    After 3 seconds of updates, final `y` = 13 (within 0.001).
11. **Camera on the step tick.** Find the tick in case 1 where `position.y` jumps by about 1. On that tick, for alpha 0, 0.5 and 1:
    - `eyePosition(alpha).y` ≥ pre-step eye height − 1e-9
    - `eyePosition(alpha).y` ≤ pre-step eye height + 0.2
12. **Camera catches up.** After `ceil(STEP_SMOOTH_S / FIXED_DT) + 1` more ticks:
    - `eyePosition(1).y` equals `position.y + EYE_HEIGHT` (within 1e-9).
    - On no tick does `eyePosition(1).y` exceed `position.y + EYE_HEIGHT`.
13. **Teleport resets the camera.** Right after a step, call `setPosition`.
    - `eyePosition(1).y` equals the new `y + EYE_HEIGHT`.
