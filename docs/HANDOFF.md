# Handoff: Voxel Game (MeetToast5578/Voxel_game)

## 2026-10-31 — switch-over: the rewrite is the game (Claude)

The owner merged the rewrite (PR #58) and asked for the old game to go (spec 54, phase 12).
- **Removed:** the old 0.3 m game: `src/`, `tests/` and its scripts (`smoke`, `render-smoke`, `platform-smoke`,
  `world-transfer-smoke`, `terrain-review`, the old `benchmark`).
- **Moved:** `next/` is now `src/` (tests in `src/tests`), and `next.html` is now `index.html`.
- **Renamed:** `scripts/next-smoke.mjs` is `scripts/smoke.mjs` (`npm run smoke`), and `scripts/next-benchmark.mjs` is
  `scripts/benchmark.mjs` (`npm run benchmark`). The browser test hook is `window.__game`.
- **CI:** two jobs. `check` runs `npm run check` and `benchmark --assert`; `smoke` runs `npm run smoke`.
- **Kept:** the offline service worker (`scripts/offline-shell.mjs`) is now registered by the new game.
- **Saves:** old saves are not migrated; worlds made in the new game keep working (database `voxel-next`).
- **Docs:** README rewritten for the new game. ROADMAP, tasks, OPEN-TASKS, REFERENCE-GAPS and specs 1–53 carry a note
  that they describe the old code. Entries below this one use the old names (`next/`, `next.html`).

## 2026-10-30 — engine rewrite, phase 1 (Claude)

The owner chose a full rewrite at 0.6 m blocks (16³ chunks, 9.6 m). It is built in `next/` beside the old game, which
stays in `src/` and keeps working until the switch-over phase. Plan: engine review findings and 12 phases (core,
generation and meshing, stored lighting, player, saves, simulation, worldgen, atmosphere, gameplay, creatures, UI,
switch-over). Phase 1 adds `next/config.ts` (meters only; cell counts come from `cells()`), packed integer chunk keys,
a growable `IntQueue`, a name-based block registry (`next/engine/blocks.ts`), palette-compressed chunks with nibble
light (`next/engine/chunk.ts`) and the `World` store. Tests are in `next/tests`.

Phase 2 makes `next.html` playable as a fly camera (WASD, space/shift, ctrl fast, +/- view distance; URL `seed`, `view`,
`x`, `y`, `z`, `yaw`, `pitch`). Climate fields and density terrain are ported without rivers, caves or features
(`next/worldgen`). Workers are picked by column hash so their column caches hit (`next/workers/pool.ts`). The mesher
merges cube faces greedily and packs a vertex into two uint32 words (`next/engine/mesher.ts`); tiles are a texture
array so merged faces repeat them (`next/render/tilePixels.ts`). Four passes: opaque (no discard), cutout, water, ice.
Streaming (`next/engine/streaming.ts`) never discards a mesh result; a chunk changed meanwhile is meshed again.
`node scripts/next-benchmark.mjs --assert` gates generation under 2 ms and meshing under 1 ms per chunk (here 0.42 and
0.79 ms). `node scripts/next-smoke.mjs` (after a build) loads the page headless and screenshots it; at 12 chunks
(115 m) SwiftShader showed 2,422 chunks, 762 meshes and 192 draw calls.

Phase 3 stores light (`next/engine/light.ts`). Sky light is 15 above each column's sky top (the highest cell that stops
sunlight; kept on the `Column`) and both channels fall by one per cell. Workers compute a chunk's own light
(`chunkLight`); the main thread joins it to loaded neighbours (`LightEngine.stitch`, only where light can cross) and
keeps it exact through edits with remove/add flood fills (`onBlockChanged`). `drainChanged` names the chunks to
remesh: the changed chunk plus neighbours across a changed border cell, not all 26. A test checks the result equals
a full recompute after random edits. Shortcut: when the sky top drops below the loaded chunks, the generated sky top
is assumed (edits stored in unloaded chunks are not seen). Day and night: `T` skips an hour; `time` URL parameter.
Benchmark gates now also cover worker light and stitching (here 0.6 ms and 0.3 ms per chunk). Hot modules copy
imported constants into locals, because the benchmark's module loader turns each into a getter call.

Phases 4 to 6 (same PR):
- **Player** (`next/game`): swept-box physics in cells (`physics.ts`). Stepping is one step per move, also right
  after landing, and steps down so stairs and slabs are walked, not fallen down. A body stuck in solid is pushed to
  the nearest free spot. Swimming uses buoyancy from how much of the body is in water. Raycast with exact slab and
  snow boxes. Keyboard, mouse and gamepad (`input.ts`); touch controls wait for the UI phase. Break and place with
  a 9-slot hotbar; F flies.
- **Edits**: `setBlock` in `next/main.ts` is the one path. Player edits remesh first (urgent). In the browser smoke
  test a typical edit took 0.5 to 1.1 ms on the main thread, and every edit was on screen within 2 frames. An
  opaque block next to glowstone, which removes a lot of light, took up to 5.7 ms under software rendering.
- **Saves** (`next/storage`, IndexedDB database `voxel-next`):
  - Whole chunks that differ from generation are saved, with their light, deflated and with states stored by
    name. Their columns' sky tops and a meta record are saved too.
  - Unloading chunks are encoded at once.
  - A revision check refuses to overwrite a save from another tab.
  - World backups export and import as JSON (`archive.ts`). Settings live in localStorage.
  - URL: `world=name`, `new=1`.
  - Saves from 0.3 m blocks are not read; the old game keeps its own database.
- **Simulation** (`next/sim`):
  - Scheduled ticks (fluids, falling sand and gravel, plants losing their ground) at 20 Hz. Ticks of unloaded
    chunks wait with their remaining delay and are saved.
  - Water and lava spread with levels (lava loses two per cell) and harden into obsidian or cobblestone where
    they meet. Fluid speeds are set in m/s.
  - Random ticks (grass spread and dieback, leaf decay; placed leaves are variant 1) run at a fixed rate per chunk
    within `SIM_RADIUS_CHUNKS` of the player, so their speed does not depend on the view distance.
  - Snow, ice, crops and saplings come with weather (phase 8) and gameplay (phase 9).

Phase 7a: world generation without water bodies (`next/worldgen`).
- **Biomes** (`biomes.ts`): the old table, with temperature and precipitation per cell; surface and soil come from
  the biome. Steep ground is bare rock. Shortcut: no dithering between neighbouring biomes' surfaces yet.
- **Underground** (`underground.ts`):
  - bent rock strata, and deepslate below -100 m;
  - the four cave systems, with sizes in meters, and a 5 m roof under ground near sea level so the sea cannot drain
    into caves;
  - ore veins placed at a rate per 1000 m³.
- **Trees** (`trees.ts`): every species in meters. Each tree is built whole and clipped per column. Canopies count
  in the column's sky top, so the ground under them is shaded.
- **Ground cover and features:** grass, ferns, flowers and mushrooms weighted per biome; boulders and fallen logs.
- **Leaves:**
  - Faces between leaves are hidden ("fast leaves"). That took the forest views in software rendering from 3-8
    fps to 15-17.
  - Generated leaves only check for decay when a log near them is removed. A random tick per leaf (a flood fill
    each) cost about 100 ms a second.
- **Cave culling** (`engine/visibility.ts`): workers record which pairs of a chunk's faces connect. A walk from the
  camera hides chunks it cannot reach (sealed caves); unloaded space above a column's top counts as open sky.
- **Streaming:** never-meshed chunks go before remeshes, so block updates near the player cannot starve the view.
  `idle` means loaded and meshed once.
- **Smoke test** adds forest and cave views.
- **Measurements:**
  - Generation is about 1.1 ms per surface chunk.
  - A column with trees takes 1.6 ms to prepare when its neighbours are cached, and 7.4 ms when they are not.
  - Draw calls rose to about 520 at the spawn view, because chunks now also need a cutout pass for trees and
    plants.
- **Still to do in phase 7b:** rivers, lakes, coasts and reeds. Caves out of sight under ground show the sky colour
  until phase 8's dark underground fog.

Phase 8: atmosphere.
- **Calendar** (`next/sim/clock.ts`): days and seasons (7 days each), moon phases, and the sun's path, which stands
  higher at noon in summer. `yearTime` is saved.
- **Weather** (`next/sim/weather.ts`): ported. Pressure and humidity fields drift east and give cloud cover, rain,
  snow or sleet by temperature, and storms. `Environment` (`next/sim/environment.ts`) samples it at the player every
  2 s and eases cloud cover. Storms flash lightning, with thunder a few seconds later. The F3 line shows the season,
  day, time and weather.
- **Sky** (`next/render/sky.ts`):
  - The sky is a gradient dome, warm around the sun at dusk. Sun and moon are drawn as square discs, and the moon's
    lit part follows its phase. Stars turn with the night.
  - Fog takes the sky's horizon colour and reaches all the way to the far terrain.
  - Under ground (from the sky light where the camera is) the fog turns dark and closes in to 30 m; the dome, stars
    and clouds go dark or hide too. Under water the fog is blue and 9 m.
- **Clouds and precipitation** (`clouds.ts`, `precipitation.ts`): clouds are a blocky layer at 100 m that thickens
  with cover. Rain falls as streaks at 9 m/s and snow at 1.5 m/s, never under a roof.
- **Seasons in the world:**
  - Leaves turn orange and red in autumn and grass browns in high summer (terrain shader). Water ripples.
  - Snow settles in layers while it snows below freezing, still water freezes, and both melt when warm (random
    ticks at the top of columns near the player, `Simulation.weatherTicks`).
