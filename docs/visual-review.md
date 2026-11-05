# Visual review — 2026-11-03, version 0.6.4

Reviewed the actual game and rendered fixtures, retaining the Woodland & Ember art direction. This is a consistency
and usability pass, not a replacement texture pack.

| Area | Finding | Result |
| --- | --- | --- |
| Normal play | Debug text and the large frame graph covered the scene by default. | Hidden initially; F3 still toggles both, and `debug=1` starts with them enabled. |
| Inventory | Thick slot frames reduced phone item art to 16 pixels. | Thin borders and larger slots leave 34 px for desktop art and about 30 px at a 390 px phone width / default scale. |
| Menus | Gameplay HUD and navigation displays remained behind modal screens. | Hotbar, bars, hand, reticle, map and compass are hidden while menus are open. |
| Responsive layout | Fixed column counts and zoom could overflow intermediate screen sizes and long workshop labels. | Adaptive palettes, bounded panels, wrapping trades, fitted text areas and equipment cards. All seven screens checked at 320, 390 and 768 px, at all sixteen selectable GUI scales. |
| Atmosphere | Terrain faded into haze, but mobs, items and other world objects did not. | Six renderers now use live terrain fog references, the same horizontal distance and the same exponential curve. Sky rendering stays separate. |
| Targeting | Every outline/crack overlay was a full cube. | Slabs, stairs, snow, open doors, torches, beds and wall fittings use their actual component boxes. |
| Decorations | Framed icons were squeezed into a non-square texture; dark sign ink lacked contrast. | Square frame canvases and warm cream lettering with a dark outline. |
| Reticle | The authored 64 px art lost detail when reduced to 16 px. | A 24 px pixelated reticle with a dark outline improves visibility. |

Validation uses `scripts/visual-review.mjs` and its `visual-fixtures.html` scene. It reads rendered GPU pixels from
actual mob, drop, boat, sign, frame and effect materials: objects have visible pixels in clear air and zero pixels
different from the fog background beyond the fog limit. The same browser run checks normal play, F3, modal overlays,
icon dimensions and 336 layout combinations. Screenshots and measured bounds are in ignored `screenshots/visual-*`.

`src/tests/visuals.test.ts` checks partial-block geometry, matching outlines/cracks, old-component hiding and live fog
references. Standard checks, world smoke and a production decoration review are recorded in `HANDOFF.md`.

Existing scene captures cover forest, river, high terrain, dusk, night and cave views; existing mob gallery inspection
covers all twenty species. Software-rendered browser checks do not establish frame rate on the owner's hardware.
No saved-world format, block registry, texture source art, creature hitboxes or gameplay balance changes.
