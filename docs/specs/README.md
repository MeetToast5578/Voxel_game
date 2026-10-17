# Specs

Each spec gives the goal, requirements, acceptance criteria and test cases. None of them contain implementation code. The roadmap is in [../ROADMAP.md](../ROADMAP.md); the current state is in [../HANDOFF.md](../HANDOFF.md).

## Phase 1: Foundation

Phase 1 of the roadmap: the new scale, cubic chunks with no height limit, 16-bit block states, and a save that can grow.

| # | Spec | Size | Built by | Depends on |
|---|------|------|----------|------------|
| 1 | [CI](01-ci.md) | small | Haiku | — |
| 2 | [World scale](02-world-scale.md) | small | Haiku | 1 |
| 3 | [Auto step-up](03-step-up.md) | medium | Haiku | 2 |
| 4 | [16-bit block states](04-block-states.md) | medium | Claude | 1 |
| 5 | [Cubic chunks: data model](05-cubic-chunks-data.md) | large | Claude | 4 |
| 6 | [Cubic chunks: light and mesher](06-cubic-light-mesh.md) | large | Claude | 5 |
| 7 | [Cubic chunks: streaming](07-cubic-streaming.md) | large | Claude | 6 |
| 8 | [Save v2 in IndexedDB](08-save-v2.md) | medium | Haiku | 4, 5 |
| 9 | [Meter-based world scale and realistic trees](09-meter-scale-world.md) | large | Claude | 2, 6 |
| 10 | [0.3 m blocks](10-fine-blocks-0-3m.md) | large | Claude | 9 |

**Order.**
- Spec 1 comes first.
- Specs 2–3 and specs 4–7 are two independent tracks. They both touch `src/config.ts`, so merge one before rebasing the other.
- Spec 8 comes last.
- Specs 5–7 may share one branch, because the game doesn't run between them.

## Phases 2–7: all specs

Status is checked against the code on 2026-10-17. "Open" means the spec's goal is not met yet; the notes say what is missing.

