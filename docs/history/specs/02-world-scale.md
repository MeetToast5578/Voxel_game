# Spec 2: World scale (0.6 m blocks, 3-block-tall player)

## Goal

A block is 0.6 m. The player is about 3 blocks tall and 0.8 blocks wide, so they fit 3-high, 1-wide passages but not 2-high ones. Movement feels the same as today when measured in meters.

## Current behaviour

`src/config.ts` treats 1 block as 1 m:
- The player is 1.8 tall, 0.6 wide, with the eye at 1.62.
- Speeds, gravity and reach are in blocks.
- `src/player/player.ts` hard-codes two heights (0.6 for the waist water check, 0.1 for the feet water check).
- `src/game.ts` hard-codes the footstep distance (1.8).

## Requirements

### Config (`src/config.ts`)

1. Add `BLOCK_SIZE_M = 0.6`, and one small exported helper that converts meters to blocks (divide by `BLOCK_SIZE_M`). Config may contain this one function.
2. Player body, written in meters and converted to blocks:

   | Constant | Meters | Blocks |
   |----------|--------|--------|
   | `PLAYER_HEIGHT` | 1.75 | ≈ 2.917 |
   | `EYE_HEIGHT` | 1.62 | 2.7 |
   | `PLAYER_HALF_WIDTH` | 0.24 | 0.4 |

3. Every other distance, speed or acceleration keeps its current number, now read as meters (or m/s, m/s²), and is converted to blocks:
   - `WALK_SPEED`, `SPRINT_SPEED`, `FLY_SPEED`
   - `GRAVITY`, `JUMP_SPEED`, `TERMINAL_VELOCITY`
   - `REACH`
   - `SWIM_GRAVITY`, `SWIM_UP_SPEED`, `SWIM_SINK_SPEED`

   For example, `WALK_SPEED` becomes 4.3 m/s ≈ 7.17 blocks/s, and the jump height stays about 1.35 m ≈ 2.25 blocks.

   Rates that have no unit stay exactly as they are: `GROUND_ACCEL`, `AIR_ACCEL`, `SWIM_SPEED_FACTOR`, and the time constants.
4. New constants, given in meters, for the values that are hard-coded today:
   - `SWIM_WAIST_HEIGHT` = 0.6 m (the "in water" check height above the feet)
   - `FEET_WATER_HEIGHT` = 0.1 m
   - `FOOTSTEP_DISTANCE` = 1.8 m

   `player.ts` and `game.ts` import them instead of using literals.
5. Chunks are now 9.6 m wide, so raise the render distances:
   - `DEFAULT_RENDER_DISTANCE` = 8
   - `MAX_RENDER_DISTANCE` = 16
   - `MIN_RENDER_DISTANCE` stays 2
6. Unchanged in this spec, because phase 2 replaces them:
   - terrain numbers (`SEA_LEVEL`, generator scales)
   - cloud constants
   - `WORLD_HEIGHT`

### Physics (`src/player/physics.ts`)

7. No behaviour change.
   - Update the precondition comment on `moveAndCollide`: each axis moves less than the body's width (X, Z) or height (Y) per call.
   - `tests/config.test.ts` already guards this, and it must still pass with the new numbers.

### Debug overlay (`src/ui/debugText.ts`)

8. Next to the block position, show the position in meters, and the feet elevation in meters relative to sea level, as `(y − SEA_LEVEL) × BLOCK_SIZE_M`, rounded to 0.1 m.

### Docs

9. In `README.md`, add one line under the feature list: "1 block = 0.6 m; the player is about 3 blocks tall."

## Out of scope

- Terrain, caves, trees and sea level
- Clouds and fog colours
- Step-up (spec 3)
- Changing how jumping, swimming or flying work, beyond the unit conversion

## Acceptance criteria

- `npm run check` and `npm run smoke` pass.
- Tests whose numbers encode the old body size are updated to the new one, keeping their intent:
  - `physics.test.ts`, `player.test.ts`, `swimming.test.ts`, `interaction.test.ts`
  - `config.test.ts`, `debugText.test.ts`

  The pull request lists each changed assertion with its old and new value.
- Manual check with `npm run dev`:
  - You can walk into a 1-wide, 3-high tunnel but not a 2-high one.
  - A 2-block wall can be jumped onto.
  - Movement speed looks the same as before relative to real distance; the world looks bigger.

## Test cases

Add these to the existing test files, using the current Vitest style.

1. **Unit conversion.** The meters-to-blocks helper turns 0.6 into 1 and 1.75 into 1.75 / 0.6 (within 1e-9).
2. **Body fits a 3-high, 1-wide gap.**
   - Corridor: solid floor for y < 10, ceiling at y ≥ 13, walls at x = −1 and x = 1.
   - Walking along +Z through it for 1 second moves the player at least 3 blocks with no X or Y hit.
3. **Body doesn't fit a 2-high gap.**
   - Floor for y < 10, and a ceiling block at y = 12 for every z ≥ 3.
   - Walking +Z from z = 0.5 stops at z ≈ 3 − 0.4 (within 0.001).
4. **Jump clears 2 blocks.** Starting on flat ground with jump held for one tick, the highest feet y reached is at least 2.0 blocks above the start, and less than 2.5.
5. **No tunnelling at terminal velocity.**
   - Floor is 1 block thick at y = 0 (air below and above).
   - Starting at y = 200 with velocity −`TERMINAL_VELOCITY`, after enough ticks the player rests at y ≈ 1 with `onGround` true.
6. **Swim checks use meters.** With water from y = 10 to 12 and the player standing at y = 10, `inWater` is true. With water only at y = 10 (a puddle 1 block deep) and the player at y = 10, `inWater` is false, because the waist check (0.6 m = 1 block) reads y = 11. These two cases pin the conversion.
