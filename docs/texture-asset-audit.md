# Texture, image and animation audit

Reviewed 2026-11-04 against the current 0.6.4 working tree, including the local visual fixes. This is the production
checklist requested by the owner; it does not create artwork or implement new features.

Production update (0.6.6): the rework now covers base ground/rock/ore art, all tree species, foliage/crop stages/saplings,
all ordinary equipment and item icons, furniture/workshops, six station/fluid loops, door segmentation and frame
backing. Grass is vegetation on all six faces, as clarified by the owner. See the [pack README](../assets/woodland-ember/rework/README.md)
and its exact `coverage.json`. The lists below retain the remaining state, model, UI and illustration work;
milestone 19 in `tasks.md` records completion separately from these original briefs.

Depth/detail update (0.6.7): the owner asked for larger readable forms and restrained painted depth, with the old
defined grass blades as the reference. The [depth review](texture-depth-review.md) records 58 material repaints,
retained successful surfaces, a native-pixel grass comparison and the standard for subsequent art.

## Baseline inventory when audited (0.6.4)

The task file is `docs/tasks.md`. Its opening “Where the game stands” paragraph describes the old starting point;
completed milestones and current code are the source of truth. The older Pixel Aero document is a design proposal,
including the obsolete 0.3 m world size, and does not describe the current responsive UI implementation.

| Coverage | Current inventory |
| --- | --- |
| Registry | 165 types including air; 355 states; 164 visible types; 62 inventory-only item types |
| Shared terrain/item texture array | 297 named layers; **zero missing texture providers** |
| Original art | 146 authored tiles, plus ten generated breaking stages |
| Expansion library | 336 source assets: trees 64, original creature skins 48, material alternatives 48, effects 64, UI 64, hands/saplings 16, future content 32 |
| Current mob refinement | 60 skins covering all 20 species, plus four shared accessory materials |
| Tree export | 68 tiles: bark/end for 15 wood types, leaves/planks for 14 living types, two cactus faces and eight saplings |
| Workshop block faces | Six dedicated trading-post / forge faces, in addition to the expansion library |
| Existing animated artwork | Eight sequences × eight frames: water, lava, fire, smoke, sparks, splash, lightning, impact |
| Derived geometry | 27 slab types and five stair types reuse parent materials |

These counts overlap: old and refined skins are alternative versions, source images are also exported as PNG/JSON,
and many block states share one tile. They are not a count of distinct new images to create.

The main work is **better material design, missing action/state artwork, and integration of existing art**. No
registered block currently renders without texture data. An image can exist in the library without being displayed.

## Priority and status

- **P1:** most visible during normal play, or misleading about the item/action being shown.
- **P2:** stronger visual identity and variety after the first batch.
- **P3:** optional polish or dependent on unimplemented gameplay.
- **Rework:** artwork exists and should be improved. **New:** a specific missing visual state/surface/image.
- **Integrate:** source art already exists; connect it before commissioning replacements.
- **Render:** geometry, UVs, shader or state selection must change too; a new PNG alone will not fix it.

## A. World textures

| Task | Priority | Status | Exact scope and reason |
| --- | --- | --- | --- |
| A1 Ground and grass | P1 | Base rework done in 0.6.6 | `grass_top`, `grass_side`, `dirt`, `farmland`, `sand`, `gravel`, `clay`, `snow` and their existing alternatives. Grass must be vegetation on every face, including underside; dirt is a separate block. Farmland needs legible furrows. |
| A2 Common rock and construction | P1 | Base rework done | `stone`, `cobblestone`, `brick`, `granite`, `diorite`, `andesite`, `sandstone`, `limestone`, `slate`, `basalt`, `deepslate`, `obsidian`, `bedrock`. Differentiate solid rock, loose stones and masonry at play distance; align strata/mortar across tile edges. |
| A3 Existing material variants | P1 | Done | Four alternatives each for stone, dirt, grass top, grass side, sand, gravel, snow, cobblestone, basalt, slate, deepslate and generic planks: 48 tiles. Make these one coherent set rather than unrelated contrast/pattern changes. These alternatives can replace the base appearance in the shader. |
| A4 Ores and luminous blocks | P1 | Base rework done | Coal, iron, gold, diamond, lapis and ember ores; glowstone. Preserve recognisable mineral silhouettes while matching the surrounding rock. Keep redstone/emerald source art compatible, but do not prioritise them: they are registered legacy ores and no longer generated. Emission masks are a renderer-dependent option for ember/glowstone. |
| A5 Water, lava, ice and glass | P1 | Base/loops done; flow/foam open | Improve water/lava loops and their seams; clearer water surface versus depth; readable ice cracks and restrained glass edges. Add directional flow, falling-fluid faces and edge foam only with the required UV/face selection. Current flowing states share the still-fluid art. |
| A6 Trees and wood | P1 | Base rework done | Oak, maple, spruce, fir, larch, birch, pine, jungle giant, palm, baobab, acacia, willow, mangrove and bush: bark, cut end, leaves and planks. Dead snag: bark/end; saguaro: side/top. Preserve existing species distinctions and improve bark scale, cut rings, leaf negative space and plank seams. All of these already have artwork. |
| A7 Plants, crops and ground cover | P1 | Base rework done | Tall grass, fern, poppy, dandelion, red/brown mushrooms, reed, lily pad, moss and leaf litter. Wheat, carrots and potatoes each have four growth tiles. Eight saplings: oak, birch, spruce, maple, pine, acacia, jungle giant, palm. Improve silhouettes, cutout edges, ground contact and crop-stage readability. Wind sway already exists; separate full animation sheets are not required for every plant. |
| A8 Seasonal / climate variants | P2 | New + Render | Selective autumn/bare/snow-dusted foliage and dry/wet ground, where stronger visual variety is wanted. Colour tinting already supplies seasons; preserve evergreen species rather than treating every tree as deciduous. No need to generate every season for every species immediately. |
| A9 Structures and weathering | P2 | New + Render | Weathered timber, worn masonry, moss/cracks, rusty metal, mine supports, shrine/vault trim and camp details. Ruins, watchtowers, camps, mines, vaults and shrines currently reuse ordinary registered blocks. Extra material variants/decals need placement support; villages do not require an entirely new building texture pack. |
| A10 Slabs and stairs | P1 | Existing materials integrated | Reuse the improved parent materials for all 27 slabs and five stairs. Fix grain direction, cut surfaces and edge consistency. Species-specific full planks already exist; species-specific plank stairs/slabs require variant/registry work, not fourteen newly painted plank sets. |

