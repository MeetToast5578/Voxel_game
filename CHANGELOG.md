# Changelog

The newest version comes first. `npm run check` fails if the version at the top here is not the one in
`package.json`, so the two are changed together.

## 0.7.0 — 2026-11-09

The "3D Terraria" pass (Milestone 18).

- Crafting is a list, not a grid: everything you can make from what you carry, by category, with ingredients and
  have/need counts, Craft and Craft all. A workbench within four cells opens its recipes.
- New inventory: equipment and accessories, hotbar and backpack, and crafting side by side. Sort the backpack; a trash
  slot keeps the last item thrown away. Items have rarity colours.
- Five accessory slots and seven accessories: Swiftstep Anklet, Cloud Charm (double jump), Featherfall Charm, Ironskin
  Band, Gill Pendant, Ember Ring and Heart Locket. Life Crystals raise max health to 40.
- Creatures are rebuilt from smooth shapes on jointed skeletons with walk, run, graze, attack, flinch, hop and flap
  animation. Animals and the trader lie down to sleep; monsters never sleep.
- New monsters: green, cave and ember slimes that hop, cave bats that fly, and skeletons. Rare drops include
  accessories; monsters drop coins, and the trader sells accessories for them.
- Combat: swords and axes sweep an arc and hit everything in it, with crits, knockback and stagger, damage numbers,
  health bars and a slash trail. A brief moment of safety follows each bite. The held item is drawn in 3D and swings.
- Magic: the Spark Wand and Ember Staff cast bolts that fly straight, using mana (20, shown while a staff is held).
- Bosses: the Slime King (summoned with a Gel Crown) and the Gloom Matriarch (a giant moth, called at night with a Moth
  Lure); both call their brood when struck. Gloom Moths flutter over forests and plains at night.
- Villages: clusters of houses with pitched roofs in clearings. Each house has a farmer, smith or herbalist with their
  own shop, who wanders near home by day and sleeps in their bed at night. Defeated creatures fall over and fade.
- Automatic resolution keeps the frame rate smooth on slower machines (Settings, Resolution).
- Saves upgrade step by step, keeping a backup of the old record (save version 5).

## 0.6.8 — 2026-11-05

- Rebuilt title and pause menus around distinct navigation sections, preserving new-world drafts between sections.
  Introduced a consistent ink, sage and brass interface with readable settings, world cards and keyboard focus states.
- Split inventory activities from backpack/quick access; recipes now show their ingredients and availability.
  Trading shows the received item, price and owned currency. Dialogs have explicit close controls.
- Repainted water and lava without directional bands. Fluid frames now warp continuously across moving tile edges,
  keeping seamless borders and smooth interpolation rather than a frozen grid around the moving interior.
- Removed hard dark rectangles on water by rendering only the outside boundary above water and the inside boundary
  while submerged. Added joined-field and above/below-water GPU checks, plus broader menu navigation/layout checks.
- Closed thin gaps along river steps and unequal flowing water/lava levels: shared sides now retain their exposed
  strip instead of hiding the whole face. Covered source, flow, falling and chunk-boundary cases.
- Expanded fluid gap regression coverage to every flow/falling state, all side directions and intersecting chunk
  borders, with GPU coverage checks that deliberately reproduce the original missing-face defect.

## 0.6.7 — 2026-11-04

- Restored defined grass blades: separate overhead tufts and upright side blades with restrained painted edge
  highlights and overlap shadows. Grass remains vegetation on all six faces, including the underside.
- Repainted the flatter ground/rock, ore, species-plank and foliage materials with fewer, larger primary forms;
  softened detail density in water/lava and bedding while preserving their material character.
- Rebuilt affected alternatives and animation frames from the revised art. Existing equipment, machinery frames
  and other already-readable surfaces retain their shading. Added a native-pixel grass comparison and depth style brief.

## 0.6.6 — 2026-11-04

- Grass blocks and slabs now show vegetation on all six faces, including undersides, as requested by the owner.
- Expanded the rework across ground and rock materials, all ore types, every living wood species, plants, crop
  growth stages, saplings, equipment tiers, resources, food, containers, navigation icons and station faces.
  Every runtime image is a separate named PNG with measured source bounds and explicit transparency/repeat rules.
- Furnace and forge openings, torches and lanterns now play eight-frame loops with fixed surrounding surfaces;
  water and lava have coherent replacement materials and looping frames.
- Harvested crops use dedicated inventory icons. Item frames gain linen backing. Tall doors use four continuous
  texture segments across all facings/open states, including chunk boundaries, instead of repeating a whole door.
- Bed pillows select the correct head end in all four facings. Torch/lantern world textures fill their model UVs,
  while separate inventory sprites retain readable proportions and padding.
- Expanded the actual-game gallery to terrain, ores, trees, all slab/stair materials, stations, plants, icons and
  animation playback; added source separation, active coverage, alpha, growth-scale and door continuity checks.

## 0.6.5 — 2026-11-04

- Replaced stone, dirt, grass top/side, sand, gravel, cobblestone and brick with eight independently authored masters.
  Exported 36 separate, named 32×32 PNGs including coherent generated alternatives; active variants use the new art.
- Grass sides show a green sod edge over brown soil. Biome tint preserves soil colour, and lower grass slabs keep
  the grass edge at their actual top through UV cropping. Slabs and stairs retain the parent material's scale.
- Added explicit source/face bindings and an actual-game mesh gallery for all cube faces, slab halves, stair facings
  and repeated surfaces, with GPU grass-colour checks. The full texture/image/animation audit tracks later batches.

## 0.6.4 — 2026-11-03

- Normal play starts with the debug text and graph hidden; F3 toggles both. Menus hide the gameplay HUD and reticle.
- Larger item artwork, clearer selected slots and responsive inventory/title layouts, including phone widths and
  every supported GUI scale. The authored reticle is larger and outlined for contrast.
- Mobs, dropped items, boats, signs/frames and effects now share the terrain's horizontal fog and haze curve,
  including cave and underwater conditions. World-object lighting uses the current frame's atmosphere.
- Target outlines and breaking overlays follow slabs, stairs, snow and thin fittings instead of a full cube.
- Framed items retain their square proportions; cream sign lettering with dark outlines improves readability.
- Added actual-GPU fog checks and desktop/phone visual regression coverage.

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