- **Far terrain** (`render/horizon.ts`, worker job `horizon`):
  - 48 rings × 128 samples of the climate surface out to 2 km, coloured by biome; rebuilt every 40 m the player
    moves.
  - It writes depth, sits behind the real chunks (polygon offset), and is cut out where they are drawn.
- **Sounds** (`next/audio/sounds.ts`): the old procedural noise bursts for breaking, placing, footsteps, splashes
  and thunder.
- **Cave culling fix:** the walk is now bounded by the highest generated terrain and 64 chunks down, not by the view
  radius vertically. That radius had hidden water and ponds below sea level when seen from high up.

Phase 7b: rivers and lakes (`next/worldgen/rivers.ts`). This closes T-C6 by design.
- **Network:** a drainage network over the whole world, with no regions. There are three levels of jittered nodes:
  every 200 m (35% carry streams, 2.4 m wide), every 420 m (60%, 4.8 m) and every 900 m (all, 9.6 m).
  - A node drains to its lowest neighbour on the same grid.
  - The water falls linearly along each segment, and never stands above the land.
  - A node lower than all its neighbours holds a lake.
  - Paths meander through a domain warp.
- **No seams:** every decision reads only nearby nodes, so places agree whatever order they are generated in.
  Tests follow one river across more than 8 chunks and swap the generation order.
- **Carving:** channels and banks cut into the surface and calm its 3D detail. Beds are sand, gravel and clay.
  Reeds grow on the edge, lily pads on lakes. Trees, boulders and logs keep out of the water. Caves keep a roof
  under rivers and lakes as they do under the sea. Rivers also show on the far terrain.
- **Still missing:** waterfalls are just steps of still water; there are no stony shores or sandbars.

Phase 9 with the UI part of phase 11: play.
- **New blocks and items** (`next/engine/blocks.ts`): torch (light 14), crafting table, furnace and lit furnace
  (facing fronts), doors (4 cells, 2.4 m), beds (2 cells), stairs of five materials, wheat, carrots and potatoes (4
  growth stages), saplings of 8 species, sticks, coal, iron ingots, food, and wooden, stone and iron tools.
  - Block types now carry: tool kind and tier, drops, fuel, smelting result, food, `needsSupport` and per-variant
    tiles.
  - The mesher draws any list of boxes per state.
  - Shortcut: stairs and closed doors collide as whole cells, as in the old game.
- **Rules** (`next/game`), all tested:
  - inventory stacks with tool wear (`inventory.ts`);
  - shaped recipes ported by name (`crafting.ts`);
  - furnaces that burn fuel and light up (`furnace.ts`);
  - break times by tool and tier, with drops (`mining.ts`);
  - health, hunger, breath, fall damage, drowning and lava (`survival.ts`).
- **`Play`** (`game/play.ts`) ties it together:
  - creative breaks at once and places freely; survival digs over time, drops into the inventory and uses items up;
  - right click opens tables and furnaces, toggles doors, sleeps in beds (skips the night, sets the spawn) and eats;
  - furnaces keep running; everything is saved in the meta record's `play` field;
  - death clears the inventory and respawns at the bed or the first spawn.
- **Growth:** crops grow and saplings become trees on random ticks.
- **UI** (`next/ui/app.tsx`, Preact):
  - hotbar with icons drawn from the tile textures, plus health, hunger and air bars;
  - the inventory screen (E) with 2×2 crafting, 3×3 at a table, a furnace screen, and a block palette in creative;
  - a pause menu whenever the pointer is free: settings sliders, the world list (open, export, delete), a new world
    form (name, seed, mode) and import from a file;
  - a death screen; F3 hides the debug text; a crack overlay while digging.
- **URL `mode`:** `creative` or `survival` for a new world. Worlds made from the URL default to creative, worlds made
  from the menu to the mode picked there.

Phase 10: creatures (`next/creatures`, `next/render/creatureMeshes.ts`).
- **Species:** the old twelve, with sizes and speeds now in meters.
- **Spawning:** groups appear 24–64 m from the player by biome. Fish appear in water, and zombies in the dark or at
  night. At most 48 creatures and 12 monsters; they leave beyond 110 m, and monsters slip away by day.
- **Behaviour:**
  - grazers flee the player and predators; herds keep together; predators hunt their prey;
  - in survival, monsters hunt and bite the player;
  - creatures sleep by their day or night;
  - they wander without walking into water, off drops over 3 m, or into walls too high to step;
  - physics is the player's own.
  - Shortcut: no path-finding, only steering.
- **Combat:** the player hits the nearest creature under the crosshair (axes hit hardest). Hits knock creatures back;
  dead animals leave raw meat in survival.
- **Drawing:** boxes in one instanced mesh, posed per frame, lit by the light where each creature stands and
  flashing red when hit. Only the used part of the instance buffers is uploaded.
- **Saving:** creatures go in the meta record.

Phase 11, the rest:
- **Touch controls** (`next/ui/touch.ts`): on coarse-pointer devices or with `?touch=1`. A stick moves, dragging on
  the right looks, and buttons cover jump, down, break, place, fly, inventory, slots and pause. `Input.playing` and
  `start()`/`stop()` stand in for pointer lock.
- **Creative building** (`Play.build`):
  - B marks a corner; B again fills the box (up to 19.2 m a side) with the held block. G does the same to clear.
  - Boxes are applied 1,500 cells per tick.
  - Every player edit goes into a 32-step undo history: Ctrl+Z to undo, Ctrl+Y to redo.
- **Chests:** 27 slots, crafted from eight planks. They face the player, are saved in `play`, and empty into the
  inventory when broken in survival.
- **Biome borders** dither: each cell's temperature and rainfall get a small nudge before its biome is chosen.
- **Groundwater:** caves fill with water below a water table at about -42 m ± 30 m (old tuning), and with lava below
  -100 m.
- **Fix:** block updates scheduled across the edge of the loaded area now wait for their chunk (`TickScheduler.defer`)
  instead of being lost when due.