## B. Furniture, stations and equipment surfaces

| Task | Priority | Status | Exact scope and reason |
| --- | --- | --- | --- |
| B1 Furniture faces | P1 | Done in 0.6.6 | Matching chest/ancient-chest, workbench, furnace, bed, campfire and light surfaces. Doors use four continuous segments across chunk boundaries. Beds select oriented pillow/head artwork. Torch/lantern world UVs fit their geometry; inventory uses separately fitted icons. |
| B2 Trading post and forge | P1 | Faces/loop done | `post_top`, `post_side`, `post_front`, `forge_top`, `forge_side`, `forge_front`. Improve front-facing readability and material joins. Keep a clear visual distinction between the crafting table, trading post, furnace and ember forge. |
| B3 Signs and frames | P2 | Base faces/backing done | New sign board, frame border and linen backing are active. Player lettering remains generated. Additional wood variants are optional. |
| B4 Boat | P2 | New + Render | Hull sides, inner floor, rim and optional oar material. The actual boat currently uses generic planks on five boxes, despite having a dedicated inventory icon. A new inventory image will not change that hull. Persistent/unoccupied boats remain a separate gameplay task. |
| B5 Equipment upgrade appearance | P1 | New + Render | Preserve base material/tier while indicating upgrade levels 1–3 across all 20 tools/weapons and 12 armour pieces. Current upgraded pickaxes all share `ember_pickaxe`; upgraded chestplates share `ember_chestplate`; other equipment keeps its base icon plus UI marking. Prefer reusable rune/level overlays before commissioning 96 full replacement icons. |

## C. Inventory images and first-person assets

| Task | Priority | Status | Exact scope and reason |
| --- | --- | --- | --- |
| C1 Tool/weapon icons | P1 | Done | Pickaxe, axe, shovel, sword and hoe in wooden, stone, iron and diamond tiers: 20 icons. Stone/iron need unmistakably different silhouettes/material treatment at 24–32 px. Also review bow, arrow and fishing rod. |
| C2 Armour icons | P2 | Done | Helmet, chestplate, leggings and boots for leather, iron and diamond: 12 icons. Match edge weight, scale and material highlights. These are inventory images; a third-person armour UV set is not required until a player/equipment model exists. |
| C3 Resources, food and containers | P2 | Done in 0.6.6 | Ordinary materials, food, buckets, boat, compass/map and trade coin are replaced. Wheat/carrot/potato have dedicated harvested icons selected independently of world growth stages. |
| C4 Block inventory presentation | P2 | New or Render | Many blocks show one flat material face in slots. Choose a consistent rendered-block thumbnail approach or authored isometric icons; do not hand-author one for every saved facing/state. Include stations, stairs, slabs, doors, beds, signs and frames in that decision. |
| C5 Hand and held-item poses | P1 | Integrate + New + Render | Bare/leather/iron/diamond idle, swing and use hand art already exists: 12 sprites. When an item is held, the game shows its inventory image instead of a hand gripping it. Add a proper held-item composition or rig, with mining/chopping, sword attack, bow drawing/release, rod casting/reeling, eating, bucket use and block placement. Reuse existing hand art where suitable. |
| C6 Projectiles and dropped items | P1 | Render, then targeted New | Arrows/bolts, debris and dropped food/tools currently use the small spinning cube renderer. Give arrows a shaft/fletching and non-block items an appropriate silhouette. Reuse the existing item/block artwork first; then author projectile side/fletching or particle masks if the chosen geometry needs them. |

