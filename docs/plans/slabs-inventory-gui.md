# Plan: slabs, a visible inventory, and a proper GUI

## Context

The owner asked for three things:
1. **Slabs** like Minecraft. The sketch shows a half-height piece, 0.15 m tall, sitting on top of or inside a 0.3 m block.
2. **An inventory that opens reliably**, with a visible button. Today it did not open for the owner, and there is no button to click.
3. **A proper GUI** so the game starts to look like a finished interface. This is planning only.

## What the code does today (read, not run)

- **E opens the inventory only while the pointer is captured.** `src/game.ts:230` checks `this.playing`, which is set by pointer lock (`game.ts:162-163`). If the browser doesn't capture the mouse, E does nothing. `src/input/input.ts:33-40` swallows the lock error, so the player gets no message.
- **No on-screen button.** `src/ui/hud.ts` draws only the hotbar. The controls live in the README, not in the game.
- **Not reproduced.** I can't run a browser in plan mode, so the cause is a strong hypothesis, not a confirmed bug. The fix below removes the dependency either way.

## Slabs

- **Shape.** Add a `slab` shape next to `cube` and `cross` in the block definitions (`src/world/blocks.ts`, `BlockDef`). A slab is a state variant of its material, with a `bottom` or `top` half. The height, 0.15 m, goes in `src/config.ts` and converts to blocks with `metersToBlocks`.
- **One cell, one state.** A cell can hold only one block state, so the two halves can't coexist as separate blocks. Placing a slab on the empty half of a slab cell of the same material turns that cell into a full block. Placing it on a different block's face goes into the empty cell next to it, as in Minecraft.
- **Placement.** The half is picked from where on the face the player aims: the upper half of a face gives a `top` slab, the lower half gives `bottom`. The logic goes in `src/player/placementTarget.ts`, which already picks the target cell.
- **Collision.** Today `isSolidAt` returns a yes or no per cell (`src/game.ts:185`), so a slab would block the whole cell. The sweep in `src/player/physics.ts` (`moveAndCollide`) needs each cell's solid height range (0 to 0.5 or 0.5 to 1 of the cell). This is the largest core change. A walker can already step onto a 0.15 m slab, because the step-up limit is 0.6 m (`docs/HANDOFF.md`).
- **Meshing.** `src/render/mesher.ts` culls faces by cell. A slab face isn't a full face, so a neighbouring cube must still draw the part of its face the slab doesn't cover. Shortcut: slabs don't hide neighbour faces and don't block light, so neighbours always draw their faces. Shortcut: `shortcut: slabs never cull or block light, upgrade when the mesher handles partial faces`.
- **Items.** Each slab material gets an item icon, drawn with `drawBlockIcon` in `src/ui/hud.ts`. It stacks normally in `src/player/inventory.ts`.
- **Saves.** Blocks are saved by name (`src/storage/save.ts`), so adding slab names doesn't break existing saves.
- **Which materials.** Default: planks, cobblestone, stone, sandstone and limestone. The owner can change this.

## Inventory access

- Keep E. Add an **Inventory button** to the HUD (`src/ui/hud.ts`) that calls the same `toggleInventory` (`src/game.ts:439`). A button click doesn't need pointer lock, so the screen opens even when the mouse isn't captured.
- When the pause menu is showing, the button still works. The pause menu shows the key hints: E for inventory, Esc to pause.
- Drop the silent failure: when a lock attempt fails, the pause menu says "Click the game to capture the mouse", instead of showing nothing.

## GUI

- **Stack.** Preact on top of the existing `src/ui/*.ts` and `src/style.css`. Components render into the same container, and three.js stays out of the UI code. The roadmap asks for a yes before any new dependency; the owner gave it.
- **Look.** One set of design tokens at the top of `src/style.css` for colours, borders, spacing and font. Panels get a two-pixel frame and a dark translucent fill, matching the pixel textures in the atlas.
- **Screens.** Start menu, pause menu, settings, inventory. Later: death screen (phase 7 of the roadmap) and crafting (phase 7).
- **HUD.** Crosshair, hotbar with stack counts and a selected-slot frame, the Inventory button, and the existing F3 overlay.
- **Inventory.** Item name tooltip on hover. The existing click-to-pick-up behaviour stays.
- **Accessibility.** Real `<button>` elements, visible focus rings, text contrast, and keyboard reach for every menu button. Accessibility is never cut.
- **Components.** Reuse `el()` from `src/ui/dom.ts`. Add a shared button or panel helper only when three or more screens need it.

## Suggested order

1. **Inventory button and key hints.** Small, and it answers the owner's complaint right away. Haiku-sized.
2. **Slabs.** Blocks, placement and collision are core code, so Claude builds them. The mesher and collision parts need a larger model's review first (`docs/HANDOFF.md`).
3. **GUI pass.** Tokens, menus, HUD, tooltips. Can be split per screen.

## Verification

- Each step: `npm run check`. New pure logic gets Node tests in `tests/`: slab half from the hit position, the double-slab rule, collision height per cell, and the inventory open and close state.
- Smoke (`npm run smoke`): one check that the inventory button opens the screen with the pointer free, and one that a placed bottom slab lets the player stand at half height.
- Owner playtest, about 5 minutes: place slabs on top and on the bottom, walk over them, open the inventory with E and with the button.

## Decisions (answered by the owner)

- **Slabs on every cube block type.** The owner picked all three options: planks, cobblestone, stone, sandstone, limestone, and every other cube. Slabs reuse each block's existing textures, so the art cost is only the item icons.
- **UI library: Preact.** A dependency, approved by the owner. Preact is about 4 KB and uses the React component model. It is added with the GUI pass, and only as a tiny runtime dependency. Vitest stays at 4.0.18.
- **GUI scope: full pass now.** Menus, HUD, inventory tooltips and settings in one pass, plus the inventory button and key hints from the first step.

## Suggestions (not in scope)

- **Stairs.** The next Minecraft shape. It fits the same half-cell state model.
- **Creative item browser** with search. Useful for testing new blocks as well as for the player.
- **Shift-click to move a stack** between the hotbar and the inventory.
- **Controls strip.** A short line of key hints on screen for the first minute, which would have prevented this complaint.
- **Pause when the window loses focus.** The save already runs on hide (`src/game.ts:167`).
- **UI scale setting** and a colour-blind-safe selection frame.
