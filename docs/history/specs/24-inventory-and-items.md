# Spec 24: Inventory, held block, timed breaking, drops and pick-up

**Built by:** Claude. Requested by the owner, outside the roadmap phases. It takes the first slices of phase 7 items 3
(mining, with a crack overlay) and 4 (items and inventory), and adds the drop and pick-up that go with them. Crafting,
tools, tool tiers, fire and textures are not part of it.

## Goal

The player carries real stacks of blocks. Breaking a block takes time and shows its cracks, the block drops onto the
ground as an item, walking over the item picks it up, and placing a block uses one from the stack. The player can open
an inventory grid, move stacks around, and choose which block is in the hand.

## Decisions made without the owner

These are the defaults chosen for this spec. Each can be changed in one place.

- **Starting stacks.** A new world starts with the nine default hotbar blocks, 64 each. Nothing else.
- **Placing consumes.** Placing a block takes one from the selected hotbar slot. An empty slot places nothing.
- **Pick block** (middle click) stays a creative shortcut. If the block is already in the hotbar, its slot is selected.
  Otherwise the selected slot gets a full stack of 64 of that block, and any stack that was there moves into the grid.
- **Drops are the block itself.** Breaking a block drops one item of its own block state. Grass drops grass, not dirt.
  Plants drop themselves. Nothing drops from bedrock or water.
- **Breaking time** is the block's hardness in seconds, with no tool modifier. Hardness 0 breaks at once.
- **Dropped items persist.** They are saved with the world, so they are still there after a reload.

## Requirements

1. **Inventory model.** The inventory has 36 slots: slots 0–8 are the hotbar, slots 9–35 the main grid. A slot is empty
   or holds a stack of one block state with a count from 1 to `MAX_STACK` (64). Adding a block fills existing stacks of
   that state first, then empty slots, and returns what did not fit. The hotbar selection (0–8) is part of the inventory.
   The existing `Hotbar` behaviour moves into this model unchanged: select, scroll with wrap-around, and pick.
2. **Cursor clicks.** Clicking a slot in the inventory screen works like the usual grid: with an empty cursor it takes
   the whole stack; with a stack on the cursor it puts the stack down, merges into a stack of the same block (up to
   64, the rest stays on the cursor), or swaps with a different block. The model has one pure function for this.
3. **Held block.** The selected block is shown in the bottom-right of the view, as a small cube (or two crossed quads
   for plants) that uses the block's texture and the same light as the world. It stays on screen when the player looks
   straight down. It sways while the player walks and swings
   when a block is broken or placed. Nothing is shown when the selected slot is empty. The held block is drawn after the
   world with the depth buffer cleared, so it never clips into walls.
4. **Timed breaking.** Holding the left button starts breaking the targeted block. Its progress rises by `dt / hardness`
   each frame while the button stays down on the same block. Moving the aim to another block, or releasing the button,
   resets the progress. A block with hardness 0 breaks on the first frame. Bedrock and water cannot be broken. The
   debug call `breakTarget()` still breaks at once, so the automated tests stay simple.
5. **Crack overlay.** While a block is being broken, a slightly larger cube with ten crack textures covers it, one
   texture for each tenth of the progress (stage 0 to 9). It is hidden when no breaking is in progress. The ten crack
   textures are new procedural tiles in the atlas, added after the existing tiles so no tile number moves.
6. **Drops.** When a block breaks, one item of its block state appears at the centre of the cell. It pops up with a small
   random sideways push and falls under gravity. It rests on solid blocks, slides to a stop with friction, and falls
   through water. The item is drawn as a small spinning, bobbing cube (or crossed quads for plants) with the block's
   texture. The item lasts `ITEM_LIFETIME_S` (300 s) and then disappears. At most `MAX_ITEMS` (256) items exist; a new
   one removes the oldest.
7. **Pick-up.** An item is collected when the player is within `ITEM_PICKUP_RADIUS` (0.9 m horizontally) of it, the
   item lies between one block below the player's feet (`ITEM_PICKUP_BELOW`, 0.3 m) and the top of the head, and the item
   is at least `ITEM_PICKUP_DELAY_S` (0.6 s) old, so a dropped block is not taken back at once. The reach below the feet
   means a block dug out from under the player can be picked up without moving into the hole. It goes into the inventory. If the inventory has no room for it, the item stays on
   the ground.
8. **Placing.** `placeTarget()` places the selected block and takes one from its stack. It does nothing when the stack
   is empty, and the stack is not taken when the placement is refused.