## D. Mobs and NPCs

All twenty already have refined body/face/leg skins and animated 3D rigs. Their walk cycles, hops, idle motion,
attacks and resting poses are **rig animation**, not missing sprite sheets. Keep the existing 60 skins and four
accessory materials as the starting point.

| Species | Priority | Targeted texture/image work |
| --- | --- | --- |
| Deer | P2 | Head sides/back, underside and hoof consistency; preserve the existing spots and branched antlers. |
| Rabbit | P2 | Head/ear interior continuity, belly and paw detail; hopping already works. |
| Boar | P2 | Snout surface, bristle direction, underside and hoof detail; tusks already have bone material. |
| Wolf | P2 | Muzzle/head sides, chest/belly, paws and tail transitions. |
| Bear | P2 | Muzzle, pads/claws and shoulder/underside colour separation. |
| Fox | P2 | Head sides, dark ear interiors/stockings and a clean white tail-tip transition. |
| Sheep | P2 | Coherent wool scale, dark face/head sides and legs. Sheared variants wait for a shearing mechanic. |
| Cow | P2 | Patches that continue across faces, muzzle and hoof detail. |
| Mountain goat | P2 | Head sides, shaggy underside/beard material and hoof detail. |
| Camel | P2 | Neck/hump continuity, muzzle and broad feet. |
| Fish | P2 | Head side eye/gill artwork and fin/tail regions instead of relying on the same generic surface everywhere. |
| Zombie | P1 | Separate skin for head sides/back and exposed hands from the ragged tunic material. |
| Skulker | P1 | Distinguish hood, mask, exposed bone/hands and cloth surfaces; bow/accessory materials already exist. |
| Cave crawler | P2 | Chitin plates, limb joints, underside and multi-eye face states. |
| Frost brute | P2 | Distinct ice/stone planes and spike surfaces; optional crack/eye emission masks. |
| Ember Warden | P1 | Plate/core separation, eyes/crack emission masks and readable attack/defeat cues; the current core already has minimum dark-scene brightness. |
| Dune Stalker | P2 | Shell plate edges, underside, stinger material and amber-eye masks. |
| Mire Hollow | P2 | Bark/root/moss separation, branch surfaces and eye masks. |
| Snow Prowler | P2 | Feline head/cheek artwork, paw pads, spot continuity and saber/ear differentiation. |
| Traveling Trader | P1 | Proper skin/hair on head sides and hands; a portrait matching the current bearded trader with teal clothing/hat. The active trading portrait still uses the older hooded `map_trader` illustration. |

Cross-species tasks:

- [ ] **P1 / Render:** allow head sides/back and exposed hands to use appropriate materials. The current head shader
  deliberately uses the body texture on every head face except the front. More detailed front faces alone cannot fix it.
- [ ] **P2 / New + Render:** closed-eye/blink/rest faces and selected alert/open-mouth/attack faces. Reuse a closed-eye
  face for blink/rest where appropriate; add only states actually selected by gameplay.
- [ ] **P2 / New + Render:** optional eye/core emission masks for hostile creatures, with controlled brightness.
- [ ] **P3 / Rework:** rare coat/skin variations or young-animal-specific markings after core materials are consistent.
- [ ] **P3 / Gameplay dependency:** complete new NPC role skins/rigs only when farmer, smith, herbalist and other roles
  are implemented. Their existing portraits are listed below; they do not establish playable NPC support.

## E. Animated texture / effect checklist

Frame counts below are proposed production briefs, not a promise that the existing renderer can consume them.
The array selects eight frames per sequence. Water/lava run at 4 fps; furnace, forge, torch and lantern use the
6–8 fps bindings in the rework manifest. The effect renderer still uses eight frames with its existing lifetime
timing. The older expansion `animations.json` is not the runtime timing source.