| Spec file | Title | Status | Notes |
|-----------|-------|--------|-------|
| [11-debug-map.md](11-debug-map.md) | Debug map (`?map=1`) | Done | |
| [12-climate-shape-fields.md](12-climate-shape-fields.md) | Climate and shape fields | Done | |
| [13-terrain-from-fields.md](13-terrain-from-fields.md) | Terrain from the fields | Done | |
| [14-minecraft-density-terrain.md](14-minecraft-density-terrain.md) | Minecraft-style density terrain | Done | |
| [15-geology.md](15-geology.md) | Geology: strata and slope soil | Done | |
| [16-water-buoyancy-drag.md](16-water-buoyancy-drag.md) | Water buoyancy and drag | Done | |
| [17-wading-and-splash.md](17-wading-and-splash.md) | Wading and splash | Done | |
| [18-ground-cover.md](18-ground-cover.md) | Tall grass and poppies | Done | |
| [19-ferns-and-dandelions.md](19-ferns-and-dandelions.md) | Ferns and dandelions | Done | |
| [20-geology-slice-2.md](20-geology-slice-2.md) | Limestone, slate, basalt, deepslate | Done | |
| [21-mushrooms.md](21-mushrooms.md) | Brown and red mushrooms | Done | |
| [22-natural-mountain-height.md](22-natural-mountain-height.md) | Natural mountain height | Done | Mountains capped at 60 m |
| [23-grass-blocks.md](23-grass-blocks.md) | Grass blocks green on every side | Done | |
| [24-inventory-and-items.md](24-inventory-and-items.md) | Inventory, held block, breaking, drops | Done | Tools not built |
| [25-sandbox-physics.md](25-sandbox-physics.md) | Sandbox physics (program) | Done, slices 1–6 | Tick core, rule fields, falling sand and gravel, flowing water, structural collapse, loose bodies. Pending falls are found by a scan on load, not saved; lava is not in the game |
| [26-ores.md](26-ores.md) | Ores (geology slice 3) | Done | |
| [28-mesh-performance.md](28-mesh-performance.md) | Mesh performance, 3 ms target | Open | 4.1 ms measured alone. No test-case section |
| [29-calendar-and-seasons.md](29-calendar-and-seasons.md) | Calendar and seasons | Done | Written after the code |
| [30-feature-system.md](30-feature-system.md) | Feature system | Done | Written after the code |
| [31-climate-block-resolution.md](31-climate-block-resolution.md) | Climate model at block resolution | Done | |
| [42-entity-system.md](42-entity-system.md) | Entity system (phase 6, slice 1) | Partial | Pure module, not used by the game. Renumbered from 31 |
| [32-biome-table.md](32-biome-table.md) | Biome table (Whittaker diagram) | Done | |
| [43-weather-model.md](43-weather-model.md) | Weather model | Done | Renumbered from 32 |
| [33-sky-rendering.md](33-sky-rendering.md) | Sky rendering | Partial | Sun, moon and stars are in. No moon phases; stars do not rotate |
| [44-survival-health.md](44-survival-health.md) | Survival mode and health | Partial | Modes, health, fall damage, drowning and respawn are done. Hunger is inert; no UI to pick the mode. Renumbered from 34 |
| [34-weather-model.md](34-weather-model.md) | Weather model and rendering | Partial | Particles and lightning are in, and the F3 overlay shows the season, weather, biome, temperature and rain. Wet darkening and morning fog are still missing. |
| [35-biome-integration.md](35-biome-integration.md) | Biome integration into the generator | Partial | Surface, soil and trees follow the biome. Border blending is wired: surface blocks dither within 3 blocks of a border. Open: tints do not blend per vertex, and biomes are still picked per 16x16 chunk column |
| [36-ecology-grass-spreading.md](36-ecology-grass-spreading.md) | Grass spreading | Done | |
| [37-tree-species.md](37-tree-species.md) | Tree species | Partial | Sizes decided 2026-10-17: oak is 27-40 blocks (8.1-12.0 m), every species sits inside 8-12 m. Pine (snowy taiga) and dead snag (tundra) are wired to biomes, and every species is reachable (task T-E12). Open: 8 of the 16 roadmap species do not exist |
| [38-random-ticks.md](38-random-ticks.md) | Random ticks | Done | |
| [39-biome-integration-fix.md](39-biome-integration-fix.md) | Biome integration fix | Done | Review of spec 35 |
| [40-leaf-decay.md](40-leaf-decay.md) | Leaf decay | Done | |
| [41-region-simulation.md](41-region-simulation.md) | Region simulation: rivers, lakes, erosion, moisture | Done | Feeds the terrain. Seam continuity not yet checked by eye |

### Known problems in the spec files

- **Spec 27** never existed in the repo. Specs 29 and 30 were added afterwards, to document the code.
- **Test-case sections.** Specs 10, 28 and 31–44 have goals and acceptance criteria but no separate numbered test-case list (task T-L7 corrected the old "28 and 31–41" line: specs 25, 29 and 30 do have test-case lists, and 42–44 do not). Where one exists, a `Tests:` or `Files:` line in the spec names the test files.

## Rules for every spec

- **One spec per branch and per pull request,** except specs 5–7 as noted. Don't mix specs, and don't refactor code the spec doesn't mention.
- **Don't change dependencies.** Don't add, remove or upgrade packages. In particular, do not move Vitest to 4.1.x, because `npm install` crashes on it. `package.json` and `package-lock.json` should not appear in the diff.
- **Pure modules stay pure.** `src/core`, `src/world`, `src/player`, `src/render/mesher.ts`, `src/storage` (except the IndexedDB implementation) and `src/ui/debugText.ts` must not import three or touch the DOM. They are unit-tested in Node.
- **Tunable numbers live in `src/config.ts`.** Import them; never hard-code them elsewhere. Distances and speeds are written in meters and converted there (from spec 2 on).
- **Tests go in `tests/`**, using the existing Vitest style. Note that `toEqual` treats −0 and 0 as different.
- **Ported tests keep their intent.** When a spec changes a layout or a scale, update the existing tests that encode it, and list each change in the pull request. Never delete an assertion to make a test pass.
- **Update `README.md`** when behaviour a player can notice changes.
- **Definition of done:**
  - `npm run check` passes (typecheck, all unit tests, build).
  - `npm run smoke` passes.
  - Every test case the spec lists exists and passes.
  - The pull request describes what changed and how it was verified, including any measurements the spec asks for.
- **Stop and ask** if a spec is unclear or contradicts the code. Don't guess.
