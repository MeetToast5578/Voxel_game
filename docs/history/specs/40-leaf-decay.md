# Spec 40: Leaf decay

**Goal:** Chop a tree's trunk and its leaves fall. Leave a log, and the canopy stays.

**Why:** Phase 5, item 2 ("leaves decay"). Without it, every chopped tree leaves a canopy hanging in the air.

**Where the rule lives:** a simple "no log within N blocks" test does not work for this world: tree crowns are several blocks wide and branches push leaves far from the trunk, so a radius test would erode healthy trees. Instead the rule is a connectivity walk from the *break*: a leaf decays only when the log that was holding it up is gone and no other log can be reached through leaves and logs.

**Scope:**
- `src/world/leafDecay.ts` (new, pure): `orphanedLeaves(getBlock, x, y, z, limit)`. Breadth-first walk from the six neighbours of the broken log through `LEAVES` and `LOG`. Returns `[]` if any log is reachable (the canopy is still supported), otherwise every reachable leaf with its BFS depth. Capped at `limit` leaves.
- `src/world/ecology.ts`: `scheduleLeafDecay(world, x, y, z)` walks the orphaned leaves and schedules a `'leaf-decay'` tick for each, due `1 + min(depth, 20)` ticks later so the canopy fades outward. `handleTick` handles `'leaf-decay'` by removing the leaf if it is still a leaf.
- `src/game.ts`: `setBlock` calls `scheduleLeafDecay` when a `LOG` is replaced by a non-log block.
- Tests: `tests/ecology.test.ts` — the pure walk (orphaned vs supported, depth), the tick cascade fells the canopy, and a remaining log keeps it.

**Out of scope:** growing leaves back (saplings, spec to come), and leaf decay from explosions or other removals (only player block edits schedule it today).

**Acceptance:** `npm run check` passes; breaking the last log of a tree schedules its leaves and they disappear over the next few ticks; breaking one log of a two-log tree does nothing.