| Sequence | Priority | Current state | Needed artwork / integration |
| --- | --- | --- | --- |
| Still water | P1 | Replaced: eight active frames at 4 fps | Coherent phase loop with matched repeat borders. Directional flow remains separate. |
| Flowing / falling water | P1 | Uses the still-water sequence | Directional flow and waterfall-side sequence, about eight frames each; orient by flow/face. |
| Water-edge foam / ripples | P1 | Generic splash exists, no dedicated edge foam | Foam-edge/ripple sequence, about eight frames; requires boundary/contact detection. |
| Still lava | P1 | Replaced: eight active frames at 4 fps | Slow coherent crust/magma movement with stable brightness. Optional emission control remains. |
| Flowing / falling lava | P2 | Uses the still-lava sequence | Separate directional/falling sequence, about eight frames each, if distinguishable flow is desired. |
| Furnace fire face | P1 | Done: eight frames at 8 fps | Flame frames animate within a fixed opening; surrounding masonry stays unchanged. |
| Ember forge core | P1 | Done: eight frames at 6 fps | Flame/heat frames animate within a fixed opening and metal/stone frame. |
| Torch and lantern | P1 | Done: eight frames each, 8/6 fps | Flame/glow regions animate; shaft/frame pixels stay fixed. World and inventory UV contracts are separate. |
| Campfire flame / embers | P2 | Existing eight-frame fire sprite is active | Refine the current sequence, ember bed and ground contact; no need for a second generic fire sheet unless its silhouette differs. |
| Smoke | P2 | Eight frames active | Improve silhouette, soft alpha edges and dissipation; align runtime loop/lifetime with the intended sequence. |
| Sparks | P2 | Eight frames active | Refine shape and emission timing; optionally distinct forge versus hit sparks. |
| Splash | P2 | Eight frames active on water-entry changes | Refine contact/ring shape; add swimming/boat wakes and landing ripples only with new triggers. |
| Lightning | P2 | Eight frames active for strikes | Refine branching/impact silhouette; weather flash is already procedural and should remain synchronised. |
| Mining / impact | P2 | Eight generic impact frames plus block-textured debris | Optional stone dust, dirt puff, wood chips, leaf fragments and metal-hit sparks; use actual material selection. |
| Lit beacon | P1 | Same surface artwork as unlit beacon, with more light | Activation burst and a restrained active core/beam loop, around 8–16 frames; beam geometry/shader is also needed. |
| Mob faces / eye glow | P2 | One static front face per species | Small state atlas or alternate tiles for blink/rest/alert/attack; preserve existing rig animation. |
| Bow / fishing / eating / bucket / tool use | P1 | Static item icon with a CSS swing | State-based held artwork or rigged motion. Start with three bow draw stages and release, rod cast/reel and hand/item alignment. These are action states, not endless loops. |
| Burning / damage / temperature feedback | P2 | CSS burn gradient and hurt flash; mob fire sprites exist | Optional edge-flame, frost or heat-distortion masks. Damage/cold/heat should stay readable and respect reduced-motion preferences. |
| UI loading / save / success | P3 | Text and CSS feedback | Optional short loading/save/glint sequences; reuse existing save/notice icons first. No permanent idle pulsing. |

## F. UI, illustration, sky and branding

| Task | Priority | Status | Needed assets |
| --- | --- | --- | --- |
| F1 Missing themed indicators | P1 | Integrate + targeted New | Replace furnace-fire and thermometer emoji with pack-matching sprites; use existing cold/heat/durability/armour glyphs where applicable. These are actual missing UI integration points, not a need for a whole new HUD atlas. |
| F2 Component states | P1 | Integrate | Existing disabled/pressed/focus/close/back/confirm button art; disabled/equipment/crafting/output slots; contrast, journal, pause and warning panels. Normal/hover/selected states already work. Reuse before repainting. |
| F3 Interaction and controls | P1 | Integrate | Existing interact/place/forbidden/notice and left/right mouse prompts, controller face buttons/bumpers/d-pad/menu glyphs. Current reticle displays idle/target only; gamepad navigation already works without these glyphs. |
| F4 Navigation and journal | P2 | Integrate + New | Use existing inventory/recipes/settings/worlds/save/map/compass/journal icons and eight journal illustrations. Fill gaps for the 21 milestones: wood, table, stone tools, night, cooked meal, iron tools, armour, bow, -50 m, -150 m, five biomes, surface structure, mine, vault, diamond, shrine, ember, Warden, 25 kills, week, beacon. Reuse close matches before commissioning missing subjects. |
| F5 Compass and map UI | P2 | Integrate + targeted New | Existing compass/map navigation glyphs; a themed compass rose/needle, map border and optional map-marker symbols. Map terrain and player position remain generated from the explored world, not painted as a fixed map. User map pins are still a gameplay idea. |
| F6 Title, loading, death and ending | P2 | New | Logo/wordmark using the current game name, one responsive title/background illustration, small loading artwork, death/respawn illustration and a beacon-ending illustration. World-selection thumbnails should be captured from actual worlds rather than individually painted. Current title is text over a CSS background. |
| F7 Install/store/share images | P2 | New | Replace or refine the generic grass-cube SVG identity; export favicon plus 192/512 px standard/maskable app icons and a 1200×630 share/cover image. The existing manifest only references `icon.svg`; add actual uses when exporting new sizes. |
| F8 Sky and weather art | P2–P3 | Optional New + Render | Authored sun disc/halo, a moon surface compatible with phase masks, optional small star glints, cloud density/alpha masks, rain/sleet/snowflake sprites. Sky gradients, cloud drift, moon phases, stars and precipitation already work procedurally; none is a missing mandatory PNG. Preserve dynamic weather instead of substituting a static sky screenshot. |