9. **Save.** The meta record stores the 36 slots (block states by name, with counts) and the dropped items (state name,
   position). A save written by spec 8 has a `hotbar` list and no inventory. It is loaded with the hotbar as the first 9
   slots, each with 64, and no items. `SAVE_VERSION` stays 3, so no existing save is cleared. Invalid stored entries are
   repaired or dropped, as the other save fields are.
10. **HUD.** The hotbar shows the stack count under each slot when it is more than one. Empty slots are blank.
11. **Inventory screen.** Pressing E opens a panel with the 36 slots, the hotbar row at the bottom, and the cursor stack
    that follows the mouse. The pointer unlocks while the panel is open, and the pause menu does not appear. E or Escape
    closes it and returns any stack on the cursor to the inventory (or drops it at the player's feet when there is no
    room). Closing re-locks the pointer when the browser allows it. While the panel is open, no block is broken or placed,
    and the view does not turn.
12. **Config.** Every number above lives in `src/config.ts`: stack size, inventory size, item size, lifetime, cap, pick-up
    radius and delay, friction, pop speed, the held-block offset and scale, and the swing time. Hardness is a block
    property and lives in `src/world/blocks.ts` as an option on each block type (default 1.5 s, stone-like).
13. **Pure modules stay pure.** The inventory, breaking and item physics are in modules with no three.js and no DOM, so
    they run in Node. The meshes, the held block, the overlay and the screen are in `src/render` and `src/ui`.

## Out of scope

- Crafting, tools, tool speed, durability, and tiers of breaking.
- Item stacking on the ground, item merging, and items floating in water.
- Items attracting towards the player (they are picked up only when walked over).
- Sounds for pick-up and inventory clicks. The breaking and placing sounds stay as they are.
- Drops that differ from the block (leaves dropping saplings, stone dropping cobblestone) and mob drops.
- Textures from a pack (a separate decision, later).

## Acceptance criteria

- `npm run check` passes, with every test case below present and passing.
- `npm run smoke` passes with no console error. Its new checks cover the inventory, a timed break, the drop and pick-up,
  and the crack overlay.
- In the game: holding the left button on a stone block shows the cracks growing and then breaks it in about 1.5 s; the
  stone then lies on the ground until it is walked over and goes into the hotbar; the held block matches the selected
  slot; E opens the grid and the stacks can be moved; a reload keeps the stacks and the items lying on the ground.

## Test cases

1. (`tests/inventory.test.ts`) The starting inventory has the nine default blocks, 64 each, and 27 empty main slots.
2. `add` merges into existing stacks before it uses empty slots, never exceeds 64 per stack, and returns the leftover
   when the inventory is full.
3. Select and scroll keep the existing hotbar behaviour (test from `tests/interaction.test.ts`, moved to the inventory).
4. `consumeSelected` takes one item and empties the slot at zero. It returns false on an empty slot.
5. `clickSlot` with an empty cursor takes the stack; with a cursor it places, merges up to 64 and keeps the rest, and
   swaps with a different block. Clicking an empty slot with an empty cursor does nothing.
6. `pick` selects a block in the hotbar; otherwise it puts a full stack in the selected slot and moves the old stack to
   the grid.
7. (`tests/breaking.test.ts`) Hardness 0 breaks on the first update. Hardness 2 breaks after 2 s of holding, not before,
   and the stage goes from 0 to 9 in tenths of the progress.
8. Moving to another cell resets the progress; releasing the button resets it; the cell is returned exactly once.
9. (`tests/itemEntities.test.ts`) A spawned item moves up first, then falls and rests on a solid floor at the floor's
   height.
10. Friction stops a sliding item on the ground.
11. An item is not collected before the delay, is collected within the radius, and is not collected beyond the radius.
    A full inventory leaves it on the ground.
12. An item disappears after its lifetime, and spawning past `MAX_ITEMS` removes the oldest.
13. Items snapshot and restore with the same states and positions.
14. (`tests/save.test.ts`) An inventory with counts round-trips by name. A save with only `hotbar` loads with 64 each in the
    first nine slots. An invalid stored item is dropped, and the rest of the save is kept.
15. (`tests/atlasPixels.test.ts`) The ten crack tiles exist. Each stage has at least as many opaque pixels as the one
    before it, and stage 9 has more opaque pixels than stage 0.
16. Every breakable block type has a finite hardness of at least 0, and the plants have 0.
