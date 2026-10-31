# Spec 50: Terrain, scheduled updates and worker recovery

The owner's loaded game showed broken terrain and unreliable block physics. This audit
follows checkpoint 337ac95 and prioritizes correctness over more visual features.
The existing rates remain 20 Hz for block updates and 60 Hz for moving bodies.

## Confirmed bugs repaired

- Lighting tops include leaves. A canopy covering an entire chunk could make the loader's
  surface band stop above the ground. Generators now report the minimum actual ground
  height separately; synchronous loading and worker replies both carry that bound.
- Rendered mesh hysteresis could retain incomplete perimeter sections outside the active
  set. Remove these sections while keeping generated chunks cached for movement.
- Horizon samples previously switched between three height models based on camera distance.
  A location could change shape as the camera moved. A single-cell surface sampler now
  shares density/coast parameters with actual voxel generation at every distance.
- Transparent, depth-writing horizon triangles could cover real opaque terrain and trunks.
  Render the proxy before voxels, without writing depth, using alpha hashing for fades.
  Draw the sky before both. Ring resolution now doubles at each transition.
- Unloading destroyed pending tick queues; reload only scanned for sand/flowing water,
  losing support, leaf and source-fluid updates and their delays. Preserve dormant queues
  and serialize pending work plus the simulation tick in optional save-v3 metadata.
  Unloaded chunks pause their remaining delay. Saved fields are repaired on load; old
  saves still use recovery scans, which skip already-restored updates.
- Removing a high-altitude edit could exhaust the 64-chunk top scan and report no terrain
  beneath it. Retain generated skyline bounds, account for intervening saved edits and jump
  known-empty gaps before scanning. Test both an 8001-high removal and an unloaded blocker.
- Repeated chunk sorting could consume the random-tick budget before a cell was visited.
  Cache the stable coordinate order until chunks are added or removed.
- Worker crashes/rejections left job slots occupied indefinitely. Reject outstanding pool
  work, release manager slots and continue through the synchronous generation/mesh path.
  Handle blocked worker creation and horizon-worker failures too; F3 reflects fallback.
- Delayed leaf decay ignored support restored by a new log. Recheck current support and
  defer incomplete searches at unloaded boundaries.
- Structural collapse failed to wake adjacent fluids/falling blocks, and support checks
  abandoned unknown chunk borders. Notify neighbours and retry inconclusive checks.
- Scheduled ticks sharing a due time and cell now use reason as a final stable tie-break.

## Validation

Unit regressions cover dense-canopy bounds in both loading paths, perimeter cleanup,
voxel/horizon sample agreement and camera independence, exact mid-fall save/reload delay,
unloaded queues, malformed save fields, rejected tops/generation/mesh jobs, worker crash,
worker construction/disposal, restored leaf support and delayed border support checks.

The GPU regression deliberately puts proxy terrain *above* actual ground and asserts
that the real ground still appears. Gameplay smoke additionally checks a sand tick saved
with two ticks remaining in IndexedDB, reloads the game and verifies it lands without a
duplicate. The elevated terrain reproduction is captured after all jobs finish:
seed 1, position `(101.5,245,-26.5)`, yaw `-0.8`, pitch `-0.35`.

Latest results and screenshots are recorded in `docs/HANDOFF.md` and `log.txt`.
The standard 50-chunk worker guard passes. The extra dense-forest fixture still exceeds
its 3 ms mesh guard slightly on this environment; this is an open performance issue.
No benchmark thresholds were relaxed. Palette-cache/precomputation experiments did not
improve measured times and were reverted. Both fixture geometry hashes remain unchanged.

## Audit scope and remaining work

Repository-wide searches/typechecking/tests were combined with direct review of terrain,
streaming, rendering/lighting, tick rules, world edits, save codecs/stores, worker queues,
input, player collision, inventory, dropped items and ecology. Passing tests do not certify
every gameplay path or replace an owner playtest.

The isolated elevated browser reproduction passes readiness but still looks too coarse,
with broad flat proxy surfaces and partial-looking distant vegetation. This is an open
visual defect, not a completed fix or owner acceptance. An intermediate full browser run hit an elevated-readiness timeout; diagnostics found
ongoing remesh work after uncontained fluid fixtures. Their bedrock floors and cleanup
now cover the entire fluid spread. The final rerun/result is recorded in log.txt.

Continue with distant LOD appearance/transition review, forest meshing performance,
river-seam acceptance, and saved edits outside the immediate surface band. The horizon
still approximates geometry between samples and omits distant saved structures and trees;
this patch does not implement far-distance voxel meshes. No dependency, old block-ID,
mountain-height or save-version changes are included.