## G. Existing art to integrate before making more

The 64 UI images include twelve directly displayed assets: panel_navy, panel_toast, slot_normal, slot_hover,
slot_selected, button_normal, button_hover, status_vitality, status_hunger, status_breath, prompt_idle and
prompt_target. `panel_tooltip` is registered as a CSS token but the UI currently relies on native title tooltips.
Other UI files are imported into the asset library without corresponding displayed component states.

- [ ] Panels: `panel_glass`, `panel_contrast`, `panel_tooltip`, `panel_journal`, `panel_pause`, `panel_warning`.
- [ ] Slots: `slot_disabled`, `slot_pressed`, `slot_equipment`, `slot_crafting`, `slot_output`.
- [ ] Buttons: `button_pressed`, `button_disabled`, `button_focus`, `button_close`, `button_back`, `button_confirm`.
- [ ] Status: `status_energy`, `status_armour`, `status_cold`, `status_heat`, `status_durability`. Energy requires a real
  mechanic; do not invent stamina simply to use an icon.
- [ ] Navigation: `nav_journal`, `nav_settings`, `nav_worlds`, `nav_save`, `nav_inventory`, `nav_recipes`, `nav_map`, `nav_compass`.
- [ ] Controller: `pad_south`, `pad_east`, `pad_west`, `pad_north`, `pad_lb`, `pad_rb`, `pad_dpad`, `pad_menu`.
- [ ] Journal: `journal_tree`, `journal_sunrise`, `journal_cave`, `journal_campfire`, `journal_iron`, `journal_diamond`, `journal_ember`, `journal_beacon`.
- [ ] Prompts: `prompt_interact`, `prompt_place`, `prompt_forbidden`, `prompt_notice`, `prompt_mouse_left`, `prompt_mouse_right`.
- [ ] NPC portraits: `farmer_woman`, `farmer_man`, `blacksmith`, `wool_trader`, `seed_trader`, `herbalist`, `prospector`
  already exist. The active `map_trader` portrait needs identity review, not an assumption that no portrait exists.
- [ ] Future illustrations: `frame_backing`, `forge_hammer`, `forge_tongs`, `seed_sack`, `shrine_map`, `rare_dye`,
  `village_sign`, `lore_book`. Some are runtime-exported or retained as library images but lack the corresponding
  displayed content. Village/NPC professions, lore, dye and related gameplay remain separate decisions.
- [ ] Existing twelve hand pose images should be assessed with the held-item renderer before replacing them.

## H. Future-feature art, only after the feature is selected

The task list also proposes villages/professions, tame wolves, rideable horses/camels, brewing, dyeing, cooking pots,
beekeeping, mechanisms, rails/carts, lore, tents and expanded deep regions. These would need role-specific NPC skins,
saddle/harness textures, bottles/potion contents, colour palettes, cookware/food icons, hive/honey/wax images,
lever/button/plate faces, rail/cart materials, book/note illustrations, tent fabric and new deep-region materials.
They are **not missing artwork for implemented items**. Existing portraits, dye/book/seed-sack art and ordinary village
building materials should be reused first. Spreading-fire gameplay can initially reuse the active fire sequence;
ash/charred-material states would be additional gameplay/material choices.

## Production order and acceptance

1. **Validate the visual target:** all-face grass and separate dirt, stone versus gravel/cobblestone, one
   stone/iron tool pair, one held bow pose, one furnace loop. Judge them in the real game at 24–32 px icon size and
   normal terrain distance, not only on a large source sheet.
2. **World/core materials:** A1–A7 and coherent alternatives, preserving names and seamless repeated surfaces.
3. **Active machinery and water:** B1–B2 and the P1 sequences in E, with orientation/frame-selection integration.
4. **Items, hands and mob details:** C1/C5/C6, tier-preserving upgrades, humanoid exposed surfaces and matching trader portrait.
5. **Use the existing UI library:** F1–F4/G before commissioning duplicate panels, controller icons or portraits.
6. **Secondary scenery, sky and marketing:** A8–A9, B3–B4, F5–F8, followed by chosen future features.

Keep 32×32 world/item tiles, 32×32 skin regions and current 64×64 hand/UI source sprites as the baseline. Larger
source images should be deliberately reduced and reviewed, not automatically treated as higher-quality game art.
Require exact named manifests/crops, shared palettes and scale, appropriate alpha, transparent item backgrounds,
seamless repeat and animation edges, coherent first/last frames, stable brightness and readable light/dark states.
Emissive/glass/moving-water effects require shader support; joint/model/UV problems require rendering work.
Preserve old save names. Rebuild with existing packers, check coverage, and verify art/animation in the browser before
calling a batch integrated. Use the normal check/benchmark/smoke gates for actual implementation batches.

## Evidence and scope

