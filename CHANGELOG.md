# Changelog

The newest version comes first. `npm run check` fails if the version at the top here is not the one in
`package.json`, so the two are changed together.

## 0.6.3 — 2026-11-02

- Refined all twenty mob skins with clearer pixel clusters, readable faces and single-limb textures. Dedicated trader
  clothing, leather packs, bone and brass replace borrowed monster skins and flat accessory surfaces.
- More distinct silhouettes: stocky bears, rabbit haunches and tall ears, branched deer antlers, goat beards, fox tails,
  plated dune stalkers with stingers, frost-brute spikes and a framed Ember Warden core visible in darkness.
- Legs and feet, arms and hands, bow pieces, tails and head details animate around shared joints at the actual
  creature proportions. Sleeping lowers the whole connected rig to the ground.
- Foot/hoof texture crops and half-texel atlas clamps remove repeated whole-leg art on paws and neighbouring-tile bleed.
  All mobs retain a single instanced draw and the 32-part limit; hit feedback and world lighting remain active.
- Gallery tools inspect idle, walk, attack and sleep poses from front, side and three-quarter views.

## 0.6.2 — 2026-11-02

- Jumps tolerate a press just after leaving a ledge or just before landing, including a briefly tapped jump.
- Crouch + right click places held blocks against chests, doors and workshops without opening them. Target prompts
  show this action and respect the rebound crouch key.
- Used-up building stacks refill from an exact matching stack in the backpack, so held placement continues.
- Middle click selects an owned material in survival, swapping from the backpack if needed. Creative picking keeps
  tree species and reuses matching hotbar slots; facing and lit states resolve to their building materials.
- Escape closes inventory and workshop screens. Losing focus, pausing or releasing pointer capture clears held
  controls and pending actions.

## 0.6.1 — 2026-11-02

- Shift-click (or Shift+Enter on a focused slot) transfers items between chests/furnaces and inventory, or between
  hotbar and backpack. Shift-click crafting output makes complete batches while ingredients and space remain.
- Furnace output respects cursor stack limits, supports taking one with right click, and cannot accept deposits.
- Search the creative block/item palette and recipe list. Tree species names, including saplings, are searchable.
- Hotbar numbers and reachable block/creature interaction prompts make controls easier to discover.

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
