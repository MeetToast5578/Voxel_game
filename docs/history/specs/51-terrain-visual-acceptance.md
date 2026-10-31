# Spec 51: Terrain coordinates, lake basins and visual transitions

The elevated seed-1 reproduction showed a vast flat green surface, rectangular water
strips and clipped tree crowns. Compare the proxy and voxels independently, fix the
terrain causes, then capture fully loaded views before declaring visual acceptance.

## Correctness requirements

- Region ownership must match simulation geometry. Regions are centred on multiples of
  4096 blocks; their owned core runs from centre minus 2048 through centre plus 2048.
  Floor division without that half-core shift selected the wrong region, clamped samples
  beyond its simulated grid, and produced plateaus and abrupt cliffs. Test real sampler
  reads on a known slope, including negative coordinates, 50 X/Z seams and cache clearing.
- Depression filling is a drainage calculation. Classified lakes must retain their original
  basin bed rather than becoming filled stone. Lake density detail must stay below the
  quantized water surface. Check both simulated basins and generated water above ground.
- Keep the generated terrain band independent of edited lighting tops. Saved opaque roofs
  must not displace ground; sparse glass/building chunks must render outside the immediate
  vertical cylinder. Do not generate empty gaps under high structures or air-only cleanup
  above terrain. Retain active mesh neighbours during vertical movement and reload edits
  after horizontal unloading.
- Finish the proxy's near fade before starting voxel silhouettes' fade. End voxel rendering
  before the load-circle boundary, preserving cutout texture alpha before distance hashing.
  Disable this transition underwater or without a horizon. Held items retain full visibility.
- Preserve depth ordering: the proxy must not occlude actual voxel ground. Increase ring
  resolution, use stable world-space detail and slope shading, and keep tunables in config.

## Verification and review

Run typecheck, unit tests, build, strict worker guards, GPU regressions and full browser
smoke. Update fixed worldgen fixtures by inspecting real generated cells, keeping their
support/water/cache assertions. The corrected terrain changes unedited generated ground;
existing saved edits are preserved and may float relative to it. Dependencies, block IDs,
save version and mountain-height bounds remain unchanged.

`scripts/terrain-review.mjs` captures elevated, recentered, ground, forest and ridge views
with zero pending generation/mesh jobs, and reports browser errors. Images under
`screenshots/terrain-review-*.png` are local ignored artifacts. Inspect them as well as
checking readiness. Rendering tests cover near/full, intermediate hashed and fully faded
voxels, voxel-only fallback and real ground below a deliberately raised proxy.

These changes do not certify owner approval. The far heightfield omits trees and saved
structures and approximates coastlines between vertices. T-C6 still requires the specified
50 **real river** seams on the debug map; the synthetic slope regression establishes
coordinate correctness, not hydrological continuity between independently simulated basins.