Registry coverage was checked from the live exported `BLOCKS` and `TILE_NAMES` tables with the current artwork
provider. Source/preview sheets and existing game captures were inspected. Key files: `src/engine/blocks.ts`,
`src/render/{tilePixels,woodlandArt,textureVariants,creatureArt,creatureMeshes,mobModels,worldEffects,dropMeshes,boatMesh,
sky,clouds,precipitation}.ts`, `src/ui/{app,artAssets,icons,minimap}.ts[x]`, `src/main.ts`, `index.html`,
`public/{icon.svg,manifest.webmanifest}` and all three artwork manifests/README files. No runtime/gameplay files or
image files were changed for this audit. The exact registered visual coverage catalogue follows.

## Complete registered visual catalogue
This appendix accounts for all **164 visible registered types**, including existing art that should be kept or reused.
It is coverage, not an instruction to repaint every row. Variants include facings, growth and species states; they
are not automatically separate illustration requests.

### Terrain, geology, ores and fluids (35)
| In-game subject / key | States | Existing artwork reference |
| --- | ---: | --- |
| Stone (`stone`) | 1 | `stone` |
| Dirt (`dirt`) | 1 | `dirt` |
| Farmland (`farmland`) | 1 | `farmland`, `dirt` |
| Grass (`grass`) | 1 | `grass_top`, `grass_side`, `dirt` |
| Sand (`sand`) | 1 | `sand` |
| Gravel (`gravel`) | 1 | `gravel` |
| Clay (`clay`) | 1 | `clay` |
| Water (`water`) | 1 | `water` |
| Flowing water (`flowing_water`) | 16 | `water` |
| Lava (`lava`) | 1 | `lava` |
| Flowing lava (`flowing_lava`) | 16 | `lava` |
| Ice (`ice`) | 1 | `ice` |
| Glass (`glass`) | 1 | `glass` |
| Bedrock (`bedrock`) | 1 | `bedrock` |
| Cobblestone (`cobblestone`) | 1 | `cobblestone` |
| Brick (`brick`) | 1 | `brick` |
| Glowstone (`glowstone`) | 1 | `glowstone` |
| Granite (`granite`) | 1 | `granite` |
| Diorite (`diorite`) | 1 | `diorite` |
| Andesite (`andesite`) | 1 | `andesite` |
| Sandstone (`sandstone`) | 1 | `sandstone` |
| Limestone (`limestone`) | 1 | `limestone` |
| Slate (`slate`) | 1 | `slate` |
| Basalt (`basalt`) | 1 | `basalt` |
| Deepslate (`deepslate`) | 1 | `deepslate` |
| Obsidian (`obsidian`) | 1 | `obsidian` |
| Coal ore (`coal_ore`) | 1 | `coal_ore` |
| Iron ore (`iron_ore`) | 1 | `iron_ore` |
| Gold ore (`gold_ore`) | 1 | `gold_ore` |
| Redstone ore (`redstone_ore`) | 1 | `redstone_ore` |
| Diamond ore (`diamond_ore`) | 1 | `diamond_ore` |
| Emerald ore (`emerald_ore`) | 1 | `emerald_ore` |
| Lapis ore (`lapis_ore`) | 1 | `lapis_ore` |
| Ember ore (`ember_ore`) | 1 | `ember_ore` |
| Snow (`snow`) | 8 | `snow` |

### Trees, foliage and natural cutouts (14)
| In-game subject / key | States | Existing artwork reference |
| --- | ---: | --- |
| Log (`log`) | 15 | 15 species × bark/end; legacy log top/side |
| Leaves (`leaves`) | 28 | 14 species leaf tiles; natural/placed state pairs |
| Planks (`planks`) | 14 | 14 species plank tiles; generic plank fallback |
| Cactus (`cactus`) | 1 | `saguaro_top`, `saguaro_side` |
| Tall grass (`tall_grass`) | 1 | `tall_grass` |
| Fern (`fern`) | 1 | `fern` |
| Poppy (`poppy`) | 1 | `poppy` |
| Dandelion (`dandelion`) | 1 | `dandelion` |
| Brown mushroom (`brown_mushroom`) | 1 | `brown_mushroom` |
| Red mushroom (`red_mushroom`) | 1 | `red_mushroom` |
| Reed (`reed`) | 1 | `reed` |
| Lily pad (`lily_pad`) | 1 | `lily_pad` |
| Moss (`moss`) | 1 | `moss` |
| Leaf litter (`leaf_litter`) | 1 | `leaf_litter` |

