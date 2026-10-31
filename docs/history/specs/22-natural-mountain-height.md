# Spec 22: Natural mountain height

**Built by:** Claude. A fix to spec 13 (terrain from fields), found in play. Not a roadmap item.

## Problem

Spec 13 added mountains of up to 2,300 m (`MOUNTAIN_M`), so the seed-1 peak near block (1450, −3000) is about 2,380 m
above sea level. The renderer has no horizon LOD yet (phase 2 item 8), and the view reaches about 38 m. A peak of that
height has no visible top, so it reads as an infinite wall. The roadmap's own "done when" for phase 2 says tall
terrain needs the horizon LOD, which is not built.

## Goal

No mountain is taller than the view can show. The terrain stays natural: plains, hills and ridges, with no peak that
fills the sky.

## Requirements

1. **Mountain height.** `MOUNTAIN_M` in `src/world/shape.ts` is 60 m (was 2,300 m). The continental spline (up to 150 m)
   and the detail noise (up to 22 m) are unchanged. The highest possible surface is therefore 150 + 60 + 22 = 232 m.
2. **Highest terrain.** `TERRAIN_MAX_M` in `src/config.ts` is 232 m, so it matches requirement 1. It is still used only
   by the debug map colouring and the height test.
3. **Tests.** Tests that find a mountain by location (the overhang, strata and bare-rock tests) move to a peak in the
   new terrain, keeping their intent. No assertion is removed.
4. **Unchanged.** The band (−400 m to +2,600 m), sea level, the density, caves, geology, plants, and the save format.

## Out of scope

- Horizon LOD. Taller mountains come back only after it exists (roadmap phase 2 item 8). The `shortcut:` comment in
  `shape.ts` says so.
- Retuning the continental spline or the detail noise.

## Acceptance criteria

- `npm run check` passes.
- `npm run smoke` passes with no console error.
- Over a 20 km square for seeds 1, 2, 3 and 42, no generated surface is higher than 232 m.
- The high-chunk smoke check still sits above all terrain.

## Test cases

1. For seeds 1, 2, 3 and 42, sampled surface heights stay within the terrain band and at or below `TERRAIN_MAX_BLOCKS`
   (`tests/generator.test.ts`, existing "heights stay inside the terrain band").
2. The overhang, strata and bare-rock tests run at a peak of the new terrain, found by a one-off scan and written into the
   test as the location.
