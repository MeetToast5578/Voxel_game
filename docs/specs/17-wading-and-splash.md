# Spec 17: Wading and splash on entry

**Built by:** Claude. Second slice of Phase 5 item 5 (liquid physics) in `docs/ROADMAP.md`, after spec 16 (buoyancy and drag).

## Goal

Shallow water slows the player's walk in proportion to how deep it is, and a fall into water makes a splash sound
scaled by how hard the body hits. Today a puddle walks at full speed, and falling into a lake is silent.

## Requirements

1. **Wading.** While not swimming, the walking speed target is multiplied by
   `1 − WADE_SLOWDOWN × submerged`, where `submerged` is the submerged fraction from spec 16. `WADE_SLOWDOWN` = 0.5, in
   `src/config.ts`. A body with its feet in a puddle (fraction about 0.2) walks about 90% as fast, and a body at the
   edge of swimming (fraction about 0.3) walks about 85%. Swimming keeps its own rule (spec 16).
2. **Entry.** The body has entered water on a frame when its submerged fraction was 0 before the frame and is above 0
   after it, and its downward speed before the frame was at least `SPLASH_MIN_SPEED` (4 m/s, in config).
3. **Splash.** On entry, `Player.splashSpeed` is set to the downward speed (m/s, in blocks per second internally) for
   that frame, and is 0 on every other frame. The game plays a `splash` sound once on each frame with `splashSpeed > 0`.
   The sound is a new `SoundName` in `src/audio/sounds.ts`.
4. **Unchanged.** Swimming, buoyancy, drag, walls and the ledge climb, step-up (off in water), flying, footsteps, and
   the water checks.

## Out of scope

- Volume of the splash by impact speed. `Sounds.play` takes no volume, so the splash is one sound. Shortcut noted in the
  code: `shortcut: splash is one sound, not scaled by impact speed, upgrade when Sounds takes a volume`.
- Fall damage reduced by water depth. That needs health (phase 7). The impact speed is kept on `splashSpeed` for it.
- Currents. They need fluid levels (phase 5 item 4), which are not built.
- Wading in water that is not in a column of water blocks (none exist yet).

## Acceptance criteria

- `npm run check` passes.
- `npm run smoke` passes except the favicon 404 (see `docs/HANDOFF.md`).
- In the game, a player walking into a shallow pool slows down, and a fall into a lake plays a splash.

## Test cases (`tests/wading.test.ts`)

1. On a floor with a shallow puddle (water one block deep at the feet), the walking speed is between 85% and 95% of the
   speed on dry floor, after the same time.
2. Walking in water at the edge of swimming is slower than on dry floor, but still faster than swimming.
3. A fall from 1.5 blocks above the water surface gives exactly one frame with `splashSpeed > 0`, at a speed of at
   least `SPLASH_MIN_SPEED`.
4. A slow entry (starting 0.2 blocks above the surface) gives no splash.
5. A body that stays under water gives no further splash.