### Slabs — reuse their parent material (27)
| In-game subject / key | States | Existing artwork reference |
| --- | ---: | --- |
| Stone slab (`stone_slab`) | 2 | Parent `stone` faces |
| Dirt slab (`dirt_slab`) | 2 | Parent `dirt` faces |
| Farmland slab (`farmland_slab`) | 2 | Parent `farmland` faces |
| Grass slab (`grass_slab`) | 2 | Parent `grass` faces |
| Clay slab (`clay_slab`) | 2 | Parent `clay` faces |
| Log slab (`log_slab`) | 2 | Parent `log` faces |
| Planks slab (`planks_slab`) | 2 | Parent `planks` faces |
| Cobblestone slab (`cobblestone_slab`) | 2 | Parent `cobblestone` faces |
| Brick slab (`brick_slab`) | 2 | Parent `brick` faces |
| Granite slab (`granite_slab`) | 2 | Parent `granite` faces |
| Diorite slab (`diorite_slab`) | 2 | Parent `diorite` faces |
| Andesite slab (`andesite_slab`) | 2 | Parent `andesite` faces |
| Sandstone slab (`sandstone_slab`) | 2 | Parent `sandstone` faces |
| Limestone slab (`limestone_slab`) | 2 | Parent `limestone` faces |
| Slate slab (`slate_slab`) | 2 | Parent `slate` faces |
| Basalt slab (`basalt_slab`) | 2 | Parent `basalt` faces |
| Deepslate slab (`deepslate_slab`) | 2 | Parent `deepslate` faces |
| Obsidian slab (`obsidian_slab`) | 2 | Parent `obsidian` faces |
| Coal ore slab (`coal_ore_slab`) | 2 | Parent `coal_ore` faces |
| Iron ore slab (`iron_ore_slab`) | 2 | Parent `iron_ore` faces |
| Gold ore slab (`gold_ore_slab`) | 2 | Parent `gold_ore` faces |
| Redstone ore slab (`redstone_ore_slab`) | 2 | Parent `redstone_ore` faces |
| Diamond ore slab (`diamond_ore_slab`) | 2 | Parent `diamond_ore` faces |
| Emerald ore slab (`emerald_ore_slab`) | 2 | Parent `emerald_ore` faces |
| Lapis ore slab (`lapis_ore_slab`) | 2 | Parent `lapis_ore` faces |
| Cactus slab (`cactus_slab`) | 2 | Parent `cactus` faces |
| Snow slab (`snow_slab`) | 2 | Parent `snow` faces |

### Furniture, stations, lighting and decorations (17)
| In-game subject / key | States | Existing artwork reference |
| --- | ---: | --- |
| Torch (`torch`) | 1 | `torch` |
| Chest (`chest`) | 4 | `chest_top`, `chest_side`, `chest_front` |
| Ancient chest (`ancient_chest`) | 4 | `ancient_chest_top`, `ancient_chest_side`, `ancient_chest_front` |
| Crafting table (`crafting_table`) | 1 | `crafting_table_top`, `crafting_table_side`, `planks` |
| Furnace (`furnace`) | 4 | `furnace_top`, `furnace_side`, `furnace_front` |
| Lit furnace (`lit_furnace`) | 4 | `furnace_top`, `furnace_side`, `furnace_front_lit` |
| Door (`door`) | 8 | `door` |
| Bed (`bed`) | 8 | `bed_top`, `bed_side`, `planks` |
| Campfire (`campfire`) | 1 | `campfire_top`, `campfire_side` |
| Ladder (`ladder`) | 4 | `ladder` |
| Trading Post (`trading_post`) | 4 | `post_top`, `post_side`, `planks`, `post_front` |
| Ember Forge (`ember_forge`) | 4 | `forge_top`, `forge_side`, `obsidian`, `forge_front` |
| Sign (`sign`) | 4 | `sign` |
| Item Frame (`item_frame`) | 4 | `frame_empty` |
| Beacon (`beacon`) | 1 | `beacon_top`, `beacon_side`, `obsidian` |
| Lit beacon (`lit_beacon`) | 1 | `beacon_top`, `beacon_side`, `obsidian` |
| Lantern (`lantern`) | 1 | `lantern` |

### Stairs — reuse their parent material (5)
| In-game subject / key | States | Existing artwork reference |
| --- | ---: | --- |
| Planks stairs (`planks_stairs`) | 4 | `planks` |
| Cobblestone stairs (`cobblestone_stairs`) | 4 | `cobblestone` |
| Stone stairs (`stone_stairs`) | 4 | `stone` |
| Brick stairs (`brick_stairs`) | 4 | `brick` |
| Sandstone stairs (`sandstone_stairs`) | 4 | `sandstone` |

### Crops and saplings (4)
| In-game subject / key | States | Existing artwork reference |
| --- | ---: | --- |
| Wheat (`wheat`) | 4 | `wheat_0`, `wheat_1`, `wheat_2`, `wheat_3` |
| Carrots (`carrots`) | 4 | `carrots_0`, `carrots_1`, `carrots_2`, `carrots_3` |
| Potatoes (`potatoes`) | 4 | `potatoes_0`, `potatoes_1`, `potatoes_2`, `potatoes_3` |
| Sapling (`sapling`) | 8 | Eight named species sapling tiles |

