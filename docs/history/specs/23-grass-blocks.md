# Spec 23: Grass blocks are grass on every side

**Built by:** Claude. A visual fix to the existing `grass` block, requested by the owner. It sits outside the roadmap
phases.

## Goal

A grass block looks like grass all over its sides. Today the sides are dirt with a thin green edge along the top, so the
block reads as a dirt block with a grass layer on it. After this spec, the four side faces are grass from top to bottom.
The top stays grass, and the bottom stays dirt, because the underside is not grass.

## Requirements

1. **Side texture.** The side texture of `grass` (`Tile.GRASS_SIDE`) is painted entirely in the grass colour, with the same
   per-pixel variation as the grass top. It has no dirt pixels and no jagged edge.
2. **Top and bottom unchanged.** The grass top texture (`Tile.GRASS_TOP`) and the dirt texture (`Tile.DIRT`, used for the
   bottom face of grass) keep their current painters and pixels.
3. **Unchanged elsewhere.** Block names, ids, states, the registry, the tile numbers, the save format, the mesher, lighting,
   ambient occlusion, config and the generator are not changed. Dirt blocks still look like dirt. Other blocks that use the
   dirt texture are unaffected.
4. **No new assets.** The change is in the procedural painter (`src/render/atlasPixels.ts`), as all textures are.

## Out of scope

- Texture packs (a later decision; see the owner's notes).
- The bottom face of grass, which stays dirt.
- Grass spreading, snow on grass, and any change to tall grass, ferns or other plants.
- Per-face shading. Faces keep the lighting they already get from the shader and the mesher.

## Acceptance criteria

- `npm run check` passes.
- `npm run smoke` passes with no console error.
- In the game, a grass cliff or a dug hole in grass shows green sides all the way down, with the top still grass and the
  bottom face of a grass block still brown.

## Test cases (`tests/atlasPixels.test.ts`, extended)

1. Every pixel of the grass side tile is green: its green channel is at least 20 above both its red and blue channels.
   This holds for all 256 pixels, even with the noise.
2. The grass top tile passes the same green test, so the side and the top match in colour.
3. The dirt tile still passes a brown test: its red channel is greater than its green channel for every pixel. This shows
   the dirt painter was not changed.
4. The existing tests still hold: the atlas is the right size and deterministic, and the side tile is fully opaque.
