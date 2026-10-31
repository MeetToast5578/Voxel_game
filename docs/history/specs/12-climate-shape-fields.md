# Spec 12: Climate and shape fields

**Built by:** Claude. Second item of Phase 2 (terrain) in `docs/ROADMAP.md`.
**Depends on:** spec 11 (debug map, the tool for judging this).

## Goal

Replace the terrain's single height noise with large-scale fields, as in Minecraft 1.18: continentalness, erosion,
peaks and valleys, temperature, humidity and weirdness. Height comes from spline curves of these fields. Sea level is
y = 0. This slice adds the pure field and height functions and tests them. The generator is switched over in the next
slice (spec 13).

## Requirements

1. `src/world/shape.ts` (pure, no three.js, no DOM). Positions are in meters.
2. Six fields, each a fractal noise in [−1, 1], with a feature size in meters:
   - continentalness: 6000 m (ocean, coast, inland)
   - erosion: 1500 m (smooth vs. rugged)
   - peaks: 700 m, ridged, so ridges are sharp and valleys are wide: `1 − 2·|noise|`
   - temperature: 4000 m
   - humidity: 3000 m
   - weirdness: 2000 m (rare formations)
   Each field has its own seed offset from the world seed.
3. `heightMeters(fields)` returns the surface height in meters:
   - base height is a spline of continentalness: knots at −1 → −300 m (deep ocean), −0.45 → −120 m, −0.2 → −25 m,
     −0.05 → −2 m, 0.05 → 4 m, 0.25 → 40 m, 0.6 → 110 m, 1 → 150 m. Between knots the spline eases (smoothstep).
   - a mountain term added on top: `2300 m × land × rugged × ridge`, where `land = smoothstep(0.1, 0.5, continentalness)`,
     `rugged = smoothstep(0.3, −0.5, erosion)` (low erosion is rugged), `ridge = smoothstep(0, 1, peaks)`.
4. The result stays within [−300, 2450] m, so it always fits the band of −400 to +2600 m reserved for terrain.
5. Sea level is 0 m. Columns with a height below 0 are ocean.

## Out of scope

- Switching the generator to these heights (spec 13). Sea level stays 40 m in config until then.
- Rivers, biomes (temperature and humidity are sampled here but not used yet), caves, geology.

## Acceptance criteria

- `npm run check` passes, including the new tests.
- The debug map (`?map=1`) can show these heights after spec 13.

## Test cases (`tests/shape.test.ts`)

1. Every field is in [−1, 1], and sampling is deterministic for a given seed.
2. Over an 18 km square (300 m steps), between 25% and 75% of columns are ocean (height < 0).
3. Where continentalness is below −0.45, the height is below 0.
4. Over the same square, some column is at least 1000 m high, and every height is within [−300, 2450] m.
5. Near the coast, some columns are within 5 m of sea level.
