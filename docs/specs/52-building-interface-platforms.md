# Spec 52: Slabs, redo, accessible inventory and offline installation

Complete the unfinished slab plan through gameplay and saves, add redo through the existing
volume queue, fix native inventory activation/modal behavior, and provide a production-only
installable offline shell. Keep Pixel Aero's separate redesign and gamepad/in-world touch
controls open. Do not change dependencies, old block IDs or save version.

## Slabs

Append bottom/top variants for every **solid cube** material. Fluids and plants are not
solid slab materials. A half is 0.15 m / 0.5 block, derived in config. Keep old states 0..76
unchanged and serialize slab variants by canonical registry names. Inventory presents one
slab item per material; placement chooses its half and mined top slabs return that item.

Side-hit height chooses bottom/top; upper/lower faces choose bottom/top respectively.
Clicking a matching interior half or complementary adjacent half makes the original full
cube. Reject mismatched materials, occupied halves and actual body overlap, including when
a merge would fill space occupied by the player. Volume edits use the same occupied bounds.

Shared player/item/body sweeps must collide with actual vertical intervals, including fast
crossings, step-up, head clearance, walls and depenetration. Ray targeting must skip empty
halves, detect interior faces and work from the empty half of the origin cell. Highlights,
cracks, held/dropped geometry and icons follow the half height. Slabs reuse material textures,
axis-specific log faces, climate tint and light emission.

Approved conservative lighting/culling shortcut: slabs do not hide neighbour faces or block
sunlight; cube neighbours keep their faces. A slab's interior horizontal face remains visible
even with a cube in the next cell. No waterlogging: one cell holds one state. Fluids and
falling blocks must not overwrite slabs. A falling full block above a bottom slab drops its
item instead of floating over the gap. Support traverses touching faces only. Collapsed slabs
drop items rather than using full-cube loose-body shapes. Slab variants do not inherit sand's
cell-fall rule; they are building pieces with the normal structural support checks.

## Redo and inventory

Redo reverses only successfully undone cells that still contain the expected state. It uses
the existing per-step edit budget and bounded history, refuses busy/unloaded actions without
losing history, and preserves later physics/player changes. A new changed edit clears redo;
no-op edits do not. Bind Ctrl/Cmd+Y and Ctrl/Cmd+Shift+Z; keep undo on Ctrl/Cmd+Z. Show counts.

Inventory slots use native button click activation for mouse, Enter, Space and touch. Ignore
right-button presses and key repeat. Opening inventory moves focus inside; Tab wraps inside;
closing returns focus. Mark the dialog modal. Keep header/hotbar accessible while the larger
block catalogue scrolls in short windows. Preserve nine authoritative hotbar slots.

## Platforms

Add a manifest and scalable icon. Only production registers a relative-scoped service worker.
Precache index, CSS, main bundle and both worker bundles; use a content/version-specific cache.
Wait for old tabs to close before activating a new version; remove obsolete shell caches.
Navigation uses network with cached-shell fallback, including query options and subdirectory
hosting. Cache only application files; saves remain in IndexedDB. No extra install dialog.

Installation/offline requires a supported browser and HTTPS or localhost, and one successful
online cache installation. Gamepad and in-game touch movement/look/build controls remain open.

## Acceptance

Run full check, strict worker guards and GPU regressions. Browser smoke must place a bottom
slab, land at half height, merge halves, place a ceiling slab, restore a top slab from real
IndexedDB and redo/undo a 27-cell box. The platform suite tests /voxel/ hosting, modal Tab,
native touch/keyboard selection and screenshots at 640×360, 1280×720, 1920×1080 and 1000×700;
reload offline and require actual worker-backed game readiness. Inspect screenshots.
Owner physical-browser acceptance is tracked separately in tasks.md.
