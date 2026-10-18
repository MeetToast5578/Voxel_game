# Voxel Game

A Minecraft-like voxel sandbox that runs in the browser, built with TypeScript, Vite and three.js.

- Endless procedural terrain: hills, mountains, beaches, rivers, lakes, trees and caves, with layers of granite, diorite, andesite, sandstone, limestone, slate and basalt underground, deepslate below 100 m underground, bare rock on steep ground, ore veins (coal, iron, gold, redstone, lapis, diamond, emerald) by depth band, grass blocks that are green on every side, and tall grass, ferns, poppies, dandelions and mushrooms on the grass
- Walk, sprint, jump, fly and swim, with block collisions
- Ledges up to 0.6 m are stepped up automatically, no jump needed
- Break and place 35 block types, gravel included. Water flows: the source block spreads, and it levels out.
- Physics: sand and gravel fall, water flows and levels out (flowing water is shown at its level), and a big enough collapse makes the broken blocks tumble, float or sink by their density, and settle back into blocks Breaking takes time and shows cracks; the block drops as an item that you pick up by walking over it
- 36-slot inventory (E) with a 9-slot hotbar and stacks of 64; the selected block is shown in your hand
- Day/night cycle, sky and block lighting (glowstone), clouds, simple sound effects
- Start/pause menu with render distance, field of view and mouse sensitivity
- Automatic saving in the browser (IndexedDB), including the inventory, items on the ground and time of day
- Saves from older versions, including the 0.6 m blocks, are not loaded.
- Sixteen tree and shrub species, including willow curtains, mangrove prop roots, tapered conifers, palm fronds and branching desert cacti
- Terrain generation and meshing run in Web Workers
- 1 block = 0.3 m; the player is about 6 blocks tall. Trees are 8–12 m tall. A chunk is 4.8 m wide.
- No height limit: the world is made of 16×16×16 chunks, so you can dig down or build up as far as you like

All textures and sounds are generated in code; there are no asset files.

## Run

Requires Node.js 20+.

    npm install
    npm run dev        # then open http://localhost:5173 and click Play

## Controls

| Input | Action |
|-------|--------|
| Mouse | Look |
| W A S D | Move |
| Space | Jump / fly up / swim up |
| Left Shift | Sprint / fly down |
| F | Toggle flying |
| Hold left click | Break block (it takes time; the cracks show progress) |
| Right click | Place block (uses one from the stack; hold to repeat) |
| Middle click | Pick the targeted block into the hotbar |
| 1–9, mouse wheel | Select hotbar slot |
| E | Open or close the inventory; the HUD Inventory button also works without mouse capture |
| F3 or ` | Debug overlay |
| Esc | Pause menu, or close the inventory |

### Volume tools

Press **R** to cycle the mode: single block (the default), add volume, or remove volume. In add or remove mode, right click adds and left click removes, and holding does nothing. **Q** cycles the tool.

| Input | Action |
|-------|--------|
| R | Mode: single block, add volume, remove volume |
| Q | Shape: box, sphere, plane, wall, floor, roof, flatten |
| [ and ] | Size, 1 to 32 blocks (about 9.6 m) |
| , and . | Thickness (box and sphere: 0 is solid; wall and floor: width) |
| G | Box and sphere: solid, or a one-block shell |
| C | Plane and flatten: square or disc |
| X or Esc | Cancel a wall, floor or roof you started (Esc also pauses) |
| Ctrl+Z | Undo the last volume action (the last 20 in this session) |

A wall, floor or roof takes two clicks: the first sets its corner, the second sets the far corner. A roof is a horizontal layer built upward from the aimed block.

The **build tool panel** on the top left shows every setting at once: the mode, shape, size, thickness or outline, the frame state, the number of blocks the next action changes, the block used by add, and the undo steps left. It shows the settings in single-block mode too, so you always know what is selected.

**Blocks tab (creative):** press E, then the **Blocks (creative)** tab, and click any block in the game. A full stack of it goes into the selected hotbar slot. It is there for testing and is not limited by survival rules. A floor on a ceiling grows downward. Flatten works on either button: it fills the footprint up to the height of the aimed block and clears the blocks above it.

The pause menu has a **New world** button that deletes the save and generates a new random world.

## URL parameters

| Parameter | Effect |
|-----------|--------|
| `?seed=123` | Play a specific world (does not load or overwrite your save) |
| `?nosave=1` | Never read or write the save |
| `?autostart=1` | Skip the menu (used by the automated tests) |
| `?workers=0` | Generate and mesh on the main thread instead of Web Workers |

## Development

    npm run check      # typecheck + unit tests + production build
    npm run smoke      # headless Chromium test; writes screenshots to screenshots/

`npm run smoke` needs a Chromium for Playwright; run `npx playwright install chromium` once if it is missing.

CI (GitHub Actions) runs `npm run check` and `npm run smoke` on every pull request and every push to `main`.

### Layout

| Folder | Contents |
|--------|----------|
| `src/core` | math, seeded random numbers, coordinates, fixed-timestep loop |
| `src/world` | blocks, chunks, terrain generator, chunk streaming, lighting, day/night |
| `src/render` | mesher (face culling + ambient occlusion), textures, three.js renderer, clouds |
| `src/player` | physics, player controller, raycast, interaction rules, inventory, breaking |
| `src/items` | dropped items: falling, pick-up, lifetime |
| `src/ui`, `src/input`, `src/audio`, `src/storage` | HUD, menu, debug overlay, input, sounds, saves and settings |
| `src/workers` | Web Worker pool for generation and meshing |
| `tests` | Vitest unit tests for all logic modules |

Tree generation updates apply to regenerated, unedited terrain. Saved edits remain in place. Worlds containing newly placed cactus blocks require this version or newer.
