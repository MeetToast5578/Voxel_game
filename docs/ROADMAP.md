# Roadmap: Voxel World Simulator

Last updated 2026-10-15. This replaces the backlog in `HANDOFF.md`. Phase 1, 1b and the first items of phase 2 are merged (specs 1–14).

## Vision

A deep, believable voxel world that runs in the browser.

- **Terrain.** It reads like real geography: continents and oceans, mountain ranges with real drainage, rivers that run downhill into lakes and the sea, rain shadows, snow lines, and rock strata underground.
- **Life.** Biomes follow climate. Trees are grown from species rules, not stamped from one template.
- **Change.** Weather and seasons change the world over time. Plants grow, snow settles and melts, water flows, and animals live their lives.
- **Survival.** A survival loop gives the player a reason to explore it all.

Every system is deterministic from the seed, runs off the main thread where it can, and is unit-tested as pure code.

## Decisions

| # | Decision | Choice |
|---|----------|--------|
| A | Step-up style | Physics step-up, as specced (no auto-jump) |
| B | Save key | **Superseded.** The world format changes completely (cubic chunks, new terrain, 16-bit blocks), so old saves can't be carried over. The new save lives in IndexedDB. The old `localStorage` save is left untouched and ignored. |
| C | Trees appearing in existing worlds | Accepted. It becomes moot for the same reason as B. |
| D | Scale | 1 block = 0.3 m (spec 10, which changed the original 0.6 m). The player is about 6 blocks tall. |
| E | Vertical extent | Cubic chunks (16×16×16) with unlimited height and depth |
| F | Terrain approach | Hybrid: infinite climate-driven noise, plus coarse simulated drainage and erosion per large region |
| G | Plan form | This roadmap, plus Haiku-ready specs for phase 1 only. Later phases are specced when they're reached. |
| H | Scope | Terrain, biomes, trees, weather, seasons, living ecology, dynamic fluids, animals and mobs, and survival. Multiplayer stays parked. |

### Scale reference

All gameplay numbers are written in meters in `src/config.ts` and converted to blocks there.

| Quantity | Meters | Blocks |
|----------|--------|--------|
| Block edge | 0.3 | 1 |
| Player height / eye / width | 1.75 / 1.62 / 0.48 | 5.8 / 5.4 / 1.6 |
| Chunk edge (16 blocks) | 4.8 | 16 |
| Jump height (approx.) | 1.35 | 4.5 |
| Auto step-up | 0.6 | 2 |
| Sea level | 0 | y = 0 |
| Deep ocean floor (typical) | −200 to −300 | −670 to −1,000 |
| Lowland / hills | 0 to 150 | 0 to 500 |
| High mountain ranges (rare peaks) | 1,500 to 2,500 | 5,000 to 8,300 |
| Snow line (temperate, summer) | ~2,000 | ~6,700 |

"Unlimited height" means storage and coordinates have no cap. The terrain generator works inside a band (−400 m to +2,600 m, spec 13). Below the band is plain deep rock; above it is air. Players can build and dig anywhere.

## Architecture targets

These are the shapes later phases build on. Phase 1 puts the first four in place.

- **Cubic chunks.** A chunk is a 16³ cube with a key of `cx,cy,cz`. A **column** is every chunk sharing `cx,cz`.
- **Column tops.** Each column keeps the highest sky-blocking block for each of its 16×16 cells. Sky light, rain occlusion, snow cover, spawn search and the horizon LOD all read it. Phase 1 is light only.
- **Exact local light.** Light is recomputed per mesh from the 3×3×3 chunks around it, seeded from column tops. This stays exact because light reaches at most 14 blocks.
- **16-bit block states.** A block state is a `u16`. Each block type registers a number of variants (fluid level, snow depth, log axis, crop age). Saves store names, not raw numbers, so adding blocks never breaks a save.
- **Generator pipeline** (phase 2). It works in four stages. Stage 1 and the density part of stage 4 are done (specs 12–14):
  1. climate and shape fields (2D, infinite)
  2. region simulation (coarse grid: drainage, erosion, moisture), cached per region
  3. column fields (height, biome, river and lake data) upsampled to blocks
  4. 3D density, caves and geology per chunk, then the feature pass (trees, plants, boulders)
- **Simulation tick.** A random-tick and scheduled-tick system runs over loaded chunks (ecology, fluids). Unloaded chunks catch up analytically when they reload.
- **Entities.** A light component system with shared AABB physics, steering, A* pathfinding and per-chunk persistence.
- **Persistence.** IndexedDB holds world metadata and one record per modified chunk.

