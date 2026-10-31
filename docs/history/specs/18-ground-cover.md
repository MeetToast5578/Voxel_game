# Spec 18: Ground cover (tall grass and poppies)

**Built by:** Claude. First slice of Phase 3 item 6 (ground cover and non-cube meshes) in `docs/ROADMAP.md`, brought
forward at the owner's request ("fill the world to make it alive"). Biome-specific flowers wait for biomes (phase 3
items 1–2); this slice places the same plants everywhere grass grows.

## Goal

Grass tops grow tall grass and, rarely, a red poppy. Plants are thin crossed quads, not cubes, so they read as plants,
and they do not stop the player or the sun.

## Requirements

1. **Shape.** `BlockTypeDef` gets an optional `shape`: `'cube'` (the default, every block so far) or `'cross'`. A cross
   block is drawn as two quads crossing diagonally through its cell, each visible from both sides, with the same
   texture and lighting as a cube face. The mesher (`src/render/mesher.ts`) handles it in its own branch, before the cube
   faces.
2. **Two new block types**, appended to the registry (ids 18 and 19): `tall_grass` and `poppy`. Both are `layer:
   'cutout'` (alpha-tested like leaves), `opaque: false`, `solid: false`, `targetable: true`, `breakable: true`,
   `cullSame: false`, and `shape: 'cross'`. Each has its own atlas tile (painted procedurally with transparent corners).
3. **Sky.** A cross block does not block sunlight, so `blocksSky` is false for it and column tops ignore it. A cube
   block's rule is unchanged.
4. **Placement.** For each land column (not beach, not bare rock: spec 15 and 13 rules), the cell directly above the
   surface grass (`y = h + 1`) may get a plant. One hash of `(seed + 11, wx, wz)` picks it: below `POPPY_CHANCE` (0.01) it
   is a poppy, below `POPPY_CHANCE + TALL_GRASS_CHANCE` (0.31) it is tall grass, otherwise nothing. Both chances are in
   `src/config.ts`. A column whose surface block is carved by a cave gets no plant.
5. **Trees.** Trunks replace a plant in their base cell. Leaves fill only air, as now.
6. **Unchanged.** Terrain, caves, water, beaches, bare rock, trees, collision (plants do not collide), the save format
   (new states are appended; old saves stay valid), and the time budgets.

## Out of scope

- Flowers by biome, mushrooms, ferns, reeds, lily pads, boulders, fallen logs (later slices of phase 3 item 6).
- Other flower colours and tall-grass variants.
- Breaking a plant drops nothing special; the drop rules come with survival (phase 7).
- Plants that grow over time (phase 5).

## Acceptance criteria

- `npm run check` passes.
- `npm run smoke` passes except the favicon 404 (see `docs/HANDOFF.md`).
- In the game, grass has tufts of tall grass and some red poppies. The player walks through them, and the sun reaches
  the ground.

## Test cases (`tests/plants.test.ts`)

1. `tall_grass` and `poppy` round-trip through their names, and `BLOCK_STATE_COUNT` is 20.
2. A cross block is not solid, is not opaque, and does not block the sky; a cube block still does.
3. In the generator, every plant sits directly above a grass surface, and no plant is on sand, stone or water.
4. Some plants exist in the sampled land around the origin for seed 1, and some grass columns have none.
5. A chunk with one plant meshes to two double-sided quads (twelve indices), and the plant adds no cube faces.
6. The stacked chunks still equal the legacy column (the existing test covers this).
