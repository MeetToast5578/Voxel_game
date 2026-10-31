# Spec 28: Mesh performance (get surface chunk mesh time to ≤ 3 ms)

**Goal:** Reduce the average mesh time of a surface chunk from the measured 3.1–3.7 ms (in Node, seed 1) to ≤ 3 ms, so the Phase 2 performance target is met for warm columns as well as cold ones.

**Why:** `docs/HANDOFF.md` lists mesh time as a known gap: "Mesh time: It averages 3.1–3.7 ms per surface chunk in Node, against spec 6's 3 ms target. The remaining cost is region building and the face loop."

**Scope (ponytail: smallest change that works):**
- Profile `buildChunkMesh` in `src/render/mesher.ts` to find the hot spots.
- Optimize the face loop and/or `buildRegion` / `paddedFromRegion` without changing the mesh output (same faces, same AO, same lighting).
- No change to the public API: `buildChunkMesh(neighbors, tops, cy)` keeps the same signature.
- No behavior change: rendered output must be identical (tests compare mesh data).

**Out of scope:**
- Cave culling (phase 8 item: section visibility culling) — that's a separate, larger change.
- Batched draw calls / packed vertex format — separate phase 8 items.
- Light reach changes — light must stay exact.

**Files:** `src/render/mesher.ts` (primary), `tests/mesher.test.ts` (existing, ported to 3D already), new `tests/mesh-perf.test.ts` if needed.

**Acceptance criteria:**
- `npm run check` passes.
- Existing `mesher.test.ts`, `litMesher.test.ts`, `relight.test.ts` pass unchanged (output identical).
- Measured mesh time of 50 surface chunks of seed 1 in Node ≤ 3 ms average, reported in the PR.
- Mesh output for the same 27-neighbor + 9-tops input is byte-identical before and after.

**Open questions:** None — this is an optimization with identical output.