## Phases

Each phase ends playable. Don't start a phase until the one before it is merged and its "done when" holds.

Delivery follows the existing rule:
- Small, self-contained work goes to Haiku as prose specs.
- Work on the mesher, lighting, worker pipeline, region simulation or renderer core is built directly by Claude, from the same kind of spec.

### Phase 0: Groundwork

- **CI.** Spec `01-ci.md`.
- **A 10-minute hand playtest** with a real mouse and keyboard. Anything broken jumps the queue.

### Phase 1: Foundation (specced in `docs/specs/`)

Goal: the new scale, a world with no height limit, block states, and a save that can grow.

1. **World scale.** 0.6 m blocks at the time (later 0.3 m, spec 10), a 3-block-tall player at that scale, meters in config, and a swept vertical collision so fast falls can't tunnel.
2. **Auto step-up** onto 1-block ledges (decision A, rewritten for the new scale).
3. **16-bit block states** with variants and stable names.
4. **Cubic chunks: data model.** Chunks, world, column tops, edits.
5. **Cubic chunks: light and mesher** in 3D.
6. **Cubic chunks: streaming.** A 3D load set that follows the terrain surface, plus workers and rendering.
7. **Save v2 in IndexedDB.** Includes the hotbar and time of day; absorbs the old spec 2.

Phase 1 kept the old height noise, with stone below y = 0 and sea level at y = 40. Phase 2 replaced it: sea level is y = 0, and the surface comes from a 3D density (specs 13–14).

**Done when:** you can dig 500 blocks down and build 500 blocks up, surface terrain is visible at full render distance from the bottom of a valley, saves survive a reload, and CI is green.

### Phase 1b: Meter-based world scale (specced in `docs/specs/09-meter-scale-world.md`)

Goal: the same land in meters, filled with finer blocks, so the world gets more detail. Trees are realistic.

- Terrain, caves, sea level, clouds and spawn are written in meters and converted to blocks.
- Blocks are 0.3 m (spec 10), so the same land has finer detail.
- Trees come from a new pure generator (`src/world/trees.ts`): trunk, branches and a ragged crown, 8–12 m tall.
- Tree density per square metre stays the same.

**Done when:** a forest at 0.6 m blocks looks more detailed than before at the same world size, trees measure 8–12 m in the F3 overlay, and CI is green.

### Phase 2: Terrain

Goal: geography that looks real from the ground and from a mountaintop.

**Status (2026-10-15):** items 1 and 2 are done (specs 11–12). Spec 13 switched the generator to those fields, and spec 14 added the 3D density (part of item 4). Geology slice 1 (spec 15: strata and bare rock) and slice 2 (spec 20: limestone, slate, basalt, deepslate) are done. Next: ores, gravel and clay in the rest of item 5. Item 3 needs a larger model to plan it first.

1. **Debug map** (`?map=1`). A top-down 2D render of the generator: height, biomes, rivers, moisture, region seams. It's the main tuning tool for this phase, so it comes first.
2. **Climate and shape fields.** Large-scale noise for:
   - continentalness (ocean, coast, inland)
   - erosion (smooth vs. rugged)
   - ridges / peaks-and-valleys
   - temperature
   - humidity
   - "weirdness" (rare formations)
   
   Height comes from spline curves of these fields, as in Minecraft 1.18. Sea level is y = 0.
3. **Region simulation** (the hybrid part). The world is split into square regions of roughly 5 km (8,192 blocks). Each is simulated on a coarse grid of 32-block cells, with a wide overlap margin:
   1. Priority-flood depression filling. Designated basins are kept as lakes.
   2. Flow routing and flow accumulation.
   3. A few iterations of stream-power erosion plus thermal (talus) erosion to carve valleys.
   4. Rivers where accumulation passes a threshold. Width and depth grow with the square root of the flow.
   5. Lakes from filled basins, each with a water level.
   6. Moisture carried along a prevailing wind from the ocean. Rain falls on windward slopes, leaving a rain shadow behind ranges.

   Results are cached per region in the worker, and a cached result must equal a fresh computation. Neighbouring regions crossfade inside the overlap margin.

   **Spike first.** If rivers can't be made continuous across region seams (50 seams sampled on the debug map, no breaks), fall back to noise-shaped rivers, and use the simulation only for erosion, lakes and moisture.
