# Spec 19: Ferns and dandelions

**Built by:** Claude. Second slice of Phase 3 item 6 (ground cover) in `docs/ROADMAP.md`, after spec 18 (tall grass and
poppies). Uses the same cross-shaped plant mesh.

## Goal

Grass surfaces also grow ferns and dandelions, so the plains have more variety than tall grass and poppies alone.

## Requirements

1. **Two new cross-shaped block types**, appended to the registry: `fern` (id 20) and `dandelion` (id 21). Both are
   `layer: 'cutout'`, `opaque: false`, `solid: false`, `targetable: true`, `breakable: true`, `cullSame: false`, and
   `shape: 'cross'`, like spec 18's plants. Each has its own atlas tile (`Tile.FERN` 21, `Tile.DANDELION` 22), painted
   procedurally with transparent corners.
2. **Placement.** The same single hash per grass column as spec 18 picks the plant, with four bands in this order:
   dandelion below `DANDELION_CHANCE` (0.01), poppy below `DANDELION_CHANCE + POPPY_CHANCE` (0.02), tall grass below
   that plus `TALL_GRASS_CHANCE` (0.32), fern below that plus `FERN_CHANCE` (0.42), otherwise nothing. The rules of
   spec 18 still apply: grass surfaces only, no beaches, no bare rock, no plant where a cave opens the surface.
3. **Config.** `DANDELION_CHANCE` = 0.01 and `FERN_CHANCE` = 0.1 are added to `src/config.ts`. The other chances are
   unchanged.
4. **Unchanged.** Sky, solid and opaque rules for plants, the mesher, trees, caves, terrain, the save format (new states
   are appended), and the time budgets.

## Out of scope

- Flowers by biome (phase 3 items 1–2 come first). Ferns in shade or dark caves.
- Mushrooms, reeds, lily pads, boulders and fallen logs.
- Breaking a plant drops nothing special; drops come with survival (phase 7).

## Acceptance criteria

- `npm run check` passes.
- `npm run smoke` passes except the favicon 404 (see `docs/HANDOFF.md`).
- In the game, the plains show ferns and yellow dandelions among the tall grass and poppies.

## Test cases (`tests/plants.test.ts`, extended)

1. `fern` and `dandelion` round-trip through their names, with `shape` `'cross'`, and `BLOCK_STATE_COUNT` is 22.
2. A fern and a dandelion are not solid, not opaque, and do not block the sky (as in spec 18's test 2).
3. Plants (all four kinds) sit only on grass surfaces, as in spec 18's test 3, and ferns appear in the sampled area.
4. The stacked chunks equal the legacy column (the existing test covers this).
