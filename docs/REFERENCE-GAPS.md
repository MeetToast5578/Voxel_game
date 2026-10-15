# Reference gaps: nrz/Voxels

Last updated 2026-10-15. A docs-only comparison. No code or specs are changed by this file.

## Source and rules

- **Reference:** `nrz/Voxels` (https://github.com/nrz/Voxels), a Java sandbox by Otso Nuortimo, 2016–2017. Its source files carry the GNU GPL header.
- **Our repo has no `LICENSE` file.** Copying or closely translating the reference's code would bring GPL obligations into this repo. So this doc only takes **ideas**, to be re-specified in our own words and built in TypeScript. No code is copied.
- The reference is written for LWJGL and OpenGL 3 and uses greedy meshing, a water handler, and a monster handler. Our stack is TypeScript, Three.js, and workers. Only the designs carry over.

## What the reference has, and where we stand

| Feature | Reference | Our repo today | Roadmap home | Verdict |
|---|---|---|---|---|
| Caves | Yes | Spaghetti caves in `src/world/generator.ts` | Phase 2 item 6 | Covered for now; cheese caverns, ravines and aquifers are still open. |
| Clouds | Yes | `src/render/clouds.ts` | Phase 4 item 4 | Covered. |
| Sound | Walk, jump, impact, dig | `src/audio/sounds.ts` | Phase 6 item 7 (creatures) | Covered for the player. |
| Trees | Yes | `src/world/trees.ts` (spec 10) | Phase 3 item 5 | Ours is further along. The roadmap has the species rules. |
| Water flow | `WaterHandler`: separate water mesh, stable and unstable water sets | One `water` block, no levels, no flow (`src/world/blocks.ts`) | Phase 5 item 4 | **Gap.** |
| Greedy meshing | On (`GREEDY_MESHING = true` in `ChunkMaker.java`) | Per-face quads with per-vertex AO and light (`src/render/mesher.ts`) | Not in the roadmap; phase 8 covers batching and packed vertices only | **Gap**, with a caveat (see below). |
| Mobs and NPCs | `npc/npcHandler.java`, `npc/Monster.java` | None | Phase 6 item 6 (hostile mobs), phase 6 item 1 (entity system) | **Gap.** Needs the entity system first. |
| Dropped items | `ItemHandler`: falling item entities | None. Breaking a block drops nothing. | Phase 7 item 3 (mining drops) | **Gap.** |
| Inventory | Item handler | Hotbar of block ids only (`src/player/hotbar.ts`) | Phase 7 item 4 | **Gap.** Needs survival mode first. |
| Far-terrain compression | Compressed distant terrain | None | Phase 2 item 8 (horizon LOD) | Covered by the roadmap. Not a new idea. |

## The four gaps the owner chose

### 1. Water flow and levels

- **Reference:** water is a set of meshes, with stable and unstable water tracked separately. Water is updated per chunk.
- **Ours:** water is one block with no level.
- **Roadmap:** phase 5 item 4 (8 levels, falling and source flags, a cellular automaton, lava slower than water).
- **Our note:** the roadmap asks for levels, not the reference's mesh-based approach. Do not copy the mesh split. Fluid levels fit the block-state system (`u16` variants, spec 4). Currents (phase 5 item 5) depend on this gap.
- **Haiku-sized?** No. `HANDOFF.md` puts living-world ticks and fluids on the list for a larger model's plan.

### 2. Greedy meshing

- **Reference:** merges coplanar faces into larger quads.
- **Ours:** each face is its own quad, and each vertex carries AO and sky/block light (`mesher.ts`, `AO_LEVELS`).
- **Caveat:** merging only works when neighbouring faces share the same AO and light. Our per-vertex AO and light break most merges. Greedy meshing would likely save little here, or need a change to how light is stored. Measure before building. The mesh-time gap (3.1–3.7 ms against 3 ms, from `HANDOFF.md`) is the target.
- **Haiku-sized?** No. `HANDOFF.md` lists the mesher as core work that is easy to get subtly wrong.

### 3. Mobs and NPCs

- **Reference:** a monster handler with a large model file and an NPC handler.
- **Ours:** none. The entity system (phase 6 item 1) does not exist.
- **Roadmap:** phase 6 items 1–6. Build the entity system and shared physics first.
- **Haiku-sized?** No. Phase 6 needs its own plan.

### 4. Dropped items and inventory

- **Reference:** `ItemHandler` drops block items that fall and can be picked up.
- **Ours:** breaking a block leaves nothing behind. The hotbar holds block ids.
- **Roadmap:** phase 7 items 3–4 (mining drops, stacks, and an inventory grid). Survival mode (phase 7 item 1) is listed first.
- **Our note:** dropped items need an entity system, so they depend on phase 6 item 1 as well.
- **Haiku-sized?** No, not yet. Survival mode and the entity system come first.

## Open questions for the owner

1. **Licence.** Is the owner happy for this repo to take ideas only, with no reference code? If the owner wants code, the repo needs a licence decision first.
2. **Order.** Of the four gaps, which should be specced first? Water levels is the roadmap's next step in phase 5. Greedy meshing is the cheapest to measure first, with a benchmark in `npm run smoke`.
3. **Mesher.** Should greedy meshing be measured before anyone decides to build it? See the caveat above.