Polish:
- **Draw calls** (`next/render/chunkMeshes.ts`): chunks are drawn from pools of 131,072 quads, one multi-draw per pool
  and pass (three's `BatchedMesh`), with space handed out first-fit. At view 12 the terrain takes 10 draw calls instead
  of about 500. The vertex shader finds each chunk's origin from `gl_DrawID`. SwiftShader frame rates do not change,
  because software rasterising dominates there; the saving is CPU time per frame on real GPUs.
- **Dropped items** (`next/game/drops.ts`, `next/render/dropMeshes.ts`): what does not fit in the inventory drops into
  the world. Q throws one of the held item, and death scatters the inventory. Drops fall, slide to a stop, are picked
  up within 1.5 m, vanish after 5 minutes (at most 256 at once) and are saved with `play`.
- **Waterfalls** (`Generator.column`): where a neighbour's water stands higher, a curtain of flowing water spills
  over the step. The top cell is full level and the rest are falling cells, which is exactly what the block updates
  settle on, so a test can tick every waterfall cell and see nothing change. A one-cell step gets a source instead,
  because water between two sources becomes one. Real falls are rare: 2 in a 768 m square of seed 1, with one at
  (-591, 32, -468) in cells.
- **F3 frame graph** (`next/ui/frameGraph.ts`): the last 120 frames as bars (time since the previous frame, with the
  main thread's own share darker; lines at 60 and 30 fps), and a line with averages and maxima. In headless
  SwiftShader at view 8 the main thread takes about 4 ms per frame, at most 19 ms while flying at 22 m/s through new
  terrain; the rest of each frame is software rasterising.
- **Path-finding for hunters** (`next/creatures/pathfinding.ts`, ported A* with integer keys): a hunting land
  creature plans a path to its target every second and walks it cell by cell, so a zombie goes round a wall instead
  of pressing against it.
- **Worker light 3.6× faster** (`chunkLight`): open cells are marked once, neighbours are stepped to by index, and
  all-solid or all-sky chunks return at once. 0.70 → 0.19 ms per chunk; CI had failed the 1 ms gate at 1.03 ms.
- **Cave mouths** no longer show the sky: the generator reports each column's cave floor under surface openings
  (`ColumnData.caveFloor`), and streaming meshes a column down to the lowest floor of itself and its 8 neighbours.
  Cost in seed 1: 16% more meshed chunks at view 12 (926 → 1,075) and about 8 s more loading in SwiftShader.
- **Far terrain:** coloured by the generated surface instead of painting everything below -6 °C as snow, which
  made green taiga turn white in the distance. Banks beside a channel count as water, so thin rivers don't break into
  dashes. Fog is now haze that thickens quickly and levels off (exponential, reaching the fog colour exactly at 2 km)
  in both the terrain and far-terrain shaders, so the seam still matches.

## 2026-10-24 — performance (Claude)

T-J13: an edit remeshes at once only the chunks the changed cell faces (at most 4, was 8). T-J6: chunk budgets
shrink to half on slow frames, and a memory cap (`MAX_LOADED_CHUNKS`) steps the render distance down while it is
exceeded (`src/world/budgets.ts`). T-J14 re-measured: both forest fixtures pass. T-J2 to T-J5 wait for the owner's
hardware measurements (T-C3). The steepness shortcut in `generator.ts` is left as is: its own note says to change it
only if bare ground looks wrong, and changing it would reshape every world. This branch builds on the input branch.

## 2026-10-24 — gamepad and touch (Claude)

T-K6 code part. A gamepad drives movement, look, break, place, slots, flying, the inventory and pause. On touch
screens (or with `?touch=1`) on-screen controls appear. Both play without pointer capture. This branch builds on the
rivers branch.

## 2026-10-24 — rivers and waterfalls (Claude)

T-G10, T-G11 and the water part of T-G15. River water now has a current. Rivers that drop 0.6 m or more between
columns get waterfalls of falling water. Water ripples are animated in the water shader along each cell's flow,
which the mesher writes per vertex (it reuses the season slot, which water does not use). This branch builds on
the creatures branch. Lava is not animated yet.

## 2026-10-24 — creatures (Claude)

Phase 6 (T-H1..T-H10). Wildlife spawns per column by biome, flees, grazes, herds, hunts, sleeps and follows wheat;
zombies come out at night and in dark caves and bite survival players; left click hits creatures. Code is in
`src/creatures/` and `src/render/creatureMeshes.ts`. New states: raw meat 1659, cooked meat 1660. Optional meta
fields `creatures` and `creatureColumns`. This branch builds on the stairs-and-doors branch.

## 2026-10-24 — stairs and doors (Claude)

T-K5 is done. Stairs exist for every cube block and climb away from the placer. Doors are 2 × 7 cells (0.6 × 2.1 m,
so the player fits) and are placed, opened and broken as a whole (`src/player/doors.ts`). Both draw through a new
box path in the mesher (`blockBoxes`). New states append after the furnace states: door 1519, open door 1523, then
the stairs. Shortcuts: a closed door and stairs collide as whole cells. This branch builds on the furnaces branch.

## 2026-10-24 — furnaces (Claude)

T-I7 furnaces and iron tools, plus cooking for T-I8. Craft a furnace from eight cobblestone; right click opens input,
fuel and output. Smelting runs in `src/player/furnace.ts` and keeps going while the chunk is unloaded. Coal ore now
drops coal. New states append after the tools: the iron tool states, then furnace 1508, lit furnace 1512, iron ingot
1516, coal 1517, baked potato 1518. The optional `furnaces` meta field is written only when there are some; save
version unchanged. Survival now runs through to iron tools.

## Latest session — 2026-10-23, second batch (Claude)

This section supersedes the priorities below. Branch `claude/zen-goodall-129e55`, one PR for the batch.

**Done:** eating crops, the farming slice of T-I8 (right click with a crop in survival eats it unless aimed at grass
or dirt, where it is planted; `FOOD_HUNGER`); respawn with an empty inventory (owner decision); T-G7 catch-up on
reload (`catchUpChunk` in `ecology.ts`, chunk ages saved as `chunkAges`); T-G6 leaf litter (`leaf_litter`, state 178);
T-I9 beds (`bed`, state 179, half height; saved as `bed`); T-J8 frame-time graph in F3; T-G12 currents (`flowVector`
in `flow.ts`, `CURRENT_ACCEL`).

**Save compatibility:** new states append after 177: LEAF_LITTER 178, BED 179, CRAFTING_TABLE 180, STICK 181, then the tool states; tests pin the BlockIds. `chunkAges` and `bed` are written only
when set, so older saves and backups round-trip unchanged. Save version unchanged.

**Third batch (same PR):** T-I6 crafting (`src/player/crafting.ts`: 2×2 in the inventory, 3×3 at `crafting_table`),
T-I5 tools (`src/player/tools.ts`: wooden and stone pickaxe, axe and shovel; wear is the state variant, so tools are
states 182 onward), T-I4 body temperature (`src/player/bodyTemperature.ts`), T-G5 plant succession (`sprout` and
`seedSapling` in `ecology.ts`), T-J7 quality presets (`QUALITY_PRESETS`, new `resolution` setting). Survival now runs
log → planks → sticks → crafting table → wooden pickaxe → cobblestone → stone tools; iron needs furnaces (T-I7).

**Known limits:** generated rivers are source blocks and
carry no current until T-G10 (done since); dropped items drift in currents since then too; catch-up uses the weather at reload for the whole
absence, and saplings and litter only change while loaded; sleeping does not advance crops in loaded chunks.

**Next suggested tasks:** T-I7 furnaces (then iron tools), T-H1 wiring entities, T-G10 river flow direction (gives
currents to rivers), clothing for T-I4. CI: the smoke job hits its 15-minute limit (also on `main`); raising it to 30 is proposed on the PR. Owner acceptance (section 1 of OPEN-TASKS.md) is still open, and none of the new
visuals (leaf litter, beds, the F3 graph) have been checked on real hardware.

## Earlier session — 2026-10-23 (Claude, PRs #36–#48)

Everything here was merged to `main` (last merge #49). The task list lives in [OPEN-TASKS.md](OPEN-TASKS.md).

**Merged this session:** CI fix and three frame-rate-independent smoke checks (#38);
survival acquisition rules, T-I11 (#39); lightning and delayed thunder, T-F14 (#40); hunger,
starvation and health regeneration, T-I2/T-I3 (#41); wind, T-F5 (#42); and, unified in #48,
seasonal visuals T-F7, smooth lighting T-F8, snow layers and ice T-G2, saplings T-G3 and
crops T-G4. Docs: #36 (state update) and #37 (OPEN-TASKS.md).

**Owner decisions used:** deciduous vs evergreen leaves are chosen by local climate;
leaves drop saplings; crops are planted on grass or dirt.

**Save compatibility:** new block states are appended after the slab states (77..142):
SNOW 143 (8 layers), ICE 151, SAPLING 152 (14 species), WHEAT 166, CARROTS 170,
POTATOES 174 (4 stages each). `tests/blocks.test.ts` pins these IDs; append any new state
after 177 and never renumber. Save version unchanged.

**Where things live:** wind/season uniforms in `src/render/lightMaterial.ts` and
`renderer.ts` (`setWind`, `setSeason`); per-vertex sway/season/smooth light in
`src/render/mesher.ts`; `foliageSeason` in `src/world/calendar.ts`; climate weights in
`src/world/climateTint.ts`; snow/ice/sapling/crop random ticks in `src/world/ecology.ts`
with `saplings.ts` and `crops.ts`; tunables in `src/config.ts`; debug hooks
`setTimeOfYear` and `growSapling` in `src/debugApi.ts`.

**Validation:** 712 tests / 82 files pass on `main`. #48's last CI run failed once in the
platform smoke (the inventory "Close (E)" click timed out; it passes locally). The
volume-box smoke check also failed intermittently: it snows at the y=8390 test platform, and
snow settled on the cleared floor before the box was placed. The smoke run now turns snow and
ice off with `setWeatherEffects(false)` before each check (#49). Smoke runs against the
production build, so run `npm run build` before `npm run smoke` locally.

**Open owner questions:**
- `claude/serene-brown-4izylj` holds 2 unmerged commits of 15 October handoff notes; keep
  or delete.
- 24 merged branches remain on GitHub. Claude sessions cannot delete branches (the git
  proxy returns 403), so delete them on GitHub's Branches page and turn on Settings →
  General → "Automatically delete head branches".

**Next suggested tasks:** T-G7 catch-up on reload (crops and snow now exist), T-I8 food, starting with eating crops (so
survival no longer ends in starvation), T-G6 autumn leaf litter, T-H1 wiring entities.
Owner acceptance (section 1 of OPEN-TASKS.md) is still open; none of the new visuals have
been checked on real hardware.

## Latest building/backups batch — 2026-10-22 (spec 53)

This section supersedes the priorities and remaining copy/paste/export/import items in the
spec 52 record below. Branch: `codex/coasts-horizon-flora`; commits/pushes remain authorized.
See [spec 53](specs/53-building-copy-world-backups.md), tasks.md section K and `log.txt`.

**T-K5 advanced:** creative Ctrl/Cmd+C selects two aimed corners; Ctrl/Cmd+V pastes against
the aimed face; X cancels the selection. Session snapshots preserve states after source edits,
omit air, reject unloaded/oversized selections (32 blocks per edge), preserve occupied solid
cells and use the existing player-volume exclusions, edit budgets and undo/redo history.
No cut, rotation, replacement paste or operating-system clipboard integration.

**World files implemented:** start/pause menu exports live metadata and all edits, including
unloaded cells and explicit air removals. Generated terrain regenerates from the seed/current
generator. Import requires a persistent saved world, strictly validates before confirmation,
pauses old simulation/autosaves, drains pending writes and replaces metadata/chunks in one
IndexedDB transaction. Synchronous put failures now abort earlier clears/writes. Failure
preserves the old save and resumes the session. New-world deletion also drains saves and
checks failure. Files are bounded to 16 MiB / 100,000 chunks / 500,000 edits; unknown or
noncanonical states and repaired metadata are rejected rather than silently lost.

A revision key in the existing metadata store increments on replacement/deletion. This
build checks it inside every write transaction, preventing an old session in another tab
from resurrecting the previous save. A stale tab pauses and offers export/reload guidance.
Older client code cannot retroactively honor this guard. Database/save versions, old block
IDs, dependencies, lockfile and terrain generation are unchanged.

Validation: **680 tests / 80 files**, typecheck and production build PASS (2.05 s).
Full gameplay smoke PASS **34 checks**, including actual copy/paste shortcuts, retained slab
snapshot, occupied destination and undo. World-transfer smoke PASS actual download, invalid
input rejection, forced second-chunk write failure/complete rollback, confirmed file-picker
restore and stale second-tab rejection. Final platform suite PASS four sizes, native/modal
inventory and real offline shell/worker reload under a subpath. Inspected captures
`screenshots/building-copy-paste.png` and `screenshots/world-backup-import.png`.
Logs: `/tmp/next-final-check.log`, `/tmp/next-full-browser.log`,
`/tmp/next-final-transfer.log`, `/tmp/next-final-platform.log`. Final gameplay measurement:
10 fps on SwiftShader, 3,136 chunks loaded / 1,773 meshed / 353 draw calls; this is not owner
hardware acceptance. Generator/GPU benchmarks were not rerun for this UI/storage-only batch.
CI now includes the transfer suite; remote CI has not been run.

**Next:** stairs and doors (T-K5), gamepad/in-world touch (T-K6), Pixel Aero (T-K8).
Physical GUI/PWA acceptance, coarse distant coastlines/real river seams and dense-forest
performance remain open. Do not mark these complete from the automated results above.

## Latest building/interface/platform batch — 2026-10-22 (spec 52)

This section supersedes the older implementation priorities below. Work remains on
`codex/coasts-horizon-flora`; commits/pushes remain authorized. See
[spec 52](specs/52-building-interface-platforms.md), section K in tasks.md and `log.txt`.

**T-K1/T-K2 implemented:** every solid cube material has appended bottom/top slab states.
Existing IDs 0..76 and save version 3 remain unchanged; fluids/plants are not slab materials.
Slabs are 0.15 m / half a voxel. Side hit height chooses the half; floor/ceiling placement,
complementary same-material merging and actual body-volume exclusion are handled before edits.
Shared player/item/body collision supports real height intervals, fast sweeps and step-up;
rays detect actual faces and skip empty halves, including the origin cell. Held/dropped
geometry, icons, highlights/cracks, log face orientation, climate tint and emission follow
the shape. Mined/picked top halves normalize to their material's slab item.

Slabs cannot be replaced by fluid/falling plant rules. A falling full block over a bottom
half drops its item rather than floating over the gap. Structural support requires actual
contact, and collapsed slabs drop items rather than incorrect full-cube loose bodies.
Approved conservative shortcut remains: slabs do not occlude neighbours or block sunlight;
no waterlogging. Old saves load; older builds cannot recognize new slab names.

**T-K5 partial:** redo is complete, with expected-state conflicts, changed cells only, bounded
history and the same edit budgets. Ctrl/Cmd+Y and Ctrl/Cmd+Shift+Z redo; Ctrl/Cmd+Z undoes.
Modifier state is captured at keydown so fast chords survive low frame rates, with stale
presses discarded on blur/capture transitions. Panel counts and control hints are wired.
Copy/paste, stairs, doors and world export/import remain open.

**T-K4 partial:** native slot buttons support mouse, Enter, Space and touch without right-click
or repeat activation. Inventory gets modal focus entry/Tab wrap/return and constrained
scrolling for the enlarged block catalogue. Inspected 640×360/1280×720 captures; additional
1920×1080 and 1000×700 captures pass. Physical owner GUI/inventory acceptance stays open.
Pixel Aero (T-K8) remains a separate unimplemented design track.

**T-K6 partial:** production manifest/icon plus a dependency-free, versioned shell service
worker cache index/CSS/main and both terrain workers. Relative scope works under /voxel/;
real offline worker-backed game reload passes. New versions wait for existing tabs to close;
old shell caches are removed. Saves stay in IndexedDB. Requires HTTPS/localhost and a completed
online installation. Gamepad, in-world touch controls and physical installed-browser review
remain open. Native inventory touch is implemented; it is not a full mobile control scheme.

Validation: full **665 tests / 78 files**, typecheck/build PASS (2.13 s); GPU regressions PASS;
strict standard worker guards **1.157/1.128 ms** generation/mesh PASS with unchanged terrain
mesh hash. Final platform suite PASS: four sizes, native touch/keyboard, Enter repeat, Space,
modal Tab and offline worker reload under a subpath. CI now includes this suite after gameplay
smoke, but remote CI has not been run. Dependencies/lockfile unchanged.

Final gameplay smoke PASS all **33 checks**, including slab placement/half-height landing,
merge/ceiling, actual IndexedDB top-slab restore, real Ctrl+Y redo, physics/ticks and inventory
lifecycle. Final software-GPU measurement: 9 fps, 3213 loaded / 1773 meshed / 353 draw calls;
this is not owner hardware acceptance. No browser errors. Physical owner playtest stays open.

Next: finish category K's remaining building/platform tasks above, or return to terrain
LOD land/water separation and vegetation boundaries, real-river seam spike and physical
acceptance from spec 51. No claim that the entire category or all terrain bugs are complete.

Logs: `/tmp/building-release3-check.log`, `/tmp/building-budget.log`, `/tmp/building-gpu.log`,
`/tmp/building-platform-final.log`, `/tmp/building-final-browser.log`. Images:
`screenshots/building-slabs.png` and `screenshots/building-interface-*.png` (ignored artifacts).

## Latest terrain review — 2026-10-22 (spec 51)

This section supersedes the spec-50 visual diagnosis below. Work remains on
`codex/coasts-horizon-flora`; commit/push authorization remains in force.
See [spec 51](specs/51-terrain-visual-acceptance.md) and `log.txt`.

Repaired the main terrain cause: region grids are centred on multiples of 4096 blocks,
but selection used unshifted floor division. Reads in the wrong region clamped beyond
its simulated grid, creating enormous plateaus and rectangular water/cliff edges.
Selection now matches the centred core; 50 synthetic X/Z ownership seams, negative
coordinates and cache clearing are covered through the real sampler.
Also repaired lakes filled with solid drainage heights: retain basin beds and bound
lake detail below quantized water. Generated lake/source-water tests pass.

Saved structures use sparse edit bands, independent of generated ground/canopy bands.
A whole-column high roof no longer displaces ground; glass outside the immediate vertical
cylinder remains visible. Keep active generation neighbours on vertical moves, reload edits
after horizontal unloading, and exclude high air-only cleanup without filling empty gaps.

Voxel silhouettes now fade before the loaded circle ends, after the proxy becomes opaque.
Texture cutout alpha runs before distance hashing. Underwater/voxel-only paths disable the
transition; held items stay fully visible. Stitched rings have 29,575 vertices over the
same 2.46 km range, slope shading and stable world-space detail. Debug proxy-only hiding
preserves camera/fog range; `scripts/terrain-review.mjs` captures reproducible views.

Verified: **647 tests / 76 files**, typecheck/build PASS (2.05 s); GPU regressions PASS,
including true ground below an intentionally raised proxy and near/mid/far voxel fading.
Strict idle worker generation/mesh: origin **1.193/1.137 ms**; previous forest (240,-108)
**2.268/1.926 ms**; actual forest (216,-140) **2.471/1.268 ms**. All pass unchanged 3 ms
limits. Coordinate correction changes geometry hashes; this is not an isolated mesher
optimization. T-J14 is partial pending representative hardware/current CI review.

Full browser suite PASS: all **32 checks**, including tick save/reload, fall/flow/collapse,
lava and real generated feature fixtures. Final steady measurement: 12 fps on SwiftShader,
3213 loaded / 1773 meshed / 353 draw calls; this is not owner hardware. The first browser
attempt exposed a volume fixture that assumed its slot still held bricks after pick-block
and reused uncleared blocks. It now stocks bricks, clears/anchors its area and waits for
the exact floor target; all placement/undo assertions remain.

Final five-view capture PASS with zero pending jobs and no browser errors. Inspected ground
and forest images as well as elevated/recenter/ridge views. Ground/trunks are present and
the original straight cliff is gone. **Visual quality remains partial:** the forest/ridge
views expose coarse green/blue triangles and distant coastline aliasing; faded crowns can
still appear separate at the perimeter. Treat these captures as follow-up evidence, not
owner acceptance. Next visual work should separate land/water geometry and handle vegetation
at the LOD boundary instead of relying only on interpolated vertex colour/fades.

Unedited terrain regenerates differently; existing saved edits remain and can float.
Dependencies, block IDs, save version and mountain-height limits are unchanged.

Resume with coarse far-coastline approximation and near/far visual quality. Physical owner
acceptance (T-C5/T-C7/T-C9/T-E11b) remains open. T-C6 requires 50 **real river** seams on
the debug map: synthetic slope seams prove coordinate correctness, not hydrological
continuity between independently simulated basins. The horizon still omits far vegetation
and saved structures. Do not mark all terrain/visual acceptance complete from readiness.

Logs: `/tmp/terrain-release-check.log`, `/tmp/terrain-gpu-release.log`,
`/tmp/terrain-budget.log`, `/tmp/terrain-forest-release.log`,
`/tmp/terrain-forest-current.log`, `/tmp/terrain-release-smoke2.log`,
`/tmp/terrain-review-release.log`.

## Latest implementation — 2026-10-21 (spec 50 bug audit)

This section supersedes the older checkpoints below. Continue correctness/terrain review
before decorative features. Implementation and evidence: [spec 50](specs/50-engine-bug-audit.md).

Repaired dense-canopy ground bounds in synchronous/worker loading, incomplete perimeter
meshes, horizon/voxel height-model divergence and proxy depth ordering. Every horizon
sample now uses shared exact coast/density parameters and remains independent of the
camera. Coarse geometry between samples remains an approximation.
**Visual acceptance is still open:** the exact elevated reproduction still shows broad
flat proxy surfaces and partial-looking distant vegetation. Do not claim the owner's
terrain complaint is fully resolved merely because sampling/occlusion tests pass.
The final reproduction screenshot is `screenshots/terrain-regression.png` (ignored local artifact).

**T-G1 complete:** pending scheduled work (all current reasons), remaining delays and
simulation tick survive unload/save/reload. Unloaded queues pause. Optional save-v3 fields
keep old saves compatible; legacy scans skip restored cells. Fixed worker failure stalls,
random-tick sorting overhead, restored leaf support and collapse/border notifications.
The clock remains 20 Hz for blocks and 60 Hz for bodies.
Also repaired high-altitude skyline removal: a known-empty gap no longer exhausts the
64-chunk downward scan and falsely discards the actual ground height. Fluid smoke fixtures
now use sufficiently wide anchored floors and clean their sources before terrain review.

Validation: final functional check **642 tests / 76 files**, typecheck/build PASS; GPU
regressions PASS, including real terrain below a deliberately raised proxy. Full browser
acceptance PASS: all **32 checks** after containing/cleaning fluid fixtures. It includes an actual IndexedDB
pending-sand save/reload and the exact elevated terrain reproduction. No dependency,
block-ID or save-version changes. No palette-cache experiments were retained.

Standard worker guards PASS **1.556 ms generation / 1.692 ms mesh**. Extra forest fixture
at chunk (240,-108): generation PASS **2.081 ms**, mesh **FAIL 3.057 ms** against 3 ms.
This remains open **T-J14**; thresholds and geometry hashes are unchanged. Profiling and
failed/reverted optimization attempts are logged; do not claim all performance checks pass.

Resume priorities:
1. Inspect `screenshots/terrain-regression.png` from the final browser run and review near/far
   LOD transitions/river seams. Do not mistake geometry readiness for visual acceptance.
2. Resolve T-J14 with measured changes. Keep generation/mesh hashes and strict budgets.
3. Review saved edits/large structures outside the immediate surface band and remaining
   manual acceptance; distant LOD still omits saved structures and vegetation.
4. Only then resume visual/ecology/creature tasks from tasks.md. No claim of an exhaustive
   proof that every game bug is fixed; physical-browser acceptance/current CI remain unrun.

Logs: `/tmp/voxel-audit2-release-check.log`, `voxel-audit2-budget-final.log`,
`voxel-audit2-forest-final.log`, `voxel-audit2-gpu-final.log`,
`voxel-audit2-release-smoke.log` (all under `/tmp`). Use this checkout and branch
`codex/coasts-horizon-flora`; commits/pushes remain authorized. Do not create a worktree.

## Archived stop checkpoint — before spec 50

Owner stopped this audit due to remaining session usage. Opened actual game in Chromium.
**Terrain is NOT visually fixed:** fully loaded seed 1 at (101.5,245,-26.5), yaw -0.8,
pitch -0.35 still shows giant flat green horizon surfaces, rectangular water strips and
floating-looking tree silhouettes. Screenshot: `screenshots/terrain-audit.png` (local ignored).
No pending generation/meshing/jobs remained, so this is not merely startup streaming.
First follow-up: fix/replace inaccurate horizon sampling and near/far integration; compare
this exact view before/after and add a visual regression. Avoid claiming geometry-ready
smoke means visually correct terrain. A partial correction now uses circular camera fade
at the voxel radius and fills the old snapped geometry hole, but is insufficient.

Validation: full check PASS **622 tests / 74 files**, build, all **31 gameplay smoke checks**
for physics/render-invalidation fixes. Subsequent horizon-only change: typecheck/build,
**5 horizon tests**, focused distant-terrain browser smoke PASS, plus direct fully loaded
visual inspection revealing the remaining defect above. No full-suite rerun after that
small horizon change. Logs: `/tmp/voxel-bug-audit-{check-final,smoke-final,horizon,horizon-smoke,visual}.log`.
Then complete T-G1 durable pending tick persistence; do not resume decorative features yet.

## Latest bug audit — 2026-10-21

Owner reported broken-looking terrain and physics and asked for a quick audit.
Fixed missing remesh notifications for scheduled/random world writes, independently
of save dirtiness. ChunkManager drains/coalesces changed chunks and top spans after
each block tick and invalidates padded neighbours/lighting through the existing batch path.
Fixed world-wide tick budgeting, rotating scheduled/random chunk fairness, duplicate
cell/reason updates (earliest due wins), complete-volume collision sweeps at high speed,
and retrying falls/flows at unloaded streaming interfaces. Falls also wake adjacent fluids.
The existing 20 Hz block clock / 60 Hz body loop remain; this is not a new clock implementation.

Regression coverage: high-speed floor and both-direction X/Z wall collisions; tick-driven
remeshing independent of save dirty flags; shared budget/fairness; duplicate coalescing;
fall/fluid continuation when neighbours arrive. Final results are in log.txt.

**Still open:** pending ticks are not serialized (T-G1); chunk-load scans only recover
some physics. This audit does not establish full Minecraft parity or resolve every
terrain artifact in the owner's save. Reproduce the owner's exact scene, review LOD/near
terrain overlap and startup streaming, and finish durable updates before more visual features.
Keep this priority override above the older spec 49 queue below. No dependencies or
save format changed. Commit/push is authorized. Use the existing checkout/branch.

## Latest local batch — 2026-10-21 (spec 49)

Completed T-E5/T-E6/T-E7/T-E8/T-E10 and procedural art T-E9: fully supported
boulders, horizontal forest logs, thin unfrozen lake pads, damp moss and true per-cell
surface biomes with world-coordinate boundary blending. New states 73..76 append;
old IDs, saved edits, dependency versions and save format remain intact. Tree geometry
and cell climate caches preserve generated bytes through eviction.

Validation: typecheck/build, **613 tests / 74 files**, standard and forest worker budgets,
GPU regressions, **all 31 gameplay smoke checks** and four inspected feature screenshots.
Warm generation/mesh: origin 1.100/1.346 ms; forest 1.784/2.706 ms (3 ms guards).
The forest initially exceeded generation budget at 3.902 ms; deterministic caching fixed it.
Reproduce with BENCHMARK_CHUNK_X=240 BENCHMARK_CHUNK_Z=-108 and scripts/benchmark.mjs.

Next five: T-G1 pending falls, T-F5 wind, T-F7 seasonal visuals, T-F8 smooth lighting,
T-F14 lightning/thunder. Owner playtests/river seam acceptance and current CI remain
unrun. Dynamic plant ecology stays separate. Horizon LOD still omits distant saved
structures and workers=0; mountain heights remain capped. The owner authorized
commits/pushes. Implementation commit **0cd1097** and validation/push record **6c39418**
are pushed on **codex/coasts-horizon-flora**; local and remote HEAD matched and the working
tree was clean at completion. No merge or PR was created. Use this existing checkout for
continuation; preserve dependencies and saved edits. Historical notes below predate this batch.

### Resume from here

Read `docs/tasks.md` and spec 49, then start **T-G1 — Save pending falls**. Inspect the
current chunk-load scan and tick/save interfaces before changing persistence. Continue
with T-F5, T-F7, T-F8 and T-F14 after that. Log decisions, failures and verification in
`log.txt`; update task status only after checks pass. Commit and push completed batches
to the existing feature branch under the owner's authorization.

Required regression commands (run worker/browser checks sequentially):

```sh
npm run check
node scripts/benchmark.mjs --assert-generation-budget --assert-mesh-budget
BENCHMARK_CHUNK_X=240 BENCHMARK_CHUNK_Z=-108 node scripts/benchmark.mjs --assert-generation-budget --assert-mesh-budget
CHROMIUM_PATH=/usr/bin/chromium node scripts/render-smoke.mjs
CHROMIUM_PATH=/usr/bin/chromium npm run smoke
```

Seed-1 generated fixtures, in world block coordinates:

| Feature | x | y | z | State |
|---|---:|---:|---:|---:|
| Boulder | 3129 | 152 | -2168 | 14 |
| Moss | 3517 | 161 | -2163 | 76 |
| Fallen log (X) | 3873 | 186 | -1690 | 73 |
| Lily pad | 4240 | 223 | -3020 | 75 |

Screenshots: `screenshots/surface-{boulder,moss,fallen-log,lily-pad}.png` (local generated
artifacts). Latest raw validation logs: `/tmp/voxel-b4-final-check2.log`,
`/tmp/voxel-b4-final-{default,forest}-budget.log`, `/tmp/voxel-b4-final-render.log`,
`/tmp/voxel-b4-final-smoke.log`. These local artifacts may not survive a fresh environment;
the tracked tests and commands reproduce the checks.

## Archived checkpoint — 2026-10-21 (specs 46–47)

Earlier work completed T-A6/T-D3 and T-D4/T-G8/T-G9/T-G13/T-G14: mining fixture,
aquifers, underground pools, lava/cooling, cushioned falls and survival fire. That
checkpoint passed 584 tests / 68 files and all 28 gameplay smoke checks. It was later
committed and pushed as 2396e91; specs 48/49 and the latest validation above supersede
its former local/uncommitted status and next-task queue.

## Session note — 2026-10-19 (reference gap map, PR #25)

Worked on branch `claude/zealous-allen-odrdj5`. Merged into `main` as `d8bd22d`.

- **Added `docs/REFERENCE-GAPS.md`.** Every open roadmap item is mapped against `nrz/Voxels`, a Java sandbox from 2016–17, with citations to its files. Three earlier claims in the doc were corrected: the reference's water flow is dormant, its dropped items are never picked up, and its jump and impact sounds are not played.
- **Ideas only.** The reference is GPL. The repo has no licence file, and no reference code is copied. Copying code would need a licence decision first.
- **Licence added, then removed.** `LICENSE` (GPL-3), the `package.json` licence field and a README section were added, then removed on the owner's request (`5833712`). Their commits remain in history, since the branch is not force-pushed.
- **Dropped items were not kept.** A spec 23 dropped-items feature was built on this branch. `main` already had the same feature as spec 24 (`docs/specs/24-inventory-and-items.md`, `src/items/itemEntities.ts`), so the branch's copy was removed. Spec 23 on `main` is grass blocks.
- **Local smoke is unreliable here.** On the merged tree, `npm run smoke` failed at different checks on two runs, at about 33 fps, while the code matched `main`. Treat local smoke results in this sandbox as weak evidence. GitHub CI is the real check.
- **Open question for the owner.** Which of the remaining gaps should get a spec first: water levels, greedy meshing, or mobs. Dropped items are done on `main` (spec 24). The gap doc notes that greedy meshing needs measuring first, because per-vertex AO and light limit how many quads can merge.

## Current handoff — 2026-10-19

The user authorized autonomous implementation, testing, logging, task-list updates and pushes to `main`. This session is pinned to the branch `arena/f70f1800-voxel-game`, so work is committed there and offered to `main` through a pull request.

**CI is green on the current batch.** PR #31 (`98706b2`, the CI repair) was merged into `main` as `697f926`. PR #32 carries `58ae409` (T-D2 plus the smoke-chain fixes); run 39259305015 on that commit passed both jobs — `check` 1m5s (meshing 1.243 ms, generation 1.256 ms, hash unchanged) and `smoke` 6m58s, all 25 checks. The earlier repair, kept for the record:

The checkout was the one-commit snapshot `49bc873`. Both CI jobs were red at that commit, and both failures reproduced locally:

- `check`: `npm run check` passed (533 tests), but the worker benchmark failed at a **mesh mean of 3.555 ms** against the strict 3 ms guard. The 2.787 ms figure in the previous handoff had only ~7 % headroom, so a slower runner tipped it. Fixed by real optimisation rather than a looser budget: per-state tables, precomputed face/AO/UV/region offsets, growable typed-array vertex buffers, reusable region/light scratch, and 32-bit row copies in `buildRegion`. Node 22 now measures **1.715 ms** (passes 2.114 / 1.502 / 1.529) with the mesh hash byte-identical (`803974a7770501157d9409fc8622d26838a45e03e5c06ed3661d8989843715ae`). The benchmark step now publishes its numbers as Actions notices/annotations; the 3 ms assertion is unchanged.
- `smoke`: "no crack stage shown while breaking Grass" was a polling race (a 0.5 s block leaves stage 0 between two Playwright round trips on software rendering). The render loop now records `breakStageSeen`, exposed in `state()`, and the check reads it. Two further sequence-dependent failures were fixed: auxiliary pages now load while the primary game is `setIdle(true)` (a debug hook that pauses simulation and rendering only), and the smoke browser disables Chromium's background-tab `requestAnimationFrame` throttling, which had starved the mining check after tab switches. Full smoke passes all 25 checks locally; see `log.txt` for the timeline evidence.

**Verification after the repair batch:** `npm run check` PASS (542 tests / 63 files, typecheck, build); Node-22 benchmark PASS with the hash above; full gameplay smoke PASS, 25 checks, 4,012 chunks loaded / 2,063 meshed / 340 draw calls / 20 fps on SwiftShader (software rendering, not owner hardware). The Playwright CDN is blocked here; smoke ran on Chromium 138 from the `@sparticuz/chromium` npm artifact with its AL2023 NSS libraries, unpacked under `/tmp` outside the repository, so no dependency or lockfile changed.

**The slab work described in the previous handoff is not in this checkout.** There is no `stash@{0}` and no `/tmp/voxel-slab-before-ci.patch` here, and no slab code exists in `src/` (`BlockShape` is still `'cube' | 'cross'`, and `src/player/placementTarget.ts` does not exist). Treat `docs/plans/slabs-inventory-gui.md` as the source if that batch is restarted; the `?nosave=1` settings-persistence failure it mentions cannot be reproduced because the code is not present.

**T-D2 (caves beyond noise) is done and verified on CI** in `58ae409`: four systems in `src/world/caves.ts` with tuning in `src/config.ts` (cheese caverns ~6 % of the underground, spaghetti ~3 %, noodles ~1 %, ravines ~1 %), a fading 4–24-block surface roof, cave mouths only from the cheese field, the spec 14 shore/river/lake roof still applied, and `TerrainGenerator` delegating to `caveKind`. Spec 45 documents the rules; tests cover per-system volume bands, the roof, ravine taper, determinism and the forced-open river/lake roof. The smoke suite also stopped depending on spawn history: see the T-D2 entry in `log.txt` for the five test-side fixes.

The next intended work is engine-first, in this order: terrain generation (aquifers next, then lava pools), world physics, then gameplay. `docs/tasks.md` remains the live backlog and the recorded evidence of what is actually done.

Baseline audited 2026-10-17 against `main` (`adf5aba`, eleven commits after `0322d20`); follow-up verification updated 2026-10-18 on the working branch. Baseline status below is supplemented by the dated task-batch results, checked in code, tests and smoke rather than only commit messages.

## Latest autonomous batch (2026-10-18)

Tree implementation committed and pushed to `main` as `bef031a`: all 16 species, habitat wiring, cactus blocks, conifer/palm/umbrella/wetland silhouettes, 515 passing tests and all 25 gameplay smoke checks. T-E11a and existing inventory-backed hotbar T-I10 are done. T-E11 remains partial for owner visual review.

The follow-on rendering batch fixes sun/daylight alignment, clipped and position-dependent sky, precipitation altitude/units/roof culling, seasonal weather timing, and wetness overshoot. Moon phases (T-F1), wet tops (T-F3), humidity/dawn valley fog (T-F4) and their regression checks are implemented. `npm run check`: 527 tests / 62 files, typecheck and build PASS. Full gameplay smoke PASS; GPU regression script PASS with a cold Vite cache. An earlier concurrent-validation run failed at a HUD inventory state wait; diagnostics and auxiliary-page error collection were strengthened, with focused retest tracked in `log.txt`. Physical-browser acceptance remains open. Lightning flash/thunder wiring is still missing (T-F14).

The riverbed batch completes T-D1 and T-D5: seeded sand/gravel/clay sediment, stable old block IDs, local-water-level cave roofs and no underwater terrestrial plants. Generation/registry/atlas tests and the full 25-check gameplay smoke pass.

Performance follow-on completes T-A3/T-J1 and measurements T-J10–T-J12. A profiled three-line bulk region-copy change preserves all mesh bytes and brings the Node-22 reference fixture from 4.011 ms to 2.787 ms; isolated 3 ms guards are added to CI. Warm generation is 1.365 ms, while cold preparation remains outside that budget (T-J9 partial). Full checks: 533 tests / 63 files, GPU and all 25 gameplay checks PASS.

The older phase summary below contains historical details; use `docs/tasks.md` and `log.txt` for the latest per-task evidence.

## Where things stand

Status key: **done** = in code and tested; **partial** = some of the item is in code; **not started** = no code.

- **Phase 0 (groundwork):** CI (spec 1) done. The hand playtest is not done (owner).
- **Phase 1 (foundation):** done in code, specs 2–8. The manual checks in "Waiting on the owner" are open.
- **Phase 1b (meter scale):** blocks are 0.3 m (spec 10), and the save is version 3. Trees are 8–12 m (see "Decided" 1).
- **Phase 2 (terrain):**
  - done: debug map (spec 11), climate and shape fields (12), terrain from the fields (13), 3D density (14), strata, bare rock and deepslate (15, 20), ores (26), mountains capped at 60 m (22)
  - done: region simulation (41), which sets the surface offset, carves river channels and lake basins, and sets moisture for the biome table. Whether rivers run without breaks at region seams is not yet checked by eye.
  - partial: caves (basic noise caves only, no aquifers, lava pools or ravines); the riverbed gravel and clay wait for the rivers
  - not started: coasts beyond the beach band (7), horizon LOD (8)
- **Phase 3 (biomes and flora):**
  - done: climate at block resolution (31), biome table (32), feature system (30, with trees as its only feature), tree species (37), tall grass, poppies, ferns, dandelions and mushrooms (18, 19, 21)
  - partial: biome integration (35, 39): the generator uses the biome for surface and soil blocks, and for trees. Blending across biome borders is **not wired**: `blendSurfaceBlocks` exists in `src/world/biome.ts` and has no caller or test.
  - not started: flowers by biome, reeds, boulders, fallen logs, lily pads, moss
- **Phase 4 (sky, seasons, weather):**
  - done: calendar and seasons with seasonal day length (29), sky dome with sun, moon and stars (33), weather model (32), weather particles and lightning (34)
  - not started: moon phases; stars do not rotate; the wetness value is computed but nothing uses it, so wet darkening is missing; no morning valley fog (only the static distance fog); seasonal foliage colours; smooth lighting
- **Phase 5 (living world):**
  - done: tick queue (25, slice 1), random ticks with a time budget (38), grass spreading (36), leaf decay (40), player buoyancy and quadratic drag (16), wading and splash (17)
  - **Sandbox physics (spec 25), all six slices are in code and tested:**
    - slice 1, tick queue: fixed in this pass. A tick scheduled while the queue runs could be dropped or run twice.
    - slice 2, rule fields: `falls`, `flows`, `supports` and `density` on every block type.
    - slice 3, falling sand and gravel: one cell per tick into air, water or plants, and across chunk borders. Pending falls are not saved; a scan on chunk load resumes them (shortcut, spec says save the ticks).
    - slice 4, flowing water: 8 levels with a falling flag, drains without a feed, the mesh stands at its level. Lava is not in the game, so water meeting lava is not built.
    - slice 5, structural collapse: a removed block's neighbours check their support within 4 blocks. Terrain and long roofs are held up by the edge of the check. Leaves never collapse.
    - block updates run at 20 game ticks a second, as in Minecraft: water moves one block every 5 ticks and falling blocks every 2 (`WATER_TICK_DELAY`, `GRAVITY_TICK_DELAY` in `src/config.ts`). They were running every frame, so a flow finished in a few frames.
    - slice 6, loose bodies: a collapse of 2 or more blocks tumbles as bodies that float or sink by density, and settle back into blocks or items. Bodies are saved as items.
  - not started: snow, crops and saplings; catch-up after reload; currents (flowing water pushing the player); fall damage from water; waterfalls and river flow
- **Phase 6 (creatures):** partial. `src/world/entity.ts` is a pure entity system (spec 42) with gravity and collision, and the game does not use it yet. No animals, AI or pathfinding.
- **Build tools and block menu (this pass):** the build tool panel on screen always shows every setting, including in single-block mode. The inventory's Blocks (creative) tab puts any block into the selected hotbar slot. A solid shell with no cavity left becomes solid, and roofs are a horizontal layer built upward.
- **Phase 7 (survival):**
  - done: survival and creative modes, health, fall damage, drowning, death and respawn with the inventory dropped (34); mining hardness and crack stages (24)
  - partial: hunger is saved and shown, but nothing changes it (no food, no starvation)
  - not started: tools, crafting, food, beds, healing
- **Phase 8 (performance):** not started as a phase. Mesh time is 4.1 ms per surface chunk when run alone (target 3 ms; spec 28 is open).

**Current follow-up batch (2026-10-18):** calendar advancement is wired into the fixed simulation update (T-F9), dead snags are leafless (T-E15), and the planned HUD Inventory button works through the shared toggle (T-K3). Start/pause menu inventory closes back to its originating menu; only inventory opened from play requests capture on close. Code review checked clock readiness/pause/save behaviour, deterministic connected tree bounds, and HUD/menu/inventory stacking. `npm run check` passes: typecheck, **487 tests in 58 files**, build. Full local browser smoke **passes all 25 checks** on Chromium 153, including pointer-free HUD access, pause-overlay clicks, visible keyboard focus and native Tab/Enter/Space activation. Final measurement: 3,967 loaded chunks, 340 draw calls, 6 fps on SwiftShader (not owner hardware). T-F9 and T-E15 are closed. T-K3 remains partial until the owner's physical-browser check; biome plants, wet-surface rendering and slabs are not part of this batch.

**Previous task-batch verification (2026-10-18):** `npm run check` passes locally: typecheck, **476 tests in 57 files**, production build. The inventory smoke failure was isolated to ~20 s GPU readback while creating an uncached icon; CPU-backed atlas/icon canvases reduce the same call to ~3 ms. After fixing later screenshot/mining/water timing races, **both CI jobs pass at `615c101`** ([run 39075601314](https://github.com/MeetToast5578/Voxel_game/actions/runs/39075601314)): `check` 55 s and full `smoke` 6m30s. The full local smoke also passed on Chromium 153 (4,012 loaded chunks, 339 draw calls, 7 fps on SwiftShader). T-A2a is closed; this does not substitute for the owner-only playtests. Stars now rotate (T-F2), and shrubland/steppe now generate their named bushes (T-E14). T-E11 is still partial: 13 of 16 tree species, with willow, mangrove, saguaro and silhouette review remaining.

**Verification on 2026-10-17 (after the physics and tool pass):** `npm run check` passes: typecheck, **464 tests in 55 files**, and the build. The CI `check` job is green on `ubuntu-latest`. The CI `smoke` job, however, **fails** — see the "Known gaps" list. `npm run smoke` passes its checks in headless Chromium at about 8 fps (SwiftShader, so this number is not the owner's). The smoke test has an intermittent failure at the pick-block check: the player is standing above a cell that reads as air, and it is not yet explained. It also failed in the original code in one run.

## Waiting on the owner (not code)

- **Playtest.** 5–10 minutes with a real mouse and keyboard. Everything so far has only been tested headless.
  - Check pointer lock, mouse look, audio, and stepping up 0.6 m ledges (2 blocks).
  - Check that a 2 m high tunnel fits the player (1.75 m tall) and a 1.5 m high one doesn't.
  - Anything broken here jumps the queue.
- **Frame rate on the owner's machine.** Cubic chunks mean more draw calls. The smoke run loads about 3,900 chunks and draws 249 calls. The owner's machine has a slow CPU.
- **Manual checks from the phase 1 PRs:**
  - Dig a shaft 30 m (100 blocks) down: chunks keep appearing below and the sky shows above.
  - From a valley, hills are visible to the full render distance.
  - Pick a new block into the hotbar, dig 9 m (30 blocks) down, wait 10 s and reload: the hotbar, the hole and roughly the same time of day come back.
- **Terrain after spec 22 and region simulation (spec 41).** Peaks are at most about 232 m. Check rivers, lakes and seams from a valley and from a ridge. Edits made in an existing save may float, because unedited ground regenerates.
- **Look of the new rock and plants.** The limestone, slate, basalt, deepslate and mushroom textures were checked only as atlas code and in headless smoke, not by eye.

## Decided (owner approved, 2026-10-17)

1. **Tree size.** Every species now sits inside the documented 8–12 m (27–40 blocks). Oak 27–40, spruce 30–40, birch 27–35, pine 30–40, jungle giant 36–40, acacia 27–32, dead snag 27–33. Bushes stay small. This changes the trees in every world.
2. **Spec numbers.** The duplicates are renumbered: entity system is 42, weather model is 43, survival is 44. Specs 29 (calendar) and 30 (feature system) are written to match the code.
3. **Biome borders.** Surface blocks dither into the neighbouring biome over `BIOME_BLEND_BLOCKS` (3) blocks from the border, with a weight that falls off with distance. Beaches and soil stay as they are.
4. **F3 overlay.** Shows the biome, temperature, rain, season, day and weather at the player.

Resolved by spec 49 (2026-10-21): surface biomes now classify each block cell and blend at actual biome boundaries.

## Decisions so far

- **Scale.** 1 block = 0.3 m (spec 10). The player is 1.75 m: about 5.8 blocks tall and 1.6 blocks wide.
- **Step-up.** Physics step-up, not auto-jump. Its height is 0.6 m (2 blocks).
- **Height.** Cubic chunks with unlimited height. Terrain lives in the band −400 m to +2,600 m (spec 13). The surface stays under 232 m: mountains add at most 60 m (spec 22). Taller peaks would read as infinite walls until horizon LOD exists (phase 2 item 8).
- **Sea level.** y = 0 m (spec 13).
- **Terrain.** The shape fields set the large scale (spec 12). A 3D density gives the surface its shape (spec 14). Region simulation (spec 41) sets the surface offset, river channels and lakes.
- **Water.** The player floats at about 80% under water (`PLAYER_DENSITY` 800 kg/m³ against 1000 for water). Swim speed comes from quadratic drag and a stroke: about 2.6 m/s (spec 16). Wading slows the walk by half the submerged fraction (spec 17).
- **Plants.** Tall grass, ferns, poppies, dandelions and mushrooms grow on grass surfaces only, one per cell above the surface, by one hash per column (specs 18, 19, 21). Plants are walk-through and do not block the sun.
- **Biomes.** Each column's biome comes from real temperature (°C, lapse rate applied) and precipitation (mm/year, from the region moisture). Trees grow only where the biome names a species and the surface is grass.
- **Scope.** Everything on the roadmap: ecology, fluids, creatures and survival. Multiplayer is parked.
- **Saves.** IndexedDB, block states stored by name. Save version 3 (spec 10). A save of another version is not loaded, and its chunk records are cleared on load. `voxel-game-save-v1` (the 128-high world) is never read, written or deleted.

## Stack (versions pinned on purpose)

TypeScript 5.9.3, Vite 7.3.6, Vitest 4.0.18, three 0.186.0, simplex-noise 4.0.3, Playwright 1.56.1, preact 10.29.8.
- Do NOT upgrade Vitest to 4.1.x: `npm install` crashes ("Cannot read properties of null (reading 'edgesOut')").
- Node 20+ works; the dev container runs Node 22, and CI uses Node 22.

## Commands

- `npm run dev`: opens http://localhost:5173; click Play.
- `npm run check`: typecheck, the unit tests (542 in 63 files; 2026-10-19 verification), then the build.
- `npm run smoke`:
  - Builds, then opens `/?seed=1&autostart=1&nosave=1` in headless Chromium (SwiftShader WebGL).
  - Runs 24 checks through `window.__game` and writes `screenshots/*.png`.
  - Then logs a measurement: the time until everything is loaded, the FPS, and the chunk and draw-call counts.
  - Needs `npx playwright install chromium`, or set `CHROMIUM_PATH`. In cloud sessions, use `CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.

## Architecture

- `src/config.ts`: every tunable constant (world size, physics, render, storage keys, tree species, weather, survival).
- `src/core`: math (`floorDiv`/`mod`), seeded random (`mulberry32`, `hash2`), coords, fixed-timestep loop (1/60 s steps, frames clamped to 0.25 s).
- `src/world`:
  - `blocks.ts`: `BlockId`/`Tile` are objects, not enums. Ids run AIR 0, STONE 1, DIRT 2, GRASS 3, SAND 4, WATER 5, LOG 6, LEAVES 7, PLANKS 8, GLASS 9, BEDROCK 10, COBBLESTONE 11, BRICK 12, GLOWSTONE 13, GRANITE 14, DIORITE 15, ANDESITE 16, SANDSTONE 17, TALL_GRASS 18, POPPY 19, FERN 20, DANDELION 21, LIMESTONE 22, SLATE 23, BASALT 24, DEEPSLATE 25, BROWN_MUSHROOM 26, RED_MUSHROOM 27, COAL_ORE 28, IRON_ORE 29, GOLD_ORE 30, REDSTONE_ORE 31, DIAMOND_ORE 32, EMERALD_ORE 33, LAPIS_ORE 34 (35 types including air). Each type has a `shape`: `'cube'` (default) or `'cross'` for plants.
  - `chunk.ts`: 16×16×16 `Uint16Array` of block states, indexed `(ly*16+lz)*16+lx`, addressed by `(cx, cy, cz)`. No height limit.
  - `world.ts`: the chunk map, the `edits` map (what gets saved), per-column **tops** (world y of the highest sky-blocking block per cell), kept exact on every edit, `tickStep` and `randomTickStep`.
  - `shape.ts`: the climate fields and `heightMeters` (a spline of continentalness, plus mountains up to `MOUNTAIN_M` = 60 m), and `detailAmpMeters`.
  - `climate.ts`: `blockTemperature` and `blockPrecipitation` at block resolution (spec 31).
  - `biome.ts`: the Whittaker table `biomeAt`, `surfaceBlock`, `soilBlock`, `treeSpecies` (spec 32, 35). `blendSurfaceBlocks` dithers the surface across biome borders.
  - `density.ts`: `TerrainDensity`. A block is solid where `offset − y + amp × noise > 0`, with two octaves of 3D simplex noise.
  - `region.ts`: region simulation (spec 41). Regions of 128 cells of 32 blocks, with a margin on each side. Drainage, lakes, river cells, moisture.
  - `generator.ts`:
    - the surface is the highest solid block of each column (`getHeight`), found by scanning the density down from above the offset
    - the region sample sets the column offset, damps the detail noise inside river channels and lakes, and gives the water level
    - sea level 0: air at or below it becomes water
    - caves carved below the surface; trees (`trees.ts`) from anchors within reach through the feature registry
    - rock: below the soil, a block's rock comes from its strata layer, bent by a 2D warp noise (spec 15). Below −100 m the rock is deepslate. Ores by depth and rock type (spec 26). Columns with a detail amplitude of at least 12 m are bare rock.
    - plants: `plantAt` picks one plant per grass column from one hash, in bands (specs 18, 19, 21)
    - `treeSpeciesAt` and `biomeKeyAt` are the accessors tools and tests use
    - per-column data cached, `COLUMN_CACHE_LIMIT` = 2048 columns
  - `trees.ts`: `treeBlocks(seed, ax, ground, az, species)`, pure. Heights come from the species table, inside 8–12 m.
  - `feature.ts`: `FeatureRegistry`, the anchor system that keeps multi-chunk features seamless (spec 30). Trees are its only feature.
  - `calendar.ts`: seasons, day of season, solar declination, day length by latitude (spec 29).
  - `weather.ts`: the pure `WeatherModel` (spec 43).
  - `tick.ts`, `randomTick.ts`, `ecology.ts`, `leafDecay.ts`: scheduled ticks, random ticks, grass spreading, and leaf decay (specs 25, 38, 36, 40).
  - `entity.ts`: the pure entity system (spec 42). Not used by the game yet.
  - `debugMap.ts`: the colouring for `?map=1`.
  - Also: `chunkManager.ts`, `light.ts`, `spawn.ts`, `time.ts`, `editQueue.ts`.
- `src/render`:
  - `mesher.ts`: pure. Face culling, per-vertex AO and lighting, takes 27 neighbour chunks plus 9 column-top arrays. Cube blocks give faces; `shape: 'cross'` blocks (plants) give two diagonal quads.
  - `sky.ts`, `skyMaterial.ts`: the sky dome with sun, moon and stars (spec 33).
  - `weather.ts`: `WeatherRenderer`, particles and lightning (spec 34).
  - Also: `faces.ts`, `tiles.ts`, `atlasPixels.ts` (procedural textures), `renderer.ts`, `chunkMeshes.ts`, `lightMaterial.ts`, `highlight.ts`, `clouds.ts`, `heldBlock.ts`, `itemMeshes.ts`, `blockGeometry.ts`.
- `src/player`:
  - `physics.ts`: AABB sweep in the order Y → X → Z.
  - `player.ts`: walk, sprint, jump, fly, swim. Buoyancy and quadratic drag (spec 16); `submergedFraction`; wading (spec 17); `splashSpeed`.
  - `raycast.ts`: Amanatides–Woo.
  - Also: `interaction.ts`, `inventory.ts` (36 slots, the hotbar is the first 9, spec 24), `breaking.ts` (timed breaking with crack stages), `buildTool.ts` and `volumes.ts` (volume tools and undo).
- `src/items`: `itemEntities.ts`, dropped items: gravity, friction, lifetime, the cap of 256, pick-up (spec 24).
- `src/ui`: HUD, menu, F3 overlay (`debugText.ts`).
- `src/input`, `src/audio`: procedural noise SFX.
- `src/storage`:
  - settings in `localStorage`
  - the world save in IndexedDB (`voxel-game`): one meta record (seed, player, hotbar, block states by name, time of day, game mode, health, hunger, air, dropped items) plus one record per edited chunk. Only chunks edited since the last write are written; `WorldSaver` never runs two writes at once.
  - `main.ts` opens and loads the save before creating the `Game`; without IndexedDB the game runs on a memory store and the menu says so.
- `src/workers`: `WorkerPool`, which implements `ChunkJobs`.
- `src/game.ts` wires everything together, including survival (`updateSurvival`, `die`). `src/debugApi.ts` exposes `window.__game`.

### Key mechanics

- **Pure modules.** `core`, `world`, `player`, the mesher, `storage` and `ui/debugText` must not import three or touch the DOM. They are unit-tested in Node.
- **ChunkManager.**
  - Loads column tops within renderDistance + 2, then chunks; one list sorted by distance from the eye.
  - Meshes the near cylinder (renderDistance horizontally, `VERTICAL_RENDER_DISTANCE` = 4 up and down) plus each column's surface band, once all 26 neighbours and 9 column tops exist.
  - Unloads with hysteresis (meshes beyond +1, blocks beyond +3; surface bands are kept).
  - Time budgets apply on the main thread. With workers, at most 16 jobs are in flight, and a per-chunk version counter drops stale results.
- **Lighting.**
  - Sky light and block light are computed fresh for each mesh from the 3×3×3 chunk region. This is exact because light reaches at most 14 blocks. Sunlight is seeded from the column tops.
  - An edit remeshes its chunk (and any neighbour whose padded volume holds the block) immediately and marks the rest of the 3×3×3 dirty.
- **Day/night.**
  - A shader patch (`onBeforeCompile`) multiplies colour by `max(aLight.sky * uDaylight, aLight.block)`.
  - Every chunk geometry MUST have an `aLight` attribute, or it renders black.
- **Survival.** Fall damage uses `GRAVITY_M_S2` (config) for the impact speed. Drowning costs air, and damage starts when the air runs out. Death drops the inventory and respawns at the spawn point.
- **Conventions.**
  - Y is up.
  - Yaw 0 looks toward −Z, and moving the mouse right decreases yaw.
  - Camera rotation order is `'YXZ'`.
  - Player position is the centre of the feet.
- **URL params.**
  - `?seed=N` also disables saving.
  - `?nosave=1`, `?autostart=1`, `?workers=0`, `?map=1`.
- **Debug API.**
  - Methods: `ready`, `state()`, `teleport`, `look`, `setFlying`, `getBlock`, `setBlock`, `breakTarget`, `placeTarget`, `pickTarget`, `selectSlot`, `setHotbarSlot`, `holdButton` (presses a mouse button, for timed breaking), `save()` (returns a promise), `setTimeOfDay`, `setGameMode`, `setHealth`, `damage`, `setHunger`, `setAir`.
  - `state()` also includes `hotbar`, `inventory`, `areaMeshed` (the 3×3×3 around the feet is meshed), `drawCalls`, the chunk and tick stats, and the survival fields.

### Gotchas

- TS 5.9 needs `Uint8ClampedArray<ArrayBuffer>` for `new ImageData`.
- `toEqual` treats −0 and 0 as different.
- Catch `requestPointerLock()` rejections.
- Create the worker as `new Worker(new URL('./chunkWorker.ts', import.meta.url), { type: 'module' })`.
- `getHeight` is the highest **solid** block, not the top of the water. For the sky-blocking top (water counts), use `columnTops`.
- The surface is not one height per column any more (spec 14), so do not assume the blocks under `getHeight` are all solid.
- A plant is not solid and does not block the sky, so `solid`, `opaque` and `blocksSky` must all be checked for it, not one of them.
- Changing a plant, rock or tree chance in `config.ts` changes every generated world, not only new ones.
- `getHeight(x, z)` takes **block** coordinates, and `heightMeters` takes **meters**. A scan that mixes them looks at the wrong place (this caused a wrong 2.4 km reading during spec 22). Multiply blocks by `BLOCK_SIZE_M` to get meters.
- Tests that need a mountain use `PEAK` in `tests/generator.test.ts`, a rugged point found by a field scan. If the shape changes, find a new point and update `PEAK` rather than loosening the assertion.
- Tests that time the generator or mesher take the fastest of several runs, and the slow ones have explicit timeouts (spec 39 and `tests/spawn.test.ts`). Do not make them tighter to pass.

## Known gaps and backlog

See `docs/ROADMAP.md` for the phase list, and the "Decided (owner approved)" above for choices the owner has already made.
- **Testing.** No real mouse-and-keyboard playtest yet.
- **Mesh time.** 4.1 ms per surface chunk when run alone (target 3 ms, spec 28).
- **Cold column generation.** About 8.4 ms median in Node (last measured before region simulation; not re-measured).
- **Spawn search.** `tests/spawn.test.ts` takes about 6 s for 30 seeds (about 200 ms per seed), so it needs its explicit timeout.
- **Region simulation.** About 162 ms per region on seed 1337 (spec 41). Not re-measured.
- **Biomes.** Spec 49 resolves cell biomes; specs 48/49 add biome flowers, reeds, boulders, fallen logs, lake pads and moss. Dynamic plant ecology remains open.
- **Sky and weather.** No moon phases; stars do not rotate; no wet darkening; no morning valley fog; no seasonal foliage.
- **Living world.** Snow layers, saplings, crops, catch-up on reload and lava are open. Fluid levels and currents exist but are not wired to bodies. Sandbox physics (spec 25) is complete: all six slices, see the phase 5 list above.
- **Entities.** Not used by the game yet. No creatures.
- **Survival.** Hunger does not change; no food, tools, crafting or beds.
- **Edits.** An edit remeshes up to 8 chunks on the main thread at once, about 3 ms each.
