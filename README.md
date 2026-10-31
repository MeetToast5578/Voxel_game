# Voxel Game

A voxel sandbox that runs in the browser, built with TypeScript, Vite, three.js and Preact. Blocks are 0.6 m; the
world is made of 16×16×16 chunks (9.6 m) with no height limit.

- **World:** biomes from climate fields; rock strata, caves, groundwater and lava below; ores by volume; trees,
  flowers, boulders and fallen logs; rivers and lakes from one world-wide drainage network, with waterfalls; far
  terrain out to 2 km.
- **Living world:** water and lava flow; sand and gravel fall; grass spreads; leaves decay; crops and saplings grow;
  snow settles and ice forms in the cold.
- **Sky:** seasons, day and night, moon phases, clouds, rain, snow and storms with lightning and thunder.
- **Play:** creative and survival; inventory, crafting, furnaces, tools that wear out, health, hunger and breath;
  torches, doors, beds, stairs, slabs and chests; dropped items; 12 creature species, some of them hostile at night.
- **Saves:** automatic, in the browser (IndexedDB). Worlds can be exported and imported as files from the pause menu.

All textures and sounds are generated in code; there are no asset files.

## Run

Requires Node.js 22.

    npm install
    npm run dev        # then open http://localhost:5173

The title screen continues the last world or starts a new one: survival or creative, with a difficulty (peaceful,
normal or hard). New players get short hints in survival; the recipe list in the crafting screens fills the grid for
you.

A production build (`npm run build`, then `npm run preview`) can be installed from the browser and played offline.

## Controls

| Input | Action |
|-------|--------|
| Mouse, W A S D | Look, move |
| Space | Jump; swim up; fly up |
| Shift | Fly down; crouch (stops you walking off edges); climb down a ladder |
| Ctrl | Sprint; fly faster |
| Left click | Break (takes time in survival) or hit a creature |
| Right click | Place, use (doors, beds, chests, furnaces, crafting tables, campfires), eat, wear armour, fill or empty a bucket, bone meal on crops; hold with a bow to draw, let go to shoot |
| Middle click | Creative: pick the block you look at |
| 1–9, mouse wheel | Choose a hotbar slot |
| E | Inventory and crafting |
| Q | Throw one of the held item |
| H | Hide the current hint |
| F | Toggle flying |
| T | Skip an hour |
| + / − | View distance |
| B / G | Creative: mark corners and fill / clear a box with the held block |
| Ctrl+Z / Ctrl+Y | Creative: undo / redo |
| F3 | Debug text and frame-time graph |
| Esc | Pause menu: difficulty, settings (keys, volume, invert Y, menu size), worlds, export and import |

Every key above except the hotbar numbers, Ctrl+Z/Y and Esc can be changed in the settings.

A gamepad works too: in menus and inventory screens the d-pad or left stick moves between buttons and slots, A clicks,
X right-clicks a slot, B goes back and Start pauses or resumes. Touch screens get on-screen controls (`?touch=1`
forces them).

## URL parameters

Without any, the title screen opens. With any, the game skips it and opens a world directly.

| Parameter | Effect |
|-----------|--------|
| `seed=N` | World seed for a new world |
| `world=name` | Open (or create) the named world |
| `new=1` | Start the named world afresh |
| `mode=creative` | Creative instead of survival |
| `difficulty=peaceful\|normal\|hard` | Difficulty of a new world (default normal) |
| `view=N` | View distance in chunks (default 12, 115 m) |
| `x=…&y=…&z=…`, `yaw=…`, `pitch=…`, `fly=1` | Start position (in cells) and view |
| `time=0..1`, `year=0..1` | Time of day and of year |

## Development

    npm run check      # typecheck + unit tests + production build
    npm run benchmark  # per-chunk generation, meshing and light times (--assert applies the CI budgets)
    npm run smoke      # headless Chromium: views, UI, edit latency, saving; screenshots go to screenshots/

`npm run smoke` needs a Chromium for Playwright; run `npx playwright install chromium` once if it is missing.
CI runs `npm run check`, the benchmark budgets and the smoke test on every pull request and push to `main`.

The architecture is described in [`docs/specs/54-engine-rewrite.md`](docs/specs/54-engine-rewrite.md).

| Folder | Contents |
|--------|----------|
| `src/config.ts` | Every tunable number, in meters and seconds |
| `src/core` | Chunk keys, queues, random numbers, math, the fixed-step loop |
| `src/engine` | Blocks, chunks, the world store, light, meshing, streaming, cave culling |
| `src/worldgen` | Climate, biomes, terrain, rivers, caves, ores, trees (runs in workers) |
| `src/sim` | Block updates, calendar, weather |
| `src/game` | Player physics, input, inventory, crafting, survival, drops, `Play` |
| `src/creatures` | Species, behaviour, path-finding |
| `src/render` | Renderer, terrain material, sky, clouds, far terrain |
| `src/storage`, `src/ui`, `src/audio`, `src/workers` | Saves and settings, HUD and menus, sounds, the worker pool |
| `src/tests` | Vitest unit tests |
