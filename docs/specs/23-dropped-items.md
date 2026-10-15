# Spec 23: Dropped items and pickup

**Built by:** Claude. Roadmap phase 7 items 3–4 (mining drops, and the start of items).

## Problem

Breaking a block leaves nothing behind. The reference game drops broken blocks as items that fall, and the roadmap
asks for the same. Survival needs items to exist, and that needs an entity that moves and can be picked up.

## Goal

A broken block becomes a small cube of its texture that falls, lands, turns on the spot and can be picked up. The
player picks it up by walking close, and the count shows in the F3 overlay.

## Requirements

1. **Drop.** Breaking a block (any block that `canBreak` allows) spawns one item in the broken cell, with the broken
   block's state. The item's centre is in the middle of the cell; its bottom face is half an item height below that
   centre.
2. **Size.** An item is a cube half a block wide (`ITEM_SIZE_M` 0.15 m), so 0.5 blocks on each side.
3. **Start.** An item starts with no vertical speed and a random sideways speed of up to `ITEM_SPREAD_M_S` (0.5 m/s)
   each way on X and Z, and a random spin.
4. **Fall.** Gravity is `GRAVITY`, with the speed capped at `ITEM_TERMINAL_M_S` (20 m/s). Movement uses
   `moveAndCollide` from `src/player/physics.ts` against solid blocks, in sub-steps of at most 1/240 s, so an item cannot
   pass through a thin floor.
5. **Rest.** On landing, the item's sideways speed is zeroed. It stays put until the block under it is broken.
6. **Spin.** The item turns `ITEM_SPIN_DEG_S` (90°) per second, wrapped into [0, 360).
7. **Stuck items.** If an item overlaps a solid block (for example a block was placed where it lies), it moves up one
   block at a time. If it is still inside solid after 8 blocks, it is removed.
8. **Pickup.** The player picks up an item when all three are true:
   - its pickup delay has run out (`ITEM_PICKUP_DELAY_S`, 0.5 s after it drops, so it doesn't snap back into the
     player's hand),
   - its centre is within `ITEM_PICKUP_RADIUS_M` (1.0 m) of the middle of the player's body,
   - the player has spawned (items do not move or get picked up before the spawn is ready).
   A picked-up item is removed and adds one to `HeldItems` for its block state.
9. **Cap.** At most `DROPPED_ITEM_MAX` (64) items exist. Dropping one more removes the oldest.
10. **Drawing.** Each item is a cube with the block's own atlas tiles (top, side and bottom faces), lit with the same
    material as the chunks. It is fully sky-lit; daylight still dims it at night. Items are not drawn with block
    light from their cell (see out of scope).
11. **Held count.** The F3 overlay shows `Held items N` after the selected block. N is the total of all pickups in this
    session.

## Out of scope

- Saving. Items and the held count are lost when the page reloads. Saving them changes the save format, which is a
  separate change.
- Stacks, an inventory screen and placing held items. These are roadmap phase 7 item 4.
- Items moving with water, or being pushed by currents. These wait for fluid levels (phase 5 item 4).
- Block light on items. Items use full sky light instead.
- Merging nearby items of the same type.
- Item entities as a general system. Items are a plain list in `Game`; the entity system is roadmap phase 6 item 1.

## Acceptance criteria

- `npm run typecheck`, `npm run test` and `npm run build` pass.
- `npm run smoke` passes with no console error.
- In a headless run, breaking a block makes one more item, and the item lands on the surface below within 2 s.
- The held count goes up by one when the player walks within 1 m of a landed item after 0.5 s.

## Test cases

1. **Spawn.** The item is centred in the broken cell and has no vertical speed. With a fixed random source, its
   sideways speed is at the edge of the spread and its pickup delay is 0.5 s (`tests/droppedItems.test.ts`).
2. **Landing.** An item dropped 3 blocks above a floor comes to rest on top of the floor, with no vertical speed, after
   2 s of steps at 1/60 s.
3. **No tunnelling.** An item falling onto a one-block-thick floor stops on top of it.
4. **Sideways stop.** An item that lands with sideways speed has that speed zeroed on landing.
5. **Spin.** Spin advances by 90° per second and wraps into [0, 360).
6. **Pickup delay.** The delay counts down to zero and no lower.
7. **Stuck items.** An item placed inside a block is moved above it. An item inside solid rock for more than 8 blocks is
   removed.
8. **Pickup range.** An item is picked up only after its delay, and only within the radius.
9. **Cap.** Adding more than 64 items keeps the newest 64.
10. **Held count.** Pickups are counted per block state and totalled (`tests/droppedItems.test.ts`).
11. **Overlay.** The F3 line reads `Selected Dirt   Held items 3` for three held items (`tests/debugText.test.ts`).
