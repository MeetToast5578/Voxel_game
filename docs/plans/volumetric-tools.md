# Plan: volumetric block tools (part 1), and building tools (part 2)

**Status: built (task T-L8).** All three parts landed: the batch path (`World.setBlocks`), the pure volume module
(`src/player/volumes.ts`), the tools (box, sphere, plane, wall, floor, roof, flatten in `src/player/buildTool.ts`),
the preview, the tool panel and the 20-step undo (`Ctrl+Z`). This file is kept as the design record; the player docs
are in `README.md` and the audit trail is in `docs/tasks.md`, section K.

## Context

0.3 m blocks are too small to build or mine one at a time. The owner wants tools that change many blocks at once, at a size they choose, and still keeps the single-block control:

- **Volumes:** add or remove boxes (cubes) and spheres, with adjustable size, wall thickness, and either a full solid or a hollow shell.
- **Planes:** add or remove a flat layer, horizontal or vertical, with adjustable size and outline (rectangle, disc).
- **Walls, floors and roofs:** click a start point, drag out the length and height, and set the width. Same tool, different axis.
- **Flatten:** level a surface inside an adjustable footprint.
- **Single-block mode** stays exactly as it is today.

Creative rules for now: tools are free and instant. Survival costs come with phase 7 of the roadmap. Owner decisions are at the end.

## What the code does today (read, not run)

- **One cell per action.** `Game.setBlock` (`src/game.ts:330`) calls `world.setBlock` and then `chunks.onBlockChanged`. `breakCell` (`game.ts:344`) and `placeTarget` (`game.ts:364`) both go through it. `placeTarget` uses `inventory.consumeSelected()`, which removes exactly one item.
- **Remesh cost per edit.** `ChunkManager.onBlockChanged` (`src/world/chunkManager.ts:184`) remeshes up to 8 chunks synchronously, on the main thread. A loop of single edits would freeze the game, so a volume must not use that path. There is no batch API.
- **Raycast.** `raycastVoxels` (`src/player/raycast.ts:18`) returns the hit cell and face normal, not the exact hit point. The point is `origin + dir × distance`.
- **Input.** Q, R, G, `[` and `]` are not used anywhere. The wheel is already the hotbar. Left mouse breaks, right mouse places (`game.ts:409-428`).
- **Highlight.** `BlockHighlight` (`src/render/highlight.ts:5`) draws one wire cube. There is no preview of a volume.
- **Undo, selection, region, fill.** None exist.
- **Item drops.** Each broken block spawns its own item (`game.ts:349`). That's fine for one block, but a volume would overflow the 256-item cap. Creative breaks drop nothing, so this waits for survival.
- **Save.** Edits go into `world.edits` and dirty chunks are saved as whole chunk records (`src/storage/save.ts:73`). A big volume becomes a few chunk writes, which is fine.

## Part 1: volumetric tools

### Batch edits (the core change)
- Add `World.setBlocks(changes)`. It checks every cell is loaded and has tops first. If any cell is not loaded, it changes nothing and returns false, so a volume never applies only partly at the load edge. It then writes all cells, records edits only for cells whose value actually changes, and updates the column tops.
- Add a batch path in `ChunkManager`. It bumps each touched chunk once and marks it for remesh through the deferred queue, not synchronously. A 32-block cube touches at most 27 chunks, so the remesh is spread over frames by the existing budget (`GEN_BUDGET_MS`, `MESH_BUDGET_MS` in `src/config.ts:85-86`).
- Add `Inventory.count(state)` and `Inventory.consume(state, count)`, for part 2 survival later. Creative doesn't use them yet, but the tests for the batch path should cover them.

### Pure geometry (new module, no three, no DOM)
- New `src/player/volumes.ts`. It produces the cells for each shape:
  - **box (cube)**: a solid box, or a shell. A shell is the outer box minus an inner box inset by the thickness on every side.
  - **sphere**: a solid ball, or a shell. A shell is the outer sphere minus an inner sphere with radius reduced by the thickness.
  - **plane**: a layer on an axis (x, y or z), with thickness, and an outline of rectangle or disc.
