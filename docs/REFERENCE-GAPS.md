# Reference gaps: nrz/Voxels

Last updated 2026-10-15. A docs-only comparison. No code or specs are changed by this file.

## Source and rules

- **Reference:** `nrz/Voxels` (https://github.com/nrz/Voxels), a Java sandbox by Otso Nuortimo, 2016–2017. Its source files carry the GNU GPL header.
- **Our repo has no `LICENSE` file.** Copying or closely translating the reference's code would bring GPL obligations into this repo. So this doc takes only **ideas**, to be re-specified in our own words and built in TypeScript. No code is copied.
- The reference is a LWJGL (Java OpenGL) game. Only its designs carry over.
- **Method:** a read-only survey of the reference's source, with the key citations spot-checked by grep. Nothing was run. Where the reference has code that is never called, it is marked dormant.

## Table: every open roadmap item

Game status comes from `docs/ROADMAP.md` and `docs/HANDOFF.md`. Reference status comes from the survey. "Absent" means the reference has no example.

| Phase | Item | Game status | Reference status | Reference citation |
|---|---|---|---|---|
| 0 | Hand playtest (owner task) | open | n/a | n/a |
| 2 | 3 Region simulation (rivers, erosion, lakes, moisture) | open | absent (flat sea only) | `Chunk.java` `setBlocks` |
| 2 | 5 Geology (ores, gravel, clay) | partial | partial (strata only) | `Chunk.java` `setBlocks` |
| 2 | 6 Caves beyond spaghetti | partial | partial (one style, no ravines or lava) | `Voxels.java` `getCaveNoise`; `Chunk.java` `setBlocks` |
| 2 | 7 Coasts and oceans | open | absent | n/a |
| 2 | 8 Horizon LOD | open | absent | n/a |
| 3 | 1 Climate model | open | partial (one noise threshold) | `Voxels.java` `getBiomeNoise` |
| 3 | 2 Biome table (about 25) | open | absent (3 surface types) | `Chunk.java` `initMaxHeights` |
| 3 | 3 Biome blending | open | absent | n/a |
| 3 | 4 Feature system | partial | partial (cross-chunk tree buffer) | `Voxels.java` `putToBuffer`; `Chunk.java` `checkBuffer` |
| 3 | 5 Tree species | partial | partial (one shape, big variant) | `Chunk.java` `createTree` |
| 3 | 6 Ground cover (flowers, reeds, boulders, logs) | open | absent (grass is a texture only) | `Type.java` `GRASS` |
| 3 | 7 New blocks and textures | partial | implemented (13 ids, one atlas) | `Type.java`; `AtlasManager.java` |
| 4 | 1 Calendar and sun path | open | partial (day/night disabled) | `Voxels.java` `NIGHT_CYCLE` |
| 4 | 2 Sky shader | open | partial (clear colour and linear fog) | `Voxels.java` `initLighting`, `initFog` |
| 4 | 3 Weather model | open | absent | n/a |
| 4 | 4 Weather rendering | open | absent | n/a |
| 4 | 5 Seasonal visuals | open | absent | n/a |
| 4 | 6 Smooth lighting | open | absent | `Voxels.java` `initLighting` |
| 5 | 1 Tick system | open | absent | n/a |
| 5 | 2 Ecology rules | open | absent | n/a |
| 5 | 3 Catch-up | open | absent | n/a |
| 5 | 4 Fluids (levels, flow, lava, waterfalls) | partial | partial (static sea water; flow code dormant) | `WaterHandler.java` `simulateWaters` (no callers); `ChunkManager.java` `processWater` (commented out) |
| 5 | 5 Liquid physics (buoyancy, drag, currents) | partial | partial (no buoyancy or swimming) | `EulerCamera.java` `inWater` |
| 5 | 6 Fluid and snow rendering | partial | partial (10 water-level types) | `Type.java` `WATER1`–`WATER10` |
| 6 | 1 Entity system | open | partial (dormant chase AI) | `npcHandler.java` `addNPC` |
| 6 | 2 Shared physics | open | partial (player only) | `EulerCamera.java` `processKeyboard` |
| 6 | 3 Models and animation | open | absent (`Monster.java` is generated data) | n/a |
| 6 | 4 AI and pathfinding | open | partial (chase only, no pathfinding) | `npcHandler.java` `processMonsters` |
| 6 | 5 Wildlife by biome | open | absent | n/a |
| 6 | 6 Hostile mobs | open | partial (dormant) | `Monster.java` `act` |
| 6 | 7 Creature sounds | open | absent | n/a |
| 7 | 1 Game modes | partial (flight toggle) | partial (flight ignores collision) | `EulerCamera.java` `toggleFlight` |
| 7 | 2 Vitals (health, fall damage, drowning, hunger, body temperature) | open | absent | n/a |
| 7 | 3 Mining time and crack overlay | partial (drops only) | absent (instant break) | `ChunkManager.java` `castRay` |
| 7 | 4 Items and inventory | partial (dropped items in game) | partial (falling items, no pickup, no inventory) | `ItemHandler.java` `processItemPhysics` |
| 7 | 5 Crafting and furnaces | open | absent | n/a |
| 7 | 6 Food | open | absent | n/a |
| 7 | 7 Beds and spawn | open | absent | n/a |
| 8 | Culling, batching, packed vertices | open | absent (one draw call per chunk) | `ChunkMaker.java` `createVertexHash` |
| 8 | Palette compression | open | partial (compressed bytes, not a palette) | `ChunkMaker.java` `toByte` |
| 8 | Adaptive budgets, quality presets, F3 frame graph | open | absent | n/a |
| Later | Building tools (undo, fill, copy, slabs, doors, export) | open | absent | n/a |
| Later | Gamepad, touch, PWA | open | absent | n/a |

**Known gaps from `HANDOFF.md`:**
- Mesh time (3.1–3.7 ms against 3 ms): the reference uses greedy meshing (`GREEDY_MESHING = true` in `ChunkMaker.java`), but our per-vertex AO and light limit merging. See the caveat below.
- Cold column generation and plains stepping: no reference counterpart.

**Reference features not on our roadmap:**
- A bedrock layer and a forced air ceiling (`Chunk.java` `FORCED_AIR_LAYERS`).
- Wireframe toggle and camera zoom.
- Runtime distance keys (F8/F9).
- Bulk add and remove on X and C. C clashes with the slow-down key in `EulerCamera`.

## The four gaps the owner chose

### 1. Water flow and levels (phase 5 item 4)

- **Reference:** a level-based water handler exists, but it is dormant. `simulateWaters` has no callers and the flow pass in `ChunkManager` is commented out. Static sea water is the only live water.
- **Ours:** one `water` block with no level (`src/world/blocks.ts`).
- **Roadmap:** 8 levels, falling and source flags, a cellular automaton, lava at a slower tick.
- **Our note:** the reference does not show a working flow system, so it is no model for item 4. Fluid levels fit the block-state system (`u16` variants, spec 4). Currents (phase 5 item 5) depend on this gap.
- **Haiku-sized?** No. `HANDOFF.md` puts living-world ticks and fluids on the list for a larger model's plan.

### 2. Greedy meshing (not on the roadmap)

- **Reference:** merges coplanar faces into larger quads (`ChunkMaker.java` `createVertexHash`).
- **Ours:** each face is its own quad, and each vertex carries AO and sky/block light (`mesher.ts`, `AO_LEVELS`).
- **Caveat:** merging only works when neighbouring faces share the same AO and light. Our per-vertex AO and light break most merges, so greedy meshing would likely save little unless light is stored differently. Measure before building.
- **Haiku-sized?** No. `HANDOFF.md` lists the mesher as core work that is easy to get subtly wrong.

### 3. Mobs and NPCs (phase 6 items 1–6)

- **Reference:** a dormant chase AI in `npcHandler.java` (`addNPC`, `processMonsters`) and `Monster.java` (`act`). Nothing spawns them, and the spawn and render loops are commented out. `Monster.java` is about 10,500 lines of generated model data.
- **Ours:** none. The entity system (phase 6 item 1) does not exist.
- **Roadmap:** build the entity system and shared physics first.
- **Haiku-sized?** No. Phase 6 needs its own plan.

### 4. Dropped items and inventory (phase 7 items 3–4)

- **Reference:** `ItemHandler.processItemPhysics` makes broken blocks fall and spin. Nothing picks them up, and there is no inventory.
- **Ours (updated):** broken blocks now drop as items that fall, land, and can be picked up, and the F3 overlay counts pickups. Spec 23 ports the design and is credited in `src/items/droppedItems.ts`. Items are not saved, and there are no stacks or inventory screen yet. The hotbar still holds block ids (`src/player/hotbar.ts`).
- **Roadmap:** stacks, an inventory grid and saving the items remain. Survival mode (phase 7 item 1) is listed first.
- **Our note:** items are a plain list in `Game`, not the entity system, so the entity system (phase 6 item 1) is still needed for mobs.
- **Haiku-sized?** No, not yet. Survival mode and the inventory design come first.

## Corrections to the earlier version of this doc

- Water: the reference's flow code is dormant. Earlier text said water was updated per chunk.
- Items: the reference's dropped items are never picked up. Earlier text said they could be.
- Sound: the reference's jump and impact sounds are loaded but their `play()` calls are commented out. Only footsteps and the break sound are live.

## Open questions for the owner

1. **Licence.** Is the owner happy for this repo to take ideas only, with no reference code? If the owner wants code, the repo needs a licence decision first.
2. **Order.** Of the four gaps, which should be specced first? Water levels is the roadmap's next step in phase 5. Greedy meshing is the cheapest to measure first, with a benchmark in `npm run smoke`.
3. **Mesher.** Should greedy meshing be measured before anyone decides to build it? See the caveat above.