### Other inventory-only items (30)
| In-game subject / key | States | Existing artwork reference |
| --- | ---: | --- |
| Trade Coin (`trade_coin`) | 1 | `trade_coin` |
| Stick (`stick`) | 1 | `stick` |
| Coal (`coal`) | 1 | `coal` |
| Iron ingot (`iron_ingot`) | 1 | `iron_ingot` |
| Gold ingot (`gold_ingot`) | 1 | `gold_ingot` |
| Diamond (`diamond`) | 1 | `diamond` |
| Lapis (`lapis`) | 1 | `lapis` |
| Ember crystal (`ember_crystal`) | 1 | `ember_crystal` |
| Beacon shard (`beacon_shard`) | 1 | `beacon_shard` |
| Leather (`leather`) | 1 | `leather` |
| Feather (`feather`) | 1 | `feather` |
| Wool (`wool`) | 1 | `wool` |
| Raw fish (`raw_fish`) | 1 | `raw_fish` |
| Cooked fish (`cooked_fish`) | 1 | `cooked_fish` |
| Fishing rod (`fishing_rod`) | 1 | `fishing_rod` |
| Boat (`boat`) | 1 | `boat` |
| String (`string`) | 1 | `string` |
| Bone (`bone`) | 1 | `bone` |
| Bone meal (`bone_meal`) | 1 | `bone_meal` |
| Arrow (`arrow`) | 1 | `arrow` |
| Bow (`bow`) | 1 | `bow` |
| Paper (`paper`) | 1 | `paper` |
| Compass (`compass`) | 1 | `compass` |
| Map (`map`) | 1 | `map` |
| Bucket (`bucket`) | 1 | `bucket` |
| Water bucket (`water_bucket`) | 1 | `water_bucket` |
| Lava bucket (`lava_bucket`) | 1 | `lava_bucket` |
| Baked potato (`baked_potato`) | 1 | `baked_potato` |
| Raw meat (`raw_meat`) | 1 | `raw_meat` |
| Cooked meat (`cooked_meat`) | 1 | `cooked_meat` |

### Armour icons by material (12)
| In-game subject / key | States | Existing artwork reference |
| --- | ---: | --- |
| Leather helmet (`leather_helmet`) | 1 | `leather_helmet` |
| Leather chestplate (`leather_chestplate`) | 1 | `leather_chestplate` |
| Leather leggings (`leather_leggings`) | 1 | `leather_leggings` |
| Leather boots (`leather_boots`) | 1 | `leather_boots` |
| Iron helmet (`iron_helmet`) | 1 | `iron_helmet` |
| Iron chestplate (`iron_chestplate`) | 1 | `iron_chestplate` |
| Iron leggings (`iron_leggings`) | 1 | `iron_leggings` |
| Iron boots (`iron_boots`) | 1 | `iron_boots` |
| Diamond helmet (`diamond_helmet`) | 1 | `diamond_helmet` |
| Diamond chestplate (`diamond_chestplate`) | 1 | `diamond_chestplate` |
| Diamond leggings (`diamond_leggings`) | 1 | `diamond_leggings` |
| Diamond boots (`diamond_boots`) | 1 | `diamond_boots` |

### Tools and weapons by tier (20)
| In-game subject / key | States | Existing artwork reference |
| --- | ---: | --- |
| Wooden pickaxe (`wooden_pickaxe`) | 1 | `wooden_pickaxe` |
| Wooden axe (`wooden_axe`) | 1 | `wooden_axe` |
| Wooden shovel (`wooden_shovel`) | 1 | `wooden_shovel` |
| Wooden sword (`wooden_sword`) | 1 | `wooden_sword` |
| Wooden hoe (`wooden_hoe`) | 1 | `wooden_hoe` |
| Stone pickaxe (`stone_pickaxe`) | 1 | `stone_pickaxe` |
| Stone axe (`stone_axe`) | 1 | `stone_axe` |
| Stone shovel (`stone_shovel`) | 1 | `stone_shovel` |
| Stone sword (`stone_sword`) | 1 | `stone_sword` |
| Stone hoe (`stone_hoe`) | 1 | `stone_hoe` |
| Iron pickaxe (`iron_pickaxe`) | 1 | `iron_pickaxe` |
| Iron axe (`iron_axe`) | 1 | `iron_axe` |
| Iron shovel (`iron_shovel`) | 1 | `iron_shovel` |
| Iron sword (`iron_sword`) | 1 | `iron_sword` |
| Iron hoe (`iron_hoe`) | 1 | `iron_hoe` |
| Diamond pickaxe (`diamond_pickaxe`) | 1 | `diamond_pickaxe` |
| Diamond axe (`diamond_axe`) | 1 | `diamond_axe` |
| Diamond shovel (`diamond_shovel`) | 1 | `diamond_shovel` |
| Diamond sword (`diamond_sword`) | 1 | `diamond_sword` |
| Diamond hoe (`diamond_hoe`) | 1 | `diamond_hoe` |