4. **Upsampling and detail.** Bicubic upsampling of the coarse fields to blocks, plus detail noise scaled by slope and erosion. A 3D density pass on top gives cliffs, overhangs, arches and sea stacks where biome and weirdness allow.
5. **Geology.**
   - Strata that follow large-scale noise: granite, diorite, andesite, limestone, sandstone, slate, basalt, plus a deep "deepslate" layer.
   - Soil depth set by slope (bare rock on steep slopes).
   - Gravel and clay in riverbeds.
   - Ores by depth and rock type.
6. **Caves.**
   - "Cheese" caverns, spaghetti and noodle tunnels, ravines.
   - Aquifers: local water tables, so caves below sea level aren't all flooded.
   - Underground lakes, lava pools at depth.
   - Cave openings that respect rivers and the sea.
7. **Coasts and oceans.** Beaches, cliffs, stony shores and sandbars, decided by wave exposure (continentalness gradient plus slope). The continental shelf drops to deep ocean.
8. **Horizon LOD.** Distant terrain rendered as coarse heightfield rings out to several kilometres, coloured by biome and fading into the chunk meshes. The 2D surface function makes this cheap. Without it, a 2 km mountain is invisible from 150 m away.

**Done when:** on the debug map and in game, rivers run downhill from mountains to lakes and the sea without breaks; ranges, valleys, coasts and oceans look natural from a peak; generating one chunk averages ≤ 3 ms in a worker; and seams are invisible.

### Phase 3: Biomes and flora

Goal: every place has a recognisable character.

1. **Climate model at block resolution.**
   - Temperature = base field − altitude lapse (6.5 °C per km) ± seasonal amplitude, which comes in phase 4.
   - Precipitation comes from the region moisture simulation.
2. **Biome table** (Whittaker diagram: temperature × precipitation, modified by height, slope, water and weirdness). Target set, about 25:
   - **Oceans:** warm, temperate, cold, frozen ocean, each with a deep variant.
   - **Coasts and water:** beach, stony shore, river, lake, swamp, mangrove.
   - **Open land:** plains, meadow, steppe, savanna, shrubland, desert (with dunes), badlands (striped strata).
   - **Forests:** temperate deciduous, birch, old-growth dark forest, taiga, snowy taiga, tropical rainforest.
   - **Cold and high:** tundra, alpine meadow, scree and bare rock, glacier and snowcapped peaks.
   - **Rare:** volcanic.
3. **Biome blending.** Surface blocks dither across borders. Grass, foliage and water tints blend smoothly per vertex from a climate colour map.
4. **Feature system.** Deterministic anchors (jittered grid per feature type, density by biome). Each feature has a registered maximum extent. A chunk evaluates every anchor within that extent and writes only its own blocks. This generalises the old spec 4, so canopies are seamless by construction. It stays stateless.
5. **Tree generator.** Parametric species rules:
   - trunk height, taper, and 1×1 / 2×2 / 3×3 trunks
   - branching by recursive angles or space colonisation
   - leaf clusters as noisy ellipsoids
   - roots and buttresses
   - size and age variation

   Species: oak, birch, maple, spruce, pine, fir, larch, acacia, baobab, jungle giant, palm, willow, mangrove, saguaro, dead snag, and bushes. Real proportions apply: a mature oak is 30–35 blocks tall. The maximum feature extent is about 24 blocks horizontally.
6. **Ground cover and non-cube meshes.** *Status: tall grass, poppies (spec 18), ferns and dandelions (spec 19), and brown and red mushrooms (spec 21) are done, with the cross-shaped mesh. Flowers by biome, reeds, boulders, fallen logs and the rest are open.*
   - New mesh shapes: cross-shaped plants, thin layers, and torches (deferred earlier; built here because they need the same mesh work).
   - Ground cover: grass tufts, ferns, flowers by biome, reeds, lily pads, mushrooms, moss, fallen logs, boulders.
7. **New blocks and textures** for all of the above, still generated procedurally in code.

**Done when:** a 5 km walk crosses several distinct biomes with believable transitions; every species looks different; and there are no cut canopies at chunk borders.

### Phase 4: Sky, seasons and weather

Goal: time and climate are visible and felt.

1. **Calendar.**
   - A year of 4 seasons × N days (config; default 7).
   - Day length changes with the season, for a configured world latitude (default 45°).
   - The sun path comes from solar declination. Moon phases, and stars that rotate.
