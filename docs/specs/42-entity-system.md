# Spec 42: Entity system (Phase 6, slice 1)

**Goal:** A minimal entity system: entities have IDs, positions, velocities, types, and sizes. They can be spawned, despawned, and stepped each frame with gravity and block collision. Pure module (no three.js, no DOM), tested in Node.

**Why:** Phase 6 item 1 of the roadmap. Foundation for creatures, dropped items (beyond the current simple item entities), and any future moving objects.

**Scope (ponytail):**
- `src/world/entity.ts` (pure): `Entity` interface, `EntitySystem` class
- `Entity`: id, type, x, y, z, vx, vy, vz, halfWidth, height, onGround
- `EntitySystem`: spawn(entity) → id, despawn(id), get(id), all(), step(dt, isSolid)
- `step`: applies gravity, moves with AABB sweep (reuses `moveAndCollide` from `src/player/physics.ts`), friction on ground
- Config: `ENTITY_GRAVITY`, `ENTITY_TERMINAL_VELOCITY`, `ENTITY_FRICTION` (reuse existing config values where possible)
- Tests (Node, vitest): spawn/despawn, entity falls and rests on floor, entity slides on friction, entity doesn't fall through floor

**Out of scope:**
- AI behaviours (wander, graze, flee, ...) — Phase 6 item 4
- Rendering (procedural cuboid models) — Phase 6 item 3
- Per-chunk persistence — Phase 6 item 1 (later slice)
- Despawn/respawn rules — Phase 6 item 1 (later slice)
- Wildlife by biome — Phase 6 item 5

**Files:** `src/world/entity.ts` (new), `tests/entity.test.ts` (new)

**Acceptance criteria:**
- `npm run check` passes.
- `tests/entity.test.ts`: spawn returns unique ID, despawn removes entity, entity falls under gravity and rests on floor, entity stops sliding due to friction, entity doesn't clip through solid blocks.
- Entity doesn't depend on three.js or DOM.