- **Thickness** is one number, in blocks, shared by the box, the sphere and the wall tool. `0` means full. Thickness is capped at 16 blocks (about 4.8 m), and it is also capped at half the size, so the inside always stays at least one block. Where the cap is reached, the shape is solid.
- It checks the cells against the player's body (`blockIntersectsBody` in `src/player/interaction.ts:6`) and drops any cell that would trap the player.
- It clamps the size to the limit from config (32 blocks per side for the first version).
- Tests in `tests/volumes.test.ts`: cell counts for each shape, solid and shell at several thicknesses, the thickness cap at half the size (solid when reached), the body filter, and the size clamp.

### Tool state and input
- A tool has a **mode** (single, add, remove), a **shape**, a **size** and a **thickness** (`0` = full).
- Keys: `R` cycles the mode, `Q` cycles the shape, `[` and `]` change the size, `,` and `.` change the thickness, and `G` jumps between full and a 1-block shell. Left mouse removes and right mouse adds, matching today's breaking and placing. Single mode keeps today's hold-to-break and right-click-to-place. `Comma`, `Period` and `KeyG` are not used anywhere else in `src`.
- The add tool places the volume on the empty cells touching the aimed face. The remove tool clears the cells inside the volume centred on the aimed block.

### Preview and application
- Extend `BlockHighlight` (`src/render/highlight.ts`) to draw an outline of the whole volume, not one cube. The outline recalculates only when the aimed cell changes.
- The HUD shows the tool name, size and thickness, for example "Sphere 1.8 m, shell 0.3 m, 96 blocks", or "Box 3 m, solid, 1,000 blocks".
- Applying a volume puts it on a job queue. Each frame it writes cells until a time budget is used, then the batch path remeshes the touched chunks. A 32-block cube finishes in a few frames, not in one.

## Part 2: building tools

### Walls, floors and roofs (one tool, three axes)
- The tool is **two-click**: the first click sets an anchor on the aimed face, the mouse moves to set the far corner, and the second click places it. `Esc` cancels. Two clicks are used instead of a drag because the mouse is held for breaking.
- The plane for the drag runs through the anchor and is perpendicular to the chosen axis. Walls use a vertical plane, floors and roofs a horizontal one. The far corner is where the mouse ray meets that plane, which needs one pure ray-plane function in `src/player/volumes.ts`. A ray parallel to the plane sets no corner.
- Width is the same **thickness** as the volumes, set with `,` and `.`. A wall of width 1 is one block thick, and a width of 0 is not allowed for walls, since a wall is always at least one block wide. A roof is a floor at a chosen height, so it uses the same code with a different axis.
- Phase 2 walls and floors are full blocks. Slabs can be used for half-height floors later.

### Flatten
- The owner aims at a surface and picks a footprint (rectangle or disc). The target level is the height of the aimed point.
- For each column in the footprint, the tool fills air up to the target level and removes blocks above it, using `topAt` (`src/world/world.ts:122`) to skip columns that are already done.
- The footprint is limited by the same size limit as the volume tools.

## Part 3: undo
- A stack of the last 20 batch actions, in memory only. Each entry stores the old and new values of the cells it changed. `Ctrl+Z` undoes the last action and is cleared on reload. Undo goes through the same batch path, so it remeshes the same way.

## Critical files

