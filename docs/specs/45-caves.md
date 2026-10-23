# Spec 45: Cave systems

**Built by:** Claude. Completes roadmap phase 2 item 6 for caves (task T-D2). Aquifers (T-D3) and underground lava
(T-D4) are separate.

> Spec 46 extends these systems below sea level and moves the legacy y=0/1 no-carve guard
> to the actual terrain-band bottom. Its groundwater filling and bottom-protection rules
> supersede the corresponding rules below; cave shapes and surface-water roofs are unchanged.

## Goal

The underground is not one kind of tunnel. Four independent, deterministic systems share the rock, in the way
Minecraft's 1.18 cave generation splits cheese caverns, spaghetti and noodle tunnels, and ravines:

| System | Shape | Volume (share of all underground cells) | Roof kept above it |
|---|---|---|---|
| Cheese | broad caverns, tens of blocks across, with rooms and pillars | about 6 % | 4 to 24 blocks, fading |
| Spaghetti | medium winding tubes (the original spec 5 caves, unchanged) | about 3 % | 4 blocks |
| Noodle | thin tunnels, 1–3 blocks tall, running mostly level | about 1 % | 4 blocks |
| Ravine | long canyons along a 2D ridge, widest under the roof and tapering down | about 1 % | 6 blocks |

Total carved volume is about 11 % of the sampled underground, leaving 89 % solid. The tuning constants live in
`src/config.ts`; `src/world/caves.ts` holds the pure logic.

## Requirements

1. **Determinism.** Every field is seeded from the world seed. `caveKind(noises, wx, y, wz, surfaceBlocks)` is a pure
   function, so a chunk is a pure function of its position and seed, and a chunk always equals the matching slice of a
   full column.
2. **Surface protection (the "roof").** A cell is never carved above the column's highest solid block. Near the
   surface the cheese threshold rises linearly from `CAVE_CHEESE_THRESHOLD` at `CAVE_CHEESE_FADE` blocks of cover to
   `CAVE_CHEESE_OPENING` at the surface. Only the cheese field may carve within `CAVE_NOODLE_ROOF` (4) blocks of the
   surface, so cave mouths are cheese caverns that broke through, not tunnels grazing the ground.
3. **Shore, river and lake roofs keep working.** Spec 14's `caveTop` clamp still caps every system, so no cave opens
   under a beach, a lake or the sea (spec 20, task T-D5). The bottom two blocks of the world are never carved.
4. **Depth profile of a ravine.** A ravine exists from `RAVINE_ROOF` blocks of cover down to
   `RAVINE_ROOF + RAVINE_DEPTH_M / BLOCK_SIZE_M`, and its half-width shrinks linearly with depth to zero, so it reads
   as a canyon with sloping walls rather than a vertical slot.
5. **Cost.** No more than four noise samples for a typical underground cell. Samples are ordered cheapest first and
   each noise pair exits after one sample when the first is outside the threshold. Chunk generation must stay inside
   the 3 ms budget guarded in CI.
6. **No new dependencies, no save changes.** Caves are computed on the fly; nothing new is stored.

## Out of scope

- Aquifers and local water tables (T-D3), underground lakes and lava pools (T-D4).
- Cave decoration (stalactites, moss, mushrooms on cave floors).
- Changing the density surface, the ore rules or the strata.

## Acceptance criteria

- `npm run check` passes, including the cave tests below.
- `npm run smoke` passes.
- `node scripts/benchmark.mjs --assert-generation-budget --assert-mesh-budget` passes.
- The old cave guarantees still hold: no carving at y = 0 or 1, no opening under shores, rivers or lakes.

## Test cases

`tests/caves.test.ts` and `tests/riverbed.test.ts`:

1. All four systems carve something in a sampled region.
2. Each system's share of the sampled underground stays inside its own band (cheese 3–9 %, noodle 0.2–2 %,
   spaghetti 1–5 %, ravine 0.1–2 %), and the total stays between 5 % and 16 %.
3. Nothing is carved above the surface. At the surface cell only cheese may carve, and in under 6 % of sampled columns.
4. Noodle, spaghetti and ravines never appear within four blocks of the surface.
5. A ravine's carve rate per depth layer falls with depth, and it is absent below its configured depth.
6. Two generators with the same seed agree; a different seed differs somewhere.
7. `isCaveBlock` agrees with `caveKind` (the generator uses the boolean form).
8. With every system forced open, river and lake columns keep their roof; on dry land the opening survives
   (`tests/riverbed.test.ts`).
9. The existing cave fraction, bottom-of-world and shore tests still pass.

## Worldgen change

Caves are new in every world, so unedited terrain regenerates with them. Saved edits remain. No save version bump: no
block states were added.