2. **Sky rendering.** An atmospheric scattering sky shader with sunrise and sunset colours, and a sun, moon and stars.
3. **Weather model.** Deterministic, so there's no state to save:
   - **Pressure systems.** Large-scale noise is sampled at positions offset by wind × time, so weather fronts drift across the world.
   - **Local factors.** Cloud cover and precipitation follow the front field, adjusted by local humidity, season and orographic lift.
   - **Type.** Rain, snow or sleet is chosen by temperature at that altitude.
   - **Storms.** They form when moisture and heat are high.
4. **Weather rendering.**
   - Clouds whose coverage matches the model.
   - Rain and snow particles around the camera, blocked by column tops (no rain under a roof).
   - Wet-surface darkening.
   - Morning valley fog and humidity haze.
   - Lightning, with thunder delayed by distance (343 m/s).
   - Wind: foliage sway in the vertex shader, slanted particles, drifting clouds.
5. **Seasonal visuals.**
   - Foliage colours shift through the year (spring green, autumn reds and yellows). Deciduous leaves render bare in winter through the shader, with no block changes.
   - Grass browns in a dry summer.
6. **Smooth lighting** (deferred earlier). Per-vertex light averaging, done together with AO, in the mesher.

**Done when:** a full in-game year shows seasonal colour, snow at altitude moving with the season, varied weather passing through, and the weather on reload matches what it was.

### Phase 5: Living world

Goal: the world changes without the player.

1. **Tick system.**
   - Random ticks: K random cells per loaded chunk per tick.
   - Scheduled ticks: per-block timers.
   - Both are budgeted per frame, and their CPU time is shown in F3.
2. **Ecology rules.**
   - Grass spreads onto lit dirt. Plants succeed each other on bare ground.
   - Saplings grow into their species' tree through the feature generator, respecting existing blocks.
   - Crops (wheat, carrots, potatoes) have growth stages and are affected by season and temperature.
   - Leaves without logs decay. Autumn leaf litter.
   - Snow layers (8 heights) build up on exposed tops during snowfall and melt above 0 °C. Ice forms on still water and thaws.
3. **Catch-up.** A chunk reloaded after Δt applies expected outcomes directly (crops advanced by Δt × rate, snow set from current weather). It doesn't replay ticks.
4. **Fluids.**
   - Water has 8 levels, with falling and source flags. Lava has a slower tick.
   - Flow is a cellular automaton that prefers the nearest drop within a few blocks.
   - Water meeting lava makes stone, cobblestone or obsidian.
   - Surfaces are rendered at their real height.
   - Generated rivers carry a flow direction (from the drainage simulation), used for animated flow textures and for pushing the player. Waterfalls form where rivers drop.
