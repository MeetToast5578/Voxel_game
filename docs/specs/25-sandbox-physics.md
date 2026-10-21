# Spec 25: Sandbox physics (program)

> Update 2026-10-21: spec 47 extends the original water-only flow/body rules to lava,
> adds water/lava reactions and survival fluid hazards. Its rules supersede older
> statements below that lava is not implemented. Pending-fall persistence remains open.


Phase 5 of [the roadmap](../ROADMAP.md), items 1–5, plus the shared body work from phase 6 item 2. This is the plan for a physics layer: falling blocks, fluid flow, structural collapse and loose rigid bodies. It is a program spec. Each slice below gets its own branch, pull request and detailed spec when it is reached, as the roadmap asks. Slice 1 is the first to be specced in full.

## Goal

The world reacts to the player's edits. Sand falls, water flows, unsupported blocks collapse, and broken blocks tumble. These are the physical behaviours that creatures, survival and weather will build on.

## Current state

- Player movement uses an AABB sweep (`moveAndCollide` in `src/player/physics.ts`), with buoyancy and drag in water.
- Dropped items use gravity and friction (`ItemEntities` in `src/items/itemEntities.ts`).
- Water is a static block. Nothing falls, flows or collapses.
- There is no tick system. `ChunkManager` (`src/world/chunkManager.ts`) only loads and meshes.

## Decisions

- **Block-level physics, not entities, for falling blocks and fluids.** A falling sand block moves one cell per tick, as in Minecraft. Only loose debris (slice 6) is a free body.
- **Rules live in the block registry.** Optional fields on each block type say whether it falls, flows or supports blocks above it. The mesher and renderer do not hold rules.
- **Pending ticks are saved with their chunk.** A half-fallen block must not freeze in the air after a reload. Ticks too old to matter are dropped by the catch-up rule: a chunk reloaded after a long time applies the expected outcome and does not replay ticks.
- **Fluid levels are block-state variants.** The architecture already supports variants, and the save stores names, so adding them does not break saves.
- **Nothing random.** Any choice a tick makes comes from the world seed and the tick number, so a reload or a cache gives the same result.

## Slices

### Slice 1: Tick core

Requirements:
- Each chunk keeps a queue of scheduled ticks. A tick names a world cell, a due tick number and a reason.
- The queue runs in a fixed order: by due tick number, then by cell position. Results do not depend on insertion order.
- A per-frame budget caps the work on the main thread at 2 ms. Ticks left over wait for the next frame.
- A tick that reaches a chunk border is handed to the neighbouring chunk's queue.
- The F3 overlay shows the tick cost and the number of pending ticks.

Acceptance criteria:
- The same set of ticks, added in any order, runs in the same order.
- Work stops when the budget is used up, and the rest runs on later frames.
- A border tick runs in the neighbouring chunk.
- An empty queue costs nothing measurable.
- `npm run check` passes.

Test cases (Node, `tests/`): ordering with shuffled insertion; budget cut-off; border hand-over; empty queue.

### Slice 2: Rule fields on blocks

Requirements: add optional `falls`, `flows` and `supports` fields to each block type in the registry, with defaults that change no behaviour.

Acceptance criteria:
- Every existing block reports the same results as before.
- A save round-trip keeps block names unchanged.
- `npm run check` passes and no existing behaviour changes.

### Slice 3: Falling blocks

Requirements:
- Sand and gravel move down one cell per tick through air, water or plants. Water and plants are replaced, as in Minecraft.
- A falling block stops when the cell below is solid.
- A block that lands keeps its name.
- Removing the block under a falling block starts its fall.
- Pending falls are saved with the chunk and resume after a reload.

Acceptance criteria:
- A single column of sand falls to the ground.
- A stack of two sand blocks falls and lands in order.
- Sand falling onto a plant replaces the plant.
- A fall across a chunk border completes with no gap or duplicate.
- After a reload the fall finishes where it would have.
- Smoke check: dig under sand and see it fall.

### Slice 4: Fluid flow

Requirements:
- Water has 8 levels, a falling flag and a source flag. Lava uses the same rules on a slower tick.
- Each tick a fluid cell moves toward its lowest neighbours, preferring the nearest drop within a few blocks (roadmap phase 5, item 4).
- Water meeting lava makes stone.
- The mesh uses the level for the surface height.

Acceptance criteria:
- Water on flat ground levels out.
- Water falls down a hole and stops at a wall.
- A source block keeps its level.
- Water meeting lava turns to stone.
- The surface height in the mesh matches the level.
- Smoke check: dig a hole beside a lake and it floods.
- Frame time stays within the tick budget.

### Slice 5: Structural collapse

Requirements:
- When a block is removed, blocks above and beside it check their support within a fixed radius. The check never covers the whole world.
- A block with no support starts to fall (slice 3), or if it cannot fall, breaks and drops as an item.
- Leaves are excluded. Ecology (roadmap phase 5, item 2) owns leaf decay.

Acceptance criteria:
- An overhang whose support is removed collapses.
- A block with a second support stays.
- A cascade stops at the radius.
- A long cave roof does not collapse all at once.

### Slice 6: Loose rigid bodies

Requirements:
- The sweep in `src/player/physics.ts` works for any box-shaped body with mass and density. Players and items keep their current behaviour.
- Broken or collapsed blocks above a set size become tumbling bodies. They gain spin, collide with blocks, and float or sink by density.
- A body that slows down turns back into a block or an item.

Acceptance criteria:
- A body rests on a floor.
- A body slides on a slope.
- A body floats in water and sinks when heavier than water.
- Twenty bodies run within the frame budget.
- Smoke check: break a stacked block and see it tumble.

This slice overlaps phase 6, item 2 (shared physics). It is the largest slice. A larger model should review its plan before Haiku builds it.

## Risks

- **Remesh storms.** A flowing lake changes many cells in one tick. Batch changes per tick and remesh each chunk once per tick.
- **Cascades.** Flow and collapse could run far in one tick. Use radius and budget limits, and a fixed order.
- **Save growth.** Pending ticks add to each chunk record. Keep them small and clear them when they finish.

## Verification

- Each slice: `npm run check` before the push.
- Each slice that changes the world: one headline check added to `npm run smoke`.
- Once per phase, a 10-minute playtest with a real mouse and keyboard.
- Performance: ticks stay within 2 ms per frame on the main thread. Mesh time must not rise above the current 3–3.7 ms per chunk.
