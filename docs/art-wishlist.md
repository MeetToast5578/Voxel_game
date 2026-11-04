# Art wishlist

What the game needs drawn, for Codex (or any artist) to work through. Written 2026-11-04 after a review of every
block, item, creature and screen in the game.

**Direction:** an adventure RPG in a voxel world, closer to Terraria than to Minecraft: biomes with their own
materials and dangers, bosses, towns with NPCs, loot with rarity, and gear in clear tiers. Names and looks should be
our own: avoid Minecraft's names and signature looks (redstone, emerald, lapis, diamond, glowstone, bedrock,
obsidian, deepslate, beacon).

Priorities: **P1** fixes what is in the game now. **P2** is art for features that are planned or half built.
**P3** is the RPG expansion.

---

## How to deliver (read first)

The first art pass had problems that came from how the sheets were made, not from the drawing. Please follow these rules:

1. **Tiles are 32 × 32 pixels**, drawn as pixel art at that size (not painted large and shrunk).
2. **One sheet per set, on an exact grid**, with a **gutter of at least 4 empty pixels** between cells. No drawing may
   cross into the gutter or the next cell (stray pixels from neighbours caused halos on flowers and hands).
3. **Real transparency** for cutouts (plants, items, icons): alpha 0 background, no white or checkerboard, and no
   soft or anti-aliased edges: every pixel fully visible or fully clear.
4. **Repeating textures must tile:** the left edge continues into the right edge and the top into the bottom.
   Check by placing the tile 3 × 3. Avoid one big feature in the middle (it shows as a grid when repeated).
5. **Animations loop:** the last frame must lead back into the first. Say the frame count and speed.
6. **One shared palette** for the whole game (up to ~64 colours) and **light from the top left** on every tile and icon.
7. **Smooth materials must still be pixel art:** sand, snow and clay need clear pixel clusters, not soft gradients.
8. Deliver the sheet **and** each cell as its own PNG named as in this list (`snake_case`), plus a contact sheet.
9. Where a block has variants, deliver **4 variants** (`name_alt_0` … `name_alt_3`) with the same colours and
   edges, so large areas do not repeat.
10. Item icons: 32 × 32, the object filling about 24 px, with a 1-pixel dark outline on the outside only.

Creatures: the game is moving to creatures built from smooth simple shapes (balls, capsules, cones) with plain
colours, so **creature skins are not needed**. Instead, deliver **reference turnarounds** (front, side, back,
three-quarter) with a 6–10 colour palette per creature; the models are built from those.

---

## P1 · Fix what is in the game now

### Terrain
| Asset | Problem now | What to make |
| --- | --- | --- |
| `grass_side` (+4 alts) | All grass, no soil: hills read as one green blanket | Dirt with a grass fringe on top (6–10 px, ragged edge) |
| `leaves` (+4 alts, per tree species) | Visible grid over forests | 4 variants per species; small leaf clusters, no central blob |
| Ore **overlays** | Each ore sits on its own lighter rock, so ore blocks look like pasted squares | Ore specks on a **transparent** background, drawn over whatever rock hosts them (stone, slate, basalt, sandstone, deep rock) |
| `sand`, `clay`, `snow`, `limestone`, `sandstone` (+alts) | Soft smudged gradients | Re-draw as pixel clusters |
| `stone` vs `cobblestone` | Look almost the same | Calm, fine stone; chunky rounded cobbles with dark mortar |
| `granite`, `diorite`, `andesite` | Very noisy | Calmer; rename (see below) |
| `farmland` | Looks like tree bark | Ploughed furrows, a dry and a wet version |
| `glass` | Thin frame only | Glass with a soft highlight; also a framed **window** version |

### Items
| Asset | Problem now | What to make |
| --- | --- | --- |
| Stone tools (5) | Same grey as iron | Chunky knapped flint heads bound with cord |
| `wooden_sword` | Reads as a stick | Carved wooden blade with a cross guard |
| `lantern` (block and item) | Tiny in its tile | Fill the tile; a version hanging from a chain |

### Things that copy Minecraft (rename and redraw)
Proposed names. Change them freely, but decide before the art is made:

| Now | Proposal | Look |
| --- | --- | --- |
| redstone ore / dust | **cinnabar** | Blood-red crystals in veins; powers mechanisms |
| emerald ore / gem | **verdant jade** | Rounded green stone, cut into trade gems |
| lapis ore | **azurite** | Deep blue nodules; used for dyes and enchanting |
| diamond ore, gem, tools, armour | **skyglass** | Pale, sky-blue faceted glass |
| glowstone | **glowcap cluster** (mushroom) or **lumen rock** | Warm light source with its own shape |
| bedrock | **worldroot** | Black, root-like stone at the bottom of the world |
| obsidian | **ashglass** | Glassy black with ember-red cracks |
| deepslate | **gloomstone** | The deep rock layer, blue-violet |
| granite / diorite / andesite | **rust rock / chalk / greystone** | Calmer surface rocks |
| beacon | **Ember Shrine** (the end goal) | Fits the Ember story |
| sign / item frame | keep, restyle | Signs on posts as well as walls |

---

## P2 · Planned or half-built features

### Villages and traders (task 13.1)
- Building blocks: `thatch` (roof), `timber_frame` (plaster with beams, 3 patterns), `cobble_path`, `fence` and
  `fence_gate` (per wood), `well` (top and side), `hay_bale`, `market_awning` (3 colours), `shop_sign_*`
  (blacksmith, alchemist, general store, inn).
- Town props: `barrel`, `crate`, `sack`, `bench`, `lamp_post`, `notice_board`, `flower_box`.
- NPC portraits for the trade and dialogue screen, 64 × 64: `portrait_merchant`, `portrait_smith`,
  `portrait_alchemist`, `portrait_healer`, `portrait_guide`, `portrait_traveller`.
- NPC reference turnarounds for the same six.

### Biome monsters and harder nights (task 13.4)
- Reference turnarounds: Dune Stalker, Mire Hollow, Snow Prowler (exist as rigs; redesign as shape creatures).
- One more night monster per biome group (forest, mountain, coast).

### Journal rewards (task 13.5)
- Reward icons: `reward_map`, `reward_recipe_scroll`, `reward_torch_bundle`, `reward_chest`.
- Journal page art: a parchment page background and 21 small milestone badges.

### Ideas already on the list (task 14)
- **Potions:** `flask_empty`, and one flask per brew: healing, warmth, night sight, water breathing, swiftness.
  Also an `alchemy_table` block (top and side).
- **Dyes:** 12 dye icons; wool, glass and bed in each colour (colour can be tinted in code if the base is grey).
- **Cooking pot** block and food: `stew`, `berry_pie`, `bread`, `honey_bun`.
- **Beekeeping:** `beehive` block, `honeycomb`, `honey_jar`, `wax`, `candle` (block, lit and unlit).
- **Mechanisms:** `lever` (on and off), `button`, `pressure_plate`, `cinnabar_lamp` (on and off).
- **Rails:** `rail` (straight, curve, slope), `cart` icon and reference.
- **Lore:** `old_note`, `journal_book`, `ancient_tablet` items.
- **Tents:** `tent` block set and icon.
- **Map markers:** 8 pin icons (house, cave, shrine, skull, star, flag, trader, chest).

---

## P3 · Adventure RPG expansion

### Material and gear tiers
A clear ladder, each tier with ore overlay, raw chunk, bar, tool set, weapon set and armour set:

| Tier | Ore and bar | Notes |
| --- | --- | --- |
| 1 | **Copper** | Early tools, bright orange-brown |
| 2 | **Tin / bronze** | Bronze from copper and tin |
| 3 | **Iron** | Exists; redraw to match |
| 4 | **Silver** | Good against undead |
| 5 | **Gold** | Ornate, valuable |
| 6 | **Skyglass** | Found high on mountains |
| 7 | **Ember** | Exists as crystal; ember-forged gear glows |
| 8 | **Frost iron** | Frozen caverns |
| 9 | **Voidsteel** | Endgame, from the deepest layer |

Per tier: `<tier>_ore` overlay, `raw_<tier>`, `<tier>_bar`, pickaxe, axe, shovel, hoe, hammer, sword, spear, bow
or crossbow, helmet, chest, leggings, boots. Tool icons should share shapes across tiers, with materials changing
colour and trim.

### Weapons by style
- **Melee:** broadsword, rapier, spear, war hammer, flail, dagger, boomerang.
- **Ranged:** short bow, long bow, crossbow, sling, throwing knives. Ammo: wood, flint, iron, fire and frost
  arrows; bolts; sling stones.
- **Magic:** wand, staff, tome (fire, frost, lightning, nature, void), `mana_crystal`, `mana_potion`.
  Projectile sprites per element (bolt and impact, 4–6 frames each).
