# Spec 30: Feature system

Status: built (this spec was written after the code, to document it). Phase 3, item 4 of [the roadmap](../ROADMAP.md).

**Goal:** Features such as trees can reach across chunk borders without a seam. Each chunk evaluates every feature anchor whose extent can reach it, and writes only its own blocks. The result does not depend on which chunk asks, or in what order.

**Requirements (as built, `src/world/feature.ts`):**
- A feature type registers a key, `densityPerChunk`, a `maxExtentBlocks` (how far its blocks can reach from its anchor), and a `place(seed, anchorX, anchorZ, emit)` function.
- Anchors sit on a jittered grid with spacing `ANCHOR_SPACING_BLOCKS` (16). The jitter comes from a hash of the anchor's cell and the feature key, so two features never share a jitter stream.
- `evaluateAnchors` calls `place` for every anchor whose extent overlaps the requested range. The caller keeps only the blocks inside its own range.
- Registering the same key twice is an error.

**Acceptance criteria:**
- The same seed and range give the same blocks, whichever chunk asks.
- A feature that spans a chunk border is complete on both sides, with no gap or duplicate.
- Two different feature keys never share a jitter stream.

**Test cases:** `tests/feature.test.ts` (8 tests) covers registration, anchor determinism, border coverage and the key hash. `tests/trees.test.ts` covers the seamless canopies that depend on it.
