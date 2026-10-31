# Spec 21: Mushrooms (brown and red)

**Built by:** Claude. Third slice of Phase 3 item 6 (ground cover) in `docs/ROADMAP.md`, after specs 18 and 19. Uses the
same cross-shaped plant mesh and the same placement rules.

## Goal

Grass surfaces also grow brown and red mushrooms, rarely, so the ground has a few more small details.

## Requirements

1. **Two new cross-shaped block types**, appended to the registry after `dandelion`: `brown_mushroom` (id 26) and
   `red_mushroom` (id 27). Both are `layer: 'cutout'`, `opaque: false`, `solid: false`, `targetable: true`,
   `breakable: true`, `cullSame: false`, and `shape: 'cross'`, like the plants of specs 18 and 19. Each has its own atlas
   tile (`Tile.BROWN_MUSHROOM` 27, `Tile.RED_MUSHROOM` 28), painted procedurally with transparent corners:
   - brown mushroom: a brown dome cap on a pale stem;
   - red mushroom: a red cap with a few white spots on a pale stem.
2. **Placement.** The same single hash per grass column as specs 18 and 19 picks the plant. The four existing bands keep
   their order and widths (dandelion, poppy, tall grass, fern). Two bands are appended after the fern band: brown
   mushroom below the fern band's edge plus `BROWN_MUSHROOM_CHANCE` (0.005), and red mushroom below that plus
   `RED_MUSHROOM_CHANCE` (0.005). Otherwise nothing. Because the new bands come last, no existing plant moves. The rules
   of spec 18 still apply: grass surfaces only, no beaches, no bare rock, no plant where a cave opens the surface.
3. **Config.** `BROWN_MUSHROOM_CHANCE` = 0.005 and `RED_MUSHROOM_CHANCE` = 0.005 are added to `src/config.ts`. The other
   chances are unchanged.
4. **Unchanged.** Sky, solid and opaque rules for plants, the mesher, trees, caves, terrain, rock, the save format (new
   states are appended), and the time budgets.

## Out of scope

- Mushrooms that grow in shade or in caves. Shade needs the light or biome rules that come later (phase 3 items 1–2,
  phase 5). For now mushrooms grow on the same grass surfaces as the other plants.
- Reeds, lily pads, boulders and fallen logs (later slices of item 6).
- Breaking a mushroom drops nothing special; drops come with survival (phase 7).

## Acceptance criteria

- `npm run check` passes.
- `npm run smoke` passes with no console error.
- In the game, the plains show a few brown and red mushrooms among the grass, poppies and dandelions.

## Test cases (`tests/plants.test.ts`, extended)

1. `brown_mushroom` and `red_mushroom` round-trip through their names, with `shape` `'cross'`, and `BLOCK_STATE_COUNT` is
   28 (`tests/blocks.test.ts`).
2. A mushroom is not solid, not opaque, and does not block the sky, as in spec 18's test 2.
3. Mushrooms, like the other plants, sit only on grass surfaces (spec 18's test 3, with the two new kinds added to the
   list).
4. Among the sampled area, at least one mushroom of either kind appears.
5. The existing tests still hold: the stacked chunks equal the legacy column, and the mesh of one plant is two quads.
