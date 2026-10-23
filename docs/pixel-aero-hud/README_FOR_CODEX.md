# Pixel Aero HUD — Codex implementation specification

> Status: design proposal, not yet implemented. Target: 3D Minecraft/Hytale-like voxel sandbox, where one WORLD voxel measures 0.3 m. The on-screen UI pixel grid is completely independent of world voxels.

## Goal
Build a distinct, clean **Pixel Aero** HUD: true low-resolution pixel-art craft combined with optimistic 2004–2013 Frutiger Aero color/material cues. This is **not** Minecraft hearts/hunger/XP recolored cyan. The user wants an original legible game interface that keeps the 3D world dominant.

See the SVG design references in [references](references/). They are GitHub-readable design diagrams and are **not** texture atlases or production assets.

## Non-negotiable visual rules
- Draw to a logical 640×360 UI canvas; integer scale on compatible displays; pixel-snapped fallback/letterboxing for others. Do not use bilinear scaling on pixel-art sprite sheets.
- Every border, bevel, highlight, icon, and rounded corner must align to the same low-resolution pixel grid. Corners are stair-stepped, not antialiased vector curves in the *final in-game implementation*.
- A glossy highlight is a 1–2 logical-pixel band, not a blurred neon glow; gradients use subtle ordered dithering. Glass is tinted, translucent, and high-contrast behind any text.
- Limit ornamentation: no continuous pulsing, bubbles everywhere, full-screen frosting, oversaturated neon lines, or distracting animations.
- Actual interactions and typography must remain readable. Reserve pixel fonts for labels/short numbers; use a readable fallback for body text and accessibility.

## Recommended colors
| Token | Hex | Use |
| --- | --- | --- |
| sea-deep | `#153F59` | base panel |
| aero-blue | `#257A9C` | secondary pane |
| aqua-cyan | `#5BCBDC` | borders, interaction |
| ice-glass | `#CBF7F5` | glints and active edge |
| paper-white | `#FFFFFF` | primary text |
| leaf-green | `#94DCAE` | energy / positive |
| soft-coral | `#FF9484` | vitality / danger |
| warning-gold | `#FFD17B` | warnings / notices |
Preserve contrast in day/snow/water scenes. Use configurable opacity/contrast settings.

## Proposed HUD layout
At 640×360 logical pixels (4% safe-area margin, adjustable):
- **Bottom left — vitality module**: approx. 116×36. Small VITAL label, coral segmented health meter, thin green energy meter. No individual heart, meat, or XP glyphs. Always visible during survival play unless HUD hidden.
- **Bottom right — tool dock**: approx. 190×38. Five to six visible quick-access tiles in a compact horizontal strip, more tools reachable by scrolling / paging; selection is made unmistakable via an ice-white outline and interior brighter shade. Show tool icon, stack counts, optional durability sliver. Do not blindly change existing 9-key bindings: map the UI to existing slot model or expose remapping.
- **Center — reticle**: four 1–2px separated arms; changes to target square / interact mark / build footprint contextually, never obscures the target.
- **Upper left — contextual environment**: compact biome/time info; avoid showing raw coordinates by default; allow debug toggle.
- **Upper right — compass / optional minimap**: compact compass by default; detailed minimap is optional/configurable (not permanently dominant).
- **Near target — interaction tooltip**: small icon/name/action affordance shown only for valid focus; disappear when irrelevant.
- **Notifications**: stack at right edge with bounded count and lifetimes; avoid fighting tool dock or action prompts.

See [layout-blueprint.svg](references/layout-blueprint.svg).

## Behavior specification
### Vitality
1. Health and energy values come from real gameplay state, not UI mock data.
2. Segments update deterministically; damaging health gives a single brief coral flash (100–160 ms) and optional screen-edge hint, respecting reduced-motion settings.
3. Low health triggers an accessible label and non-color cue; high values never overflow their container.
4. Energy represents a real mechanic if present; if not, hide the meter until there is one. Do not invent stamina rules as part of a visual redesign.

### Tool dock
1. Preserve the authoritative gameplay inventory and hotkey implementation; dock is a VIEW of the current quick-access slots.
2. Input support: mouse wheel, keys, mouse click, gamepad bumpers, and screen-reader labels where platform permits.
3. Hover state brightens tile one step; active state is a 2px high-contrast border and tiny top sheen. Disabled state removes saturation but retains shape.
4. Icon silhouettes share a nominal 16×16 or 24×24 logical-pixel grid. Quantity figures align bottom-right and have a dark shadow.
5. When opening inventory, maintain selected item and avoid collisions with overlays.

