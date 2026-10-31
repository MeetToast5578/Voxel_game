# Spec 38: Random ticks

**Goal:** The world changes on its own. Every tick step, each loaded chunk picks a small number of random cells and runs a per-block update handler. This is the engine behind ecology (phase 5, item 2): grass spreading, leaf decay, snow settling and melting, and crops.

**Why:** Spec 25 added *scheduled* ticks (a per-cell timer queue). That is right for a delayed, one-shot event ("sand falls in 2 ticks", "water flows now"). Ecology needs the opposite: a steady trickle of *random* updates so that, given enough time, every grass block near bare dirt eventually spreads. The roadmap (phase 5, item 1) asks for both, and both are budgeted per frame.

**Scope:**
- `src/world/randomTick.ts` (new, pure): choose which cells get updated, deterministically.
- `src/world/world.ts`: add `randomTickStep(budgetMs, handler)` next to `tickStep`. Runs the random pass over loaded chunks under a time budget and counts how long it took.
- `src/world/ecology.ts`: add `handleRandomTick(world, x, y, z, rng)`. First rule: grass spreads onto adjacent lit dirt (reusing `GRASS_SPREAD_CHANCE` and `GRASS_SPREAD_LIGHT_MIN`). Later rules (leaf decay, snow) append here.
- `src/worker`/`chunkManager.ts`: call the random pass from the same place as `tickStep`.
- `src/config.ts`: `RANDOM_TICKS_PER_CHUNK` (default 3).
- `src/ui/debugText.ts` + `src/debugApi.ts`: report random-tick cost and count in F3, next to the scheduled-tick numbers.
- Tests: `tests/randomTick.test.ts` (new) and additions to `tests/ecology.test.ts`.

**Out of scope:**
- Leaf decay, snow, crops and sapling growth are *separate* rules added to the same handler, each with its own spec.
- Fluids use the scheduled tick queue (spec 25), not random ticks.

**Determinism (cross-cutting rule):** the cells a chunk picks are a pure function of `(seed, tickNumber, chunk coordinates)`. Two runs of the same world pick the same cells in the same order. The handler may be random in effect but must be driven only by the position and the tick so a replay matches.

**Algorithm:**
- For each loaded chunk, in a stable order, draw `RANDOM_TICKS_PER_CHUNK` cells.
- A cell is chosen from a per-chunk PRNG seeded by `(seed, tickNumber, cx, cy, cz)` — `mulberry32` over a `hash`-derived seed. Each draw gives a local `(lx, ly, lz)` in `[0, 16)`.
- Read the block; call `handler(world, wx, wy, wz, rng)` where `rng` is a fresh deterministic float for this cell (so a rule can roll a probability).
- Stop early when the elapsed time reaches `budgetMs`, keeping the remainder for the next step (do not lose chunks — resume from the same chunk index next time, or simply let the next step re-draw; either is acceptable as long as it stays deterministic and bounded).

**Acceptance criteria:**
- `npm run check` passes.
- `tests/randomTick.test.ts`: the chosen cells are deterministic for a given `(seed, tick)`; all cells fall inside the chunk; `RANDOM_TICKS_PER_CHUNK` cells are drawn per chunk; the budget is respected.
- `tests/ecology.test.ts`: a grass block surrounded by lit dirt converts the dirt to grass within a bounded number of random-tick steps; dirt without light does not convert; non-dirt does not convert.
- F3 shows the random-tick count and cost.

**Files:** `src/world/randomTick.ts` (new), `src/world/world.ts` (modify), `src/world/ecology.ts` (modify), `src/world/chunkManager.ts` (modify), `src/config.ts` (add constant), `src/ui/debugText.ts` (modify), `src/debugApi.ts` (modify), `tests/randomTick.test.ts` (new), `tests/ecology.test.ts` (modify).
