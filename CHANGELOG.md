# Changelog

The newest version comes first. `npm run check` fails if the version at the top here is not the one in
`package.json`, so the two are changed together.

## 0.6.0 — 2026-11-02

- **Mobs:** distinct voxel rigs with ears, tails, horns, antlers, fins, crawler legs, humanoid arms and accessories;
  idle, walking, sleeping and attack poses. Faces appear on the front of heads. Instanced rendering is retained.
- **New encounters:** Dune Stalkers, Mire Hollows and Snow Prowlers spawn at night in their matching biomes. A low,
  wet swamp biome grows mangroves/willows. Traveling Traders offer two-way trades; peaceful mode stays peaceful.
- **Trading and forging:** craft a trading post or find one at a camp. Sell supplies for coins and buy goods.
  Craft an ember forge to upgrade tools and armour through three saved levels, with increasing resource costs.
- **Decorations:** craft wall signs and item frames, edit sign text, display or retrieve an item. Contents persist
  through reload; breaking/support loss returns framed items.
- **Integrated art:** species-specific tree materials/saplings, Pixel Aero panel/slot/button/status art, hand poses
  and armour-matched gloves, and animated fire, smoke, sparks, splashes, lightning and impacts.
- Named saved states remain readable; new decoration/equipment fields are optional in older saves. Previously
  unedited generated trees gain species materials and qualifying low wet ground can now become swamp.

## 0.5.0 — 2026-11-02

- **Art expansion:** 336 named textures and sprites across trees, creatures, material variations, effects, UI, hands
  and future content, with source sheets, individual PNGs, previews and a reproducible export script.
- **Active visuals:** full-colour skins for all 16 creatures, 48 spatial material alternatives, eight-frame water
  and lava animation, and an illustrated empty hand. Material variation preserves greedy meshes and saves.
- Tree-specific rendering, remaining effects, Pixel Aero UI and future-content assets are prepared artwork; their
  corresponding renderer/feature work remains separate. See `assets/woodland-ember/expansion/README.md`.

## 0.4.0 — 2026-11-01

- **Woodland & Ember artwork:** 146 authored 32×32 terrain, building, plant, crop and item tiles replace the old
  16×16 procedural swatches. Inventory, held items and drops use the same art; slabs and stairs share materials.
- **Creatures:** species-specific surface markings and faces, keeping the existing instanced drawing and models.
- **Breaking:** connected fractures grow in ten stages.
- Source atlases, tile manifest and a reproducible packing script live in `assets/woodland-ember/` and
  `scripts/pack-art.mjs`. Artwork is bundled for offline play.

## 0.3.0 — 2026-10-31

More to find and do (milestone 11 of `docs/tasks.md`), and task 9.5.

- **Boats:** craft one from planks, put it on water and ride it; crouch to step out and take it back.
- **The Ember Warden:** a guardian wakes in each ember shrine and keeps the ancient chest shut until it falls; it
  drops ember crystals and diamonds. A new journal milestone (21 in all).
- **Thunderstorms:** lightning strikes near the player, scorches the ground and hurts whatever stands in the open;
  the thunder follows by distance.
- **The map remembers** the land walked through, and keeps it in the save.
- **Fittings fall:** ladders, lanterns and torches drop as items when what holds them goes.
- **Stairs and doors** collide as their real shapes: stairs climb in half steps, a closed door is a thin panel.

## 0.2.0 — 2026-10-31

The sandbox becomes a survival game with a goal (milestones 1–9 of `docs/tasks.md`).

- **Front door:** a title screen; new worlds start in survival on safe ground, with a difficulty; a loading screen;
  settings for volume, music, keys, invert Y, menu size, hints and view bob; first-steps hints; a recipe list;
  tooltips; gamepad in menus.
- **A world that pushes back:** body temperature, campfires, swords and bows, armour, buckets, crouching, ladders,
  burning, and feedback when hurt.
- **Progression:** gold, diamond and lapis have uses; diamond tools and armour; ember ore deep down; compass, map and
  lantern.
- **Danger:** skulkers, cave crawlers and frost brutes; monsters in dark caves, tougher deeper; torch-lit rooms are
  safe; creatures call and find paths.
- **Places and a goal:** ruins, watchtowers, camps, mines, vaults and ember shrines with loot; light the beacon on a
  mountaintop to finish; a journal of 20 milestones and statistics.
- **Animals and farming:** follow, feed and breed; wool; fishing; farmland; regrowth and catch-up for crops.
- **Sound and feel:** ambience, generated music, footsteps by material; a held item, break particles, view bob,
  currents, stony shores, creative copy and paste.

## 0.1.0 — 2026-10-31

The 0.6 m engine rewrite replaces the old game (spec 54).
