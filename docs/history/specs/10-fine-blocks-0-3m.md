# Spec 10: 0.3 m blocks

**Built by:** Claude. It touches worldgen, the renderer, the save format and the tree generator.
**Depends on:** spec 9 (meter-based world scale and trees). Amends its block size from 0.6 m to 0.3 m.

## Goal

Blocks are 0.3 m, so the same land is filled with finer detail. Every world size stays in meters, as in spec 9, so
the land does not change size. Trees keep their 8–12 m height, with a trunk, branches and a crown at the finer scale.

## Decisions (confirmed by the owner)

- **Chunks stay 16 blocks.** A chunk is now 4.8 m, so there are about 4× as many per area. Mesher and light code do
  not change.
- **The default render distance stays at 8 chunks**, which is about 38 m. Raise `DEFAULT_RENDER_DISTANCE` to see farther.
- **Auto step-up is 0.6 m** (2 blocks). Ledges climb as they did at 0.6 m.
- **Light reach stays 14 blocks** (4.2 m). The mesher's exactness argument depends on the reach being shorter than a chunk.

## Requirements

1. `BLOCK_SIZE_M` = 0.3. Every value written with `metersToBlocks` converts itself. Whole-block values use `roundBlocks`:
   sea level 133, legacy column 480 blocks (30 chunks), terrain cap 387 blocks, soil 6, beach band 3, shore bands 10
   and 17, tree reach 16 blocks, tree chance per column 0.012 × 0.3².
2. `STEP_HEIGHT` = `roundBlocks(0.6)` = 2 blocks. It was 1 block, which is now only 0.3 m.
3. Trees (`src/world/trees.ts`): branch length (1.2–2.4 m) and leaf cluster radius (1.2 m) come from config in meters.
   The trunk is 2 × 2 blocks (0.6 m across), so it is not a pole at this block size. Tree height stays 8–12 m.
4. The spawn scan cap is `SURFACE_SCAN_M` = 150 m (500 blocks), which keeps its meaning.
5. Camera far plane: `CAMERA_FAR_M` = 600 m. Underwater fog far: `UNDERWATER_FAR_M` = 8.4 m. Fog near and far still follow
   the view distance.
6. Saves: `SAVE_VERSION` is 3. Block coordinates at 0.3 m differ from 0.6 m, so a save of another version is not loaded,
   and its chunk records are cleared on load. **This discards a 0.6 m browser save.**
7. The debug overlay computes chunk coordinates with `CHUNK_SIZE`.

## Out of scope

- Chunk size changes (16 stays). 32-block chunks would need a light and mesher review.
- Terrain redesign (phase 2).
- Any change to light reach, speeds, jump height or the body size, which are already in meters.

## Acceptance criteria

- `npm run check` passes.
- `npm run smoke` passes in CI, or in a cloud session except for the two known cloud-only failures.
- Every test that encoded 0.6 m is ported with the same intent, and the PR lists the old and new values.
- Measured in the PR: `generateChunk` time, chunks per square kilometre (about 4× the 0.6 m count), mesh time per chunk
  against the 3 ms target, and headless FPS against the base commit in the same container.
- Manual check with `npm run dev`: a tree shows 8–12 m in the F3 overlay, and the step climbs 0.6 m ledges.