- `src/world/world.ts`: `setBlocks` next to `setBlock` (line 170).
- `src/world/chunkManager.ts`: batch dirty marking next to `onBlockChanged` (line 184), `markDirty` (line 491).
- `src/game.ts`: tool state, key handling in `handleBlockActions` (line 409), the job queue in `fixedUpdate`, `updateTarget` (line 389).
- `src/player/inventory.ts`: `count` and `consume` next to `consumeSelected` (line 78).
- `src/player/volumes.ts` (new): shapes, ray-plane, clamp, body filter.
- `src/render/highlight.ts`: volume outline.
- `src/ui/hud.ts`: tool label.
- `src/config.ts`: volume size limit, job time budget, key bindings for the tool.
- `src/debugApi.ts`: methods to run each tool headless (for smoke checks).
- `tests/`: `volumes.test.ts`, `world.test.ts` (batch all-or-nothing), `chunkManager.test.ts` (one remesh per chunk per batch).

## Suggested order

1. **Batch edit path** (Claude, the core change). `World.setBlocks`, chunk batch, inventory count and consume. Tests show each touched chunk is remeshed once.
2. **Pure volume module** (Haiku-sized, given the spec). Shapes, body filter, clamp, tests.
3. **Volume tools in single-click and drag form** (Claude). Modes, shapes, preview, job queue. Cube, sphere and plane first.
4. **Walls, floors and roofs** (Claude for the ray-plane and drag). Haiku can write the tests.
5. **Flatten** (Claude).
6. **Undo** (Haiku-sized).

## Verification

- Each step: `npm run check`.
- Frame time: the main thread stays under 4 ms per frame for streaming (`docs/ROADMAP.md`) while a volume is applied, measured with the F3 overlay.
- Smoke (`npm run smoke`): one check per tool through the debug API, for example "a solid sphere of radius 3 adds the expected count of blocks, and the chunks are remeshed once".
- Owner playtest, about 10 minutes: build a wall, a floor and a roof of one volume each; flatten a hillside; undo; try single-block mode to confirm nothing changed.

## Risks

- **Remesh spikes.** A volume touches many chunks. Mitigation: the job queue and one remesh per chunk.
- **Partial applies at the load edge.** Mitigation: the all-or-nothing check in `setBlocks`.
- **Key conflicts.** `Ctrl+Z` may clash with browser shortcuts. Mitigation: `preventDefault` while the pointer is locked.
- **Save size.** A large volume creates many dirty chunks in one save. Measure before raising the size limit.
- **Ray-plane edge cases.** A ray parallel to the plane or behind the anchor. Mitigation: the pure function returns no corner in those cases, and tests cover them.

## Decisions (answered by the owner)

- **Creative rules for now.** Tools are free and instant, with no inventory use and no break time.
- **Size limit: 32 blocks per side** (about 9.6 m), applied over several frames.
- **Size keys: `[` and `]`.** The mouse wheel stays on the hotbar.
- **Hollow is a thickness, not a switch.** Box, sphere and wall share one thickness value, from 0 (full) up to 16 blocks, capped at half the size. The owner's suggestion made this the single control for hollow, shell and wall width.
- **Undo: `Ctrl+Z`, the last 20 actions**, in memory only.

## Suggestions (not in scope)

- **Copy and paste of a volume**, with rotation. The roadmap already lists it under building tools.
- **Replace mode:** only change cells of one chosen material.
- **Material picker:** use the hotbar block, or pick a different material per tool.
- **Domes and vaults.** A sphere shell cut in half gives a dome, and a half-shell with a flat base gives a bunker or a cave roof. This could be a cut plane on the sphere tool.
- **Openings.** Cut a door or window through a shell with the same plane tool, set to remove.
- **Snap to a grid in metres** (for example 0.9 m, a three-block module), in addition to the 0.3 m grid.
- **Live size readout** in metres and blocks, as part of the HUD label.
- **Slabs for floors and roofs,** so a floor can be half a block thick.
- **Survival costs and merged drops** for volumes, when phase 7 arrives. Drops should be merged per material so 1,000 blocks don't fill the item cap.
- **Debug API methods for each tool,** so each one can be tested without a playtest.
- **Measure before the size limit grows.** Start at 32 blocks per side and raise it only after frame time is measured.