- **Summoning (optional):** a charm per tamed companion.

### Accessories (a new equipment row)
Icons for: `swift_boots`, `climbing_claws`, `cloud_charm` (double jump), `grappling_hook`, `lucky_coin`,
`depth_gauge`, `pocket_compass`, `warm_scarf`, `diving_mask`, `lantern_charm`, `thorn_ring`, `regen_band`,
`shield_amulet`, `feather_cape` (slow fall).

### Biomes with their own materials
Each needs ground, stone, a wood or plant, decorations, a light source, an ore, and ambient particles:
- **Ember Depths** (lava cavern layer): `ash_soil`, `magma_crust` (animated), `ember_crystal_cluster`,
  `cinder_vine`, `ash_drift` particles.
- **Frozen Caverns:** `packed_ice`, `frost_crystal`, `icicle` (hanging), `snow_brick`, `frost_iron_ore`.
- **Glowcap Hollows** (mushroom caves): `mycelium`, giant mushroom stem and cap (3 colours), `glow_spores` particles.
- **Mire / jungle:** `mud`, `mossy_stone`, `vines` (hanging), `mangrove` wood, `bog_lily`, `firefly` particles.
- **Crystal Grotto:** `geode_rock`, `crystal_cluster` (4 colours), `crystal_glass`.
- **Sky Islands:** `cloud_block`, `sunstone`, `sky_grass`, `wind_streak` particles.
- **Haunted Barrens:** `grave_soil`, `bone_block`, `dead_bush`, `wisp` particles.

### Dungeons, ruins and loot
- Dungeon bricks in 3 colours (blue, green, red), each plain, cracked and mossy; matching pillars and stairs.
- Props: `spike_trap`, `cobweb`, `chain` (hanging), `banner` (3 designs), `bookshelf`, `skull_pile`, `altar`,
  `statue` (3 poses), `brazier` (animated).
- **Breakable pots** (3 sizes and biome styles) that drop coins and supplies.
- Chests by rarity: wooden, iron-bound, gold, locked dungeon chest, one per biome; `key` icons to match.
- **Coins:** copper, silver, gold, platinum (replacing the single `trade_coin`).

### Bosses
For each: a reference turnaround, an arena block or two, a summoning item, a trophy block, a unique drop, and a
boss-bar portrait.
1. **Ember Warden** (exists): guards ancient vaults; redesign as a shape creature.
2. **Bramble King:** a walking thicket in old forests.
3. **Frost Matron:** in the Frozen Caverns.
4. **Dune Colossus:** a sand serpent under the desert.
5. **Mire Witch:** in the swamps; summons Mire Hollows.
6. **The Hollow Sun:** the final boss at the Ember Shrine.

### Crafting stations
Block faces for: `workbench`, `anvil`, `forge` (exists), `alchemy_table`, `loom`, `sawmill`, `cooking_pot`,
`arcane_altar` (enchanting), `tinker_bench` (accessories).

### Housing and furniture
Per wood type (oak, spruce, birch, jungle, mangrove): `table`, `chair`, `shelf`, `wardrobe`, `bed`, `door`
(3 designs), `window`. Plus `chandelier`, `candle`, `wall_torch`, `rug` (3 patterns), `painting` (6 small scenes).

### Interface
- Status: health heart (full, half, empty, golden bonus), mana star, armour shield, hunger and warmth icons redrawn
  to match.
- **Buff and debuff icons** (24 × 24): well fed, warm, cold, poisoned, burning, bleeding, swift, slow, night sight,
  regeneration, mana boost, cursed.
- **Rarity:** item-slot frames and text colours for common, uncommon, rare, epic and legendary.
- Boss health bar frame; damage-number font (digits 0–9, crit marker, heal +).
- Dialogue box and shop screen frames; quest and journal parchment; accessory slots; minimap frame and marker set.
- Title-screen logo and three loading-screen backgrounds (forest, caves, Ember Shrine).

### Effects
Hit sparks per element (physical, fire, frost, poison, lightning, void), heal sparkle, level-up or upgrade burst,
loot sparkle by rarity, death poof, footstep dust (grass, sand, snow), and boss intro flash. 6–8 frames each, 32 × 32.

---

## Not for Codex

- **Sound:** footsteps per material, block breaking, hits, creature voices, boss music and ambience (CC0 sources are
  listed in the earlier asset search).
- **Creature models and animation:** built in code from the reference turnarounds.