### Crosshair / interaction
- Idle = light four-arm crosshair; target acquired = aqua outlined pixel bracket; usable target = small interaction mark; building = unobtrusive bracketed placement square.
- Context prompt: action + object name + bound key, e.g. `Grass Block · E Interact`; adapt text to locale and current remappings.
- Range and interactability must be calculated by gameplay systems; no misleading prompt on unreachable targets.

### Context panels / compass
- Fade away or simplify when unobtrusive mode is enabled.
- Top-left: location/biome only when discovered / changed. Compass shows coarse directions; minimap is optional and can be toggled off completely.
- Coordinates/debug telemetry are separately configurable.

### Animation
- Hover feedback: 80–120 ms.
- Slot selection glint: at most 180 ms and only on user action.
- Damage feedback: 100–160 ms.
- Transitions should avoid continuous shader animation while idle; reduced-motion disables glints and sliding.

## Renderer and scaling
- Keep HUD drawing separated from gameplay and world camera. Disable filtering on pixel atlases, use deterministic pixel snapping at every display resolution, and handle fractional device pixel ratios gracefully.
- Composition hierarchy: world > crosshair > persistent HUD > interaction tooltip > notices > modal menus.
- Keep UI background translucent but readability-driven: e.g. deep-sea alpha ~0.75–0.90 in complex scenes, with optional high-contrast opaque variant.
- Use 9-slice pixel panel assets / tile borders; avoid stretching corner pixels.
- Use render batch/atlas where available. Avoid frequent allocations per frame and preserve performance on lower-end GPUs.

## Responsiveness and accessibility
- Target 16:9 desktop first; support 16:10, ultrawide, and low-resolution windows with anchored constraints and safe areas.
- Allow 1×, 2×, 3× and Auto UI scale; Auto must choose a readable pixel-perfect scale where possible.
- High-contrast option, color-blind-safe shape cues, reduced-motion option, optional minimap, HUD opacity, hide-HUD shortcut, tooltip duration.
- Keyboard-only and controller navigation for any interactive HUD affordance.

## Source of truth / implementation instructions for Codex
1. Inspect repository engine, HUD and input architecture before editing. Do not assume Godot/Unity/Unreal. Preserve existing save formats and game mechanics.
2. Build a small token/theme module (`PixelAeroTheme`) centralizing colors, 1px step units, border widths, type sizes, and animation speeds.
3. Implement scalable nine-slice style, pixel-font helper, pixel snapping, and dither shader or palette-safe pre-dithered sprites. Test that texture filtering is disabled.
4. Implement vitality as read-only subscriptions to existing health/energy.
5. Implement tool dock as read-only view of existing inventory/quick-slot state, with event forwarding through existing action handlers.
6. Add minimal contextual crosshair + tooltip + compass/biome readouts, but only if backing gameplay data already exists; otherwise stub behind feature flags.
7. Check UI at 640×360 / 1280×720 / 1920×1080 and a noninteger-scale window. Capture screenshots.
8. Iterate against reference images; do NOT reproduce Minecraft-like hearts or hunger icons.
9. Keep full inventory, crafting, title screen, settings menu redesigns as Phase 2; do not block HUD work on them.

## Suggested milestones
- **A Foundation:** palette tokens, sprite/pixel grid, text styles, contrast + scaling.
- **B Status:** vitality and energy meter, low-health feedback, wiring.
- **C Tools:** dock, slot selection, tooltips, key/controller behavior.
- **D Context:** reticle, target prompt, compass, notifications, accessibility.
- **E Later expansion:** inventory, crafting, pause menu, settings, map, advancement UI.

## Acceptance checklist
- [ ] No Minecraft heart/hunger/XP visual language in the new HUD
- [ ] Reference grid, step corners, dither, and crisp art look deliberate
- [ ] Health/tool values reflect game state, never hardcoded placeholders
- [ ] High-contrast and keyboard/controller states remain legible
- [ ] No input bindings broken by new tool dock
- [ ] HUD placement avoids overlapping notifications and edge cutoffs
- [ ] Usable at 720p / 1080p and fractional scaling
- [ ] Animation respects reduced motion
- [ ] No changes to world voxel size or unrelated gameplay logic
- [ ] Screenshots compared to references and documented

## Reference index
- [Gameplay HUD concept](references/gameplay-hud.svg)
- [Pixel Aero component states](references/component-states.svg)
- [640×360 layout blueprint](references/layout-blueprint.svg)

**Reference fidelity:** These SVG drawings are recreated implementation guidance rather than the previously generated PNG files. Rebuild production sprites on the pixel grid; do not export the SVGs blindly as the final UI.