5. **Liquid physics.** Shared by the player, creatures and dropped items, all in metric units. *Status: the player's buoyancy and drag (spec 16), wading and splash on entry (spec 17) are done. Currents need fluid levels (item 4), so they wait. Fall damage waits for health (phase 7).*
   - **Per-fluid properties** in config: density, viscosity (drag) and current strength. Water is 1,000 kg/m³ with low drag. Lava is about 3,100 kg/m³, with high drag and slow movement.
   - **Buoyancy** proportional to the submerged fraction of the body (sampled per block layer of the AABB). Bodies have a density: the player floats at about chin height when still. Logs, planks and items float; stone items sink.
   - **Drag.** Quadratic drag in fluids replaces today's fixed swim gravity and speed factor. Terminal sinking speed and swim speed follow from it.
   - **Currents.** Flowing fluid pushes bodies along its flow vector (from the fluid levels, or the river direction from the drainage simulation). Strong rivers can carry the player; waterfalls push down.
   - **Wading.** Partial immersion slows walking in proportion to depth. Swimming starts at chest depth.
   - **Water breaks falls.** Impact speed is reduced by entry depth, which feeds phase 7 fall damage.
   - **Surface behaviour:** jumping out at the surface onto a ledge (today's climb rule, generalised), splashes on entry scaled by impact speed, and the eye-in-fluid check for fog, sound muffling and the air meter.
   - **Lava** sets the body on fire (phase 7 damage). Water extinguishes it.
6. **Rendering for the above:** fluid surfaces and flowing animation, and snow layers.

**Done when:**
- digging a riverbank floods the hole
- a river current carries the player downstream, and a dropped log floats
- snow builds up in a winter storm and melts in spring
- a planted sapling becomes a tree
- frame time stays within budget with the tick system on

### Phase 6: Creatures

Goal: animals that live believably, and danger at night.

1. **Entity system.** Components, per-chunk persistence, and despawn and respawn rules.
2. **Shared physics.** Reuse the player's AABB physics, including step-up. Bodies come in sizes of 1, 2 and 3 blocks tall.
3. **Models.** Built procedurally from textured cuboids, with walk, idle and eat animations.
4. **AI.**
   - Utility-scored behaviours: wander, graze, flee, herd (boids), hunt, sleep, follow.
   - Activity changes with day and night and with the season.
   - A* pathfinding on the voxel grid that respects body height, jump and fall limits.
5. **Wildlife by biome.** Deer, rabbits, boars, wolves (predator and prey), bears, foxes, sheep, cows, goats on mountains, camels in deserts, fish, bird flocks (cosmetic), and more.
   - Populations are capped per biome.
   - Animals spawn with world generation and slowly repopulate.
6. **Hostile mobs.** They appear at night and in dark caves (light < 7), with basic melee combat and knockback.
7. **Sounds** for creatures.

**Done when:** a meadow at dawn has grazing herds that flee when approached, and wolves hunt; hostile mobs appear at night; and 100+ entities run within the frame budget.

### Phase 7: Survival

Goal: a reason to engage with every system above.

**Status (2026-10-15):** item 3 is partly done and item 4 is partly done, by spec 23. Broken blocks drop as items that fall, land and can be picked up, and the F3 overlay counts pickups. Items are not saved, have no stacks and no inventory screen; those are still open.

1. **Game modes.** Survival, and creative (today's sandbox with flight and instant breaking).
2. **Vitals.**
   - Health, regeneration, death and respawn.
   - Fall damage from impact speed in m/s.
   - Drowning (air meter), hunger and saturation.
   - **Body temperature** from biome, altitude, weather, season, wetness, shelter, fire and clothing. Hypothermia and heatstroke. This is where the simulation pays off.
3. **Mining.** Mining time comes from block hardness and tool. A crack overlay shows progress, and broken blocks drop items.
4. **Items and inventory.** Stacks and an inventory grid UI. The hotbar becomes inventory-backed in survival.
5. **Crafting.** A 2×2 grid in the inventory and a 3×3 crafting table, with recipes as a data table. Tools have tiers and durability. Furnaces smelt (a block entity with timers).
6. **Food.** Hunting, farming and cooking.
7. **Beds** to sleep through the night and set a spawn point.

**Done when:** a new survival world is playable from punching a tree through to iron tools, with a winter that is dangerous without shelter.

### Phase 8: Scale and performance

Ongoing, but with a dedicated pass here.

- Section visibility culling ("cave culling" via per-chunk face connectivity).
- Fewer draw calls through batched buffers.
- A packed vertex format (positions as bytes, packed light and colour).
- Palette compression for chunk storage.
- Adaptive time budgets and memory caps.
- Quality presets.
- A frame-time graph in F3.

### Later (unchanged from the old backlog)

- **Building tools:** undo/redo; fill, copy and paste; slabs, stairs, doors; world export and import.
- **Input and platform:** gamepad, touch controls, PWA.
- **Multiplayer:** parked.

## Cross-cutting rules

- **Determinism.** Everything generated is a pure function of the seed and coordinates. Caches must give the same result as recomputing. Weather is a pure function of seed, position and time.
- **Pure modules.** These stay three-free and DOM-free and are unit-tested in Node:
  - generation, simulation, physics, AI, storage and lighting
  - the mesher and the weather model
- **Performance budgets.** Each phase states its own. Generation and meshing stay in workers. The main thread stays under 4 ms per frame for streaming and 2 ms for ticks.
- **No new dependencies** without asking the owner. Vitest stays at 4.0.18.
- **Tests.** Unit tests for every pure module. `npm run smoke` gains a check for each phase's headline feature.
- **Debug tooling grows with the game.** F3 shows chunk, biome, temperature, humidity, season, weather and tick costs. `?map=1` is the terrain tool.

## Main risks

| Risk | Mitigation |
|------|-----------|
| Cubic chunks multiply chunk count and draw calls | Surface-following load set, skipping empty chunks, culling in phase 8 |
| River continuity across region seams | Spike first with the debug map; noise-river fallback |
| Tall terrain invisible without LOD | Horizon LOD is part of phase 2, not deferred |
| IndexedDB writes may not finish on page close | Autosave every 10 s and on tab hide; `pagehide` is best effort |
| Float precision far from the origin | Note only. Revisit with camera-relative rendering if jitter shows beyond ±100 km. |
| Scope | Phase gates; each phase is specced only when reached |
