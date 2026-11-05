# Visual artifact and menu review — 0.6.8, 2026-11-05

Reviewed the active texture pack through the actual mesher, texture array, terrain shader, inventory icons and
browser UI. Screenshots use software WebGL, so they establish rendered appearance and layout rather than hardware
frame rate. Existing grass, creature rigs, item IDs and saves are preserved.

## Findings and changes

| Finding | Change |
| --- | --- |
| Fluid masters and interior translation produced conspicuous directional patterns. | Independently repainted water and lava with irregular ripple/basalt forms; exported separate named tiles and frames. |
| Animated interiors moved against a stationary tile perimeter, outlining the block grid. | Periodic whole-tile warping moves the edges too. Opposite edges still match in every frame; smooth GPU frame interpolation is retained. |
| An isolated pool showed a hard dark rectangle inside a brighter perimeter. | Water's far walls/bottom were blending through its upper surface. Only outward-facing boundaries render above water; inward-facing boundaries render underwater, in one pass. |
| Entering a water voxel could change the rendering before reaching its lowered visible surface. | Camera immersion now uses the same source/flow/falling height calculation as the mesher, including water stacked across chunk boundaries. |
| The full river scene still showed thin brown stripes at height steps after replacing the artwork. | The mesher culled an entire side between equal fluid types even when their visible heights differed. It now keeps the exposed joining strip for source, flowing and falling water/lava, including chunk edges. |
| Title/pause mixed world management, world creation and settings in one long interface. | Separate navigation destinations with a persistent Continue/Resume action. New-world drafts survive section changes. |
| Large decorative panel frames competed with content and reduced useful space. | Consistent ink/sage surfaces, brass accents, restrained borders, readable headings, focus outlines and narrow-screen layouts. |
| Inventory activities, supplies and recipes were hard to distinguish. | Separate activity and backpack panes, labeled quick access, explicit close control and searchable recipe cards with ingredients and preparation status. |
| Trades emphasized payment without clearly presenting the exchange. | Show received item, exact cost and owned quantity together; unavailable trades are disabled and skipped by controller navigation. |

The gallery also covers ground/rock, ores, all tree species, repeated fields, slabs/stairs, station orientations,
assembled doors/beds, plants/growth stages, inventory icons and animated stations. Existing geometry/UV checks,
all-face grass probes and cutout alpha checks remain enabled. No further art replacements were justified by this
pass's inspection of the unchanged material groups.

## Review captures and checks

Generated captures live under ignored `screenshots/`:

- `visual-title-{new-adventure,saved-worlds,settings,controls}-{desktop,phone}.png`
- `visual-pause-{journey,settings,worlds,controls}-{desktop,phone}.png`
- `visual-inventory-desktop.png`, `visual-survival-phone.png` and workshop captures
- `core-textures-*.png`, including `core-textures-fluids.png` with joined 4×4 water/lava fields
- `river-fluid-seams.png`: close-up from the production river scene, showing the corrected level joins

`scripts/visual-review.mjs` checks 672 screen/viewport/GUI-scale combinations, one visible menu section, keyboard
section activation and draft persistence, readable inventory icons, hidden gameplay overlays and six actual object
fog renderers. `scripts/core-texture-gallery.mjs` covers 396 rendered mesh/icon/animation cases, smooth fluid versus
discrete station timing, six-face grass, and outside/inside water compared with single-boundary GPU references.
`src/tests/rework.test.ts` rejects frozen fluid borders; environment tests cover visible immersion heights.

Follow-up for the owner's screenshot of spaces between water blocks: `src/tests/fluidSeams.test.ts` exhaustively
checks source/eight flow/eight falling states for both fluids, all four side directions, both horizontal chunk
borders and simultaneous vertical chunk borders. It covers 2,754 pair configurations plus two full-width greedy
joins, verifying that the exposed interval is completely filled and submerged shared faces stay hidden.
`scripts/fluid-seams-fixture.js` adds 32 actual GPU views of flat, stepped, flowing and waterfall fields assembled
across X/Y/Z chunk boundaries. An independent union of filled boxes defines the expected coverage; magenta reveals
holes. The same check deliberately removes joining strips to reproduce the original bug. Corrected fields have
zero continuous openings in 811,184 checked pixels; the negative controls expose 18,752 hole pixels. Different
triangle tessellations can disagree by isolated one/two raster pixels, so those are recorded separately rather than
misreported as an open stripe. The updated river capture has none of the original exposed brown cross-river lines.

Production `qol-smoke.mjs` and `features-smoke.mjs` exercise recipe search/preparation/collection, inventory transfer,
furnace collection, trading, forge upgrades, sign/frame editing and persistence. Standard checks, benchmark and
world smoke results are recorded in the handoff.

## Remaining visual work

- Flowing/falling fluids still share the still-fluid artwork. They need direction-aware playback, shore/contact foam
  and dedicated falling surfaces; the new loops alone do not communicate flow direction.
- Coarse far-terrain rings produce conspicuous green/blue triangles at short view distances, visible in the river
  capture. Their height/color sampling and transition to loaded chunks need a separate distance-terrain pass.
- Beacon activation/active states, held-item grips/actions and projectile shapes remain in milestone 19.
- Mobs retain the existing sixty skins: dedicated head sides/back, exposed hands and facial states remain useful.
- Ember upgrades retain their current icon treatment; tier-specific upgraded equipment art remains open.
- Title scenery is now restrained CSS silhouettes. Authored title/ending/death illustrations and identity artwork
  remain separate art tasks, as do controller glyph integration and custom item tooltips.

The complete asset backlog remains in [texture-asset-audit.md](texture-asset-audit.md). These are follow-up art/state
requirements; this review does not claim all future animation and model work is complete.
