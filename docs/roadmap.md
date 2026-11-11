# Roadmap after 0.7.0

Written 2026-11-10 against `main` at a4b824b (0.7.0). It lists every way the game can still get better, groups the
work into tasks, and says in what order to do them. `docs/tasks.md` stays the record of earlier milestones; open tasks
from it are folded in here and keep their old numbers in brackets.

**The honest answer to "would more work make it better?"** Yes, but not evenly.
- **Safe to build without the owner:** content, systems, bosses, the world, UI tools and automated tests. Tests and
  scripted play prove these work.
- **Needs the owner's play-test:** how movement, combat and digging *feel*, and whether the difficulty is right. More
  blind tuning here can make things worse. 0.7.0 has not been played yet, so its feel changes are still unconfirmed.
- **Best value per hour:**
  1. An automated play-through that catches bugs before the owner plays.
  2. More reasons to explore and fight: enemies, bosses, biomes and loot.
  3. Towns the player builds.

Sizes: **S** about an hour, **M** a few hours, **L** a day or more. **Decide** marks a choice the owner makes first.
Every task also passes `npm run check`, `npm run benchmark -- --assert` and `npm run smoke`.

---

## R1. Make sure what exists works (do first)

- [x] **R1.1 Scripted play-through (M).** Done in 0.7.1: `npm run playthrough`, report in
  `screenshots/playthrough/report.html`, run in CI. It found the bugs fixed in 0.7.1. A headless browser script plays a new survival world from start to finish:
  1. punch a tree, craft planks, a workbench and tools;
  2. dig down, smelt iron;
  3. fight slimes and a skeleton;
  4. summon and kill the Slime King;
  5. trade with a villager;
  6. save, reload, and check that everything is still there.

  It fails on any console error or a stuck step. Screenshots at each step go into one HTML report for the owner.
  **Done when:** the script passes in CI and the report shows each step.
- [x] **R1.2 Balance sheet (S).** Done in 0.7.1: `docs/balance.md`; swords and armour rebalanced. Time to reach
  each tier is not measured yet. A generated table showing:
  - how many hits each weapon tier needs to kill each creature;
  - how many bites each creature needs to kill the player in each armour tier;
  - how long each tier takes to reach.

  Fix any outliers.
  **Done when:** the table is in `docs/balance.md`, a test regenerates it, and no fight is a one-hit kill either way
  unless meant to be.
- [~] **R1.3 Stuck and lost checks (S).** 0.7.1 tests spawning, a boss leaving and drops at unloaded ground.
  Villagers reaching their bed is not tested yet. Check these in tests:
  - creatures never spawn inside blocks;
  - bosses despawn or leave at day if they are unfought;
  - villagers can always reach their bed;
  - a dropped item never falls through the world.

  **Done when:** each has a test.

## R2. Combat that has depth

- [x] **R2.1 Enemies that shoot (M).** Done in 0.7.2 for skeletons (arrows sticking in blocks not yet). Skeletons draw and loose arrows that the player can see and dodge. The draw is
  telegraphed (they pause and aim). Arrows stick in blocks for a while.
  **Done when:** a test has a skeleton hit a standing player and miss a moving one.
- [ ] **R2.2 Telegraphed attacks (M).** Every hostile winds up before it strikes: a crouch, a flash, a sound. Bosses
  get two or three named attacks each, plus a second phase below half health.
  **Done when:** the shape gallery shows each wind-up and a test sees a boss change phase.
- [x] **R2.3 Status effects (M).** Done in 0.7.2 (a list with timers rather than icons). Five effects, each with an icon on the HUD and a timer:
  - poisoned (cave spiders, venom slimes);
  - burning (ember enemies, lava);
  - slowed (snow enemies);
  - bleeding (crits from wolves);
  - well fed (cooked food, which gives slow regeneration).

  **Done when:** each effect starts, ticks and ends in a test.
- [x] **R2.4 Potions and an alchemy table (M).** Done in 0.7.2: six potions; night vision is not done yet. The table is a new station, crafted from planks, glass and a
  cauldron. Potions:
  - healing (instant);
  - regeneration;
  - swiftness;
  - night vision;
  - fire resistance;
  - water breathing;
  - antidote.

  Ingredients are flowers, mushrooms, gel, ember dust and fish. Drinking one gives a short sickness so potions cannot
  be chained. Covers idea 14 "Brewing".
  **Done when:** each potion is craftable at the table and its effect shows in a test.
- [x] **R2.5 More weapon kinds (M).** Done in 0.8.1 (the hammer does not break 3×3 yet). Each weapon kind plays differently:
  - a spear: long reach, a narrow thrust;
  - a hammer: slow, big knockback, and it breaks blocks in a 3×3 area;
  - throwing knives: thrown, and they stack;
  - a boomerang: flies out and comes back.

  The same material tiers apply to all of them.
  **Done when:** each is craftable and its attack shape is tested.
- [x] **R2.6 Better bow (S).** Done in 0.8.1 (the draw already existed). Hold to draw, release to shoot. A drawn shot flies further and hits harder. Arrow types:
  flint, iron, ember (sets things alight), jade (pierces). An ammo count shows next to the hotbar.
  **Done when:** a test shows a full draw fly further than a tap.
- [ ] **R2.7 Hit feel (S, owner to judge).** Hit-stop (a 40 ms freeze on a heavy hit), a small camera kick, a hurt
  sound for each species, and a red edge on the screen when the player is low on health. Each one can be switched off in
  the settings.
  **Done when:** the owner signs it off in play.
- [x] **R2.8 Dodge (S).** Done in 0.8.1. The Dash Boots accessory gives a double-tap dash with brief invulnerability and a cooldown.
  **Done when:** a test dashes through an attack unharmed.

## R3. Bosses and events

- [~] **R3.1 Boss arenas (M)** (18.D4 rest). 0.8.0: altars (two bags for a boss summoned there); no barrier yet. An altar structure appears in each biome region: a flat ring with
  pillars. Using a summon item away from an altar asks the player to find one, or works with a weaker reward
  (**Decide**). The fight closes the arena with a temporary barrier.
  **Done when:** a test summons at an altar, and the barrier lifts on a win or on death.
- [x] **R3.2 Treasure bags (S).** Done in 0.7.6 (no trophy block yet). Each boss drops one bag with its unique loot, so nothing is lost in lava. The bag
  holds a trophy block for display.
  **Done when:** opening a bag gives the listed loot.
- [ ] **R3.3 New bosses (L, one at a time).**
  - **Sandmaw:** a segmented burrowing worm in the desert. It dives under sand and bursts up.
  - **Frost Colossus:** a slow giant in the snow. It throws ice boulders and slows the player.
  - **Hive Mother:** in the jungle or swamp. She spits venom and calls a swarm.
  - **The Deep Heart:** the final boss of the Ember Depths (R4.2).

  Each has its own summon item, arena and loot.
  **Done when:** each boss passes the R2.2 phase test and its loot test.
- [x] **R3.4 Night events (M).** Done in 0.7.6 (zombies do not open doors yet).
  - **Red Night:** a red moon, about 1 night in 8. Twice the monsters, zombies open doors, and more loot.
  - **Slime Rain:** slimes fall from the sky by day, and a big slime ends it.

  Both are announced on screen and can be turned off by difficulty.
  **Done when:** a test triggers each and sees the spawn rate change.
- [ ] **R3.5 Town raids (M, after R5.1).** On some red nights monsters march on the biggest town. Defending it earns
  a reward from the townsfolk.
  **Done when:** a test spawns a raid aimed at a town.

## R4. A world worth exploring

- [ ] **R4.1 Cave biomes (L).** Underground regions with their own blocks, light, music, creatures and ore:
  - glowing mushroom caverns;
  - crystal geodes;
  - flooded caves with fish and the gill pendant;
  - spider nests with webs that slow you.

  **Done when:** seed 1 has each within 300 m of spawn, and each has its creatures.
- [ ] **R4.2 The Ember Depths (L).** A lava layer below −200 m with:
  - basalt and ember stone;
  - lava lakes, and fire bats and magma slimes;
  - a new top ore past jade (**Decide** the name; proposed "Emberite");
  - the Deep Heart boss.

  Covers idea 14 "The Ember Depths".
  **Done when:** the layer generates, the ore tier is complete, and the boss can be reached.
- [x] **R4.3 Sky islands (M).** Done in 0.8.0 (no sky slime yet; the nearest on seed 1 is 820 m away). Rare floating islands high above the surface. Each has a small house, a chest with
  flight-themed loot (cloud charm, feather charm, a glider) and a sky slime.
  **Done when:** seed 1 has one within 500 m of spawn.
- [~] **R4.4 Biome dungeons (M).** 0.8.0: pyramid and overgrown temple with unique charms; ice cave and sunken
  ship remain; deserts and rainforests are rare near spawn.
  - a sand pyramid with traps;
  - an ice cave;
  - a jungle temple;
  - a sunken ship on the coast.

  Each holds a biome chest with an item found nowhere else.
  **Done when:** each generates on seed 1 and its chest rolls its own loot.
- [x] **R4.5 Mimics (S).** Done in 0.8.0. Rarely, a chest in a dungeon is a mimic. It bites when opened and drops a good accessory.
  **Done when:** a test opens one and it attacks.
- [ ] **R4.6 Map markers and waystones (M).** Pin places on the full map, and the compass points to a pin. Waystones are
  found in ruins. Once activated, they let the player travel between them for a cost. Covers idea 14 "Map markers".
  **Done when:** a test teleports between two activated waystones.
- [x] **R4.7 Fire (M)** (12.2). Done in 0.8.2. A fire block that:
  - spreads to wood, leaves and grass;
  - burns out by itself;
  - is put out by rain and water.

  Lightning, lava and ember arrows can start it.
  **Done when:** a test burns a wooden hut down and the fire goes out by itself.
- [~] **R4.8 Water and boats (S each)** (12.3, 12.4). 0.8.2: rivers push swimmers and boats; drops do not drift, and
  boats do not stay yet.
  - **Rivers push:** generated rivers carry the player, boats and drops downstream.
  - **Boats stay:** a boat you step out of stays on the water.

  **Done when:** the earlier tests in `tasks.md` pass.
- [x] **R4.9 Catch-up and persistence (S each)** (12.5, 12.6, 12.7). Done in 0.8.2 (grass regrowth does not catch up).
  - growth catches up while unloaded;
  - old chests stay empty;
  - the Ember Warden keeps its wounds.

  **Done when:** the earlier tests in `tasks.md` pass.
- [ ] **R4.10 Meteor fall (S).** After the first boss, a meteor sometimes lands at night. It leaves a crater of rare
  ore that is hot to stand on.
  **Done when:** a test spawns one and mines it.

## R5. Towns the player builds

- [x] **R5.1 Housing check (M)** (18.D5 rest). Done in 0.7.5; placing a bed reports what the room lacks (no
  separate House? tool). A room counts as a home when it:
  - is enclosed;
  - is lit;
  - has a door, a bed and a table or workbench;
  - is at least 4×3×4 cells.

  A homeless villager moves into a valid home. A **House?** tool shows whether a room is valid and why not.
  **Done when:** a test builds a room and a villager moves in.
- [~] **R5.2 More townsfolk (M).** 0.7.5: Guide, Merchant, Nurse and Alchemist; Tinkerer and Explorer remain,
  and the Guide does not explain recipes yet. Each arrives when a condition is met:
  - Guide: from the start; gives tips and explains recipes.
  - Nurse: after a Life Crystal; heals for coins.
  - Tinkerer: after the first boss; combines accessories.
  - Alchemist: after an alchemy table; sells potion ingredients.
  - Explorer: after the first dungeon; sells maps to unvisited places.

  **Done when:** each arrives under its condition in a test.
- [ ] **R5.3 Quests and bounties (M).** Townsfolk post simple tasks with coin and item rewards:
  - bring 10 gel;
  - kill a Gloom Moth;
  - find the pyramid.

  A Quests tab lists them.
  **Done when:** a test accepts, completes and turns in a quest.
- [ ] **R5.4 Townsfolk talk (S).** Short spoken lines that depend on the time, the weather, nearby events and their
  job, shown in a speech bubble.
  **Done when:** each NPC has at least eight lines and the bubble shows.
- [ ] **R5.5 Furniture (M).** A furniture set in each wood type:
  - chairs, tables and shelves;
  - banners, candles and chandeliers;
  - paintings that use existing art.

  Furniture counts toward valid housing.
  **Done when:** all of it is craftable at the workbench and placeable.

## R6. Progression and gear

- [ ] **R6.1 A full material ladder (M).** wood → stone → iron → gold → diamond → jade → Depths ore. Each tier has
  tools, a sword, a spear, a hammer, armour and arrows. Gold gets real gear (fast but weak) instead of being only a
  trade good.
  **Done when:** the balance sheet (R1.2) shows each tier clearly better than the last.
- [x] **R6.2 Armour set bonuses (S).** Done in 0.7.4 (leather: speed instead of gold, which has no armour yet). Wearing a full set gives a bonus, for example:
  - iron: +2 defense;
  - gold: +10% speed;
  - diamond: +5% crit;
  - jade: thorns, which hurts biters.

  The tooltip shows the bonus.
  **Done when:** a test equips each full set.
- [ ] **R6.3 Modifiers (M).** Weapons and accessories roll a modifier when made or found, for example: Keen (+crit),
  Heavy (+knockback), Swift (+speed), Sturdy (+defense). At an anvil the player can pay coins to roll again. The
  modifier shows in the name and the rarity colour.
  **Done when:** rolls are seeded and saved, and a reforge test passes.
- [x] **R6.4 Grappling hook (M).** Done in 0.7.4: pull and hold; swinging on release is not done. Fire a hook at a block and get pulled to it. Release in mid-air to swing. It is the
  most "3D Terraria" movement tool.
  **Done when:** a test pulls the player up a cliff.
- [ ] **R6.5 Late movement (M).**
  - **Glider wings:** hold jump to glide far, made from sky-island loot.
  - **Rocket boots:** short flight with a fuel bar.
  - **Tinkered combinations:** cloud charm + feather charm = Storm Charm.

  **Done when:** each is tested in physics.
- [ ] **R6.6 Mounts (L)** (idea 14 "Riding"). Tame a horse with food and ride it faster. A slime saddle from the
  Slime King gives a bouncy mount.
  **Decide** whether this is wanted.
  **Done when:** a test rides a mount across a field.
- [ ] **R6.7 Pets and companions (M)** (idea 14 "Tame wolves").
  - A wolf tamed with bones follows the player and fights.
  - Light pets (a wisp) follow the player and give light.

  **Done when:** a tamed wolf attacks a hostile in a test.

## R7. Goals and an end game

- [x] **R7.1 Rewards for the journal (S)** (13.5). Done in 0.7.3. Each milestone gives something useful: torches, a map, a Life
  Crystal, a recipe.
  **Done when:** reaching a milestone puts its reward in the inventory.
- [x] **R7.2 Bestiary (M).** Done in 0.7.3 (in the pause menu). A journal tab with every creature: seen or not, kills, health, drops discovered so far,
  and where it lives. After 25 kills it shows the drop chances.
  **Done when:** the tab fills in from kills in a test.
- [x] **R7.3 Recipe and item guide (S).** Done in 0.7.3 (in item tooltips). From any item: "used in" and "comes from" (craft, drop, chest, trade).
  **Done when:** every item has at least one source listed.
- [ ] **R7.4 The second act (L, Decide).** Lighting the beacon starts the next stage:
  - harder monsters;
  - the Depths open up;
  - new ores appear in stone;
  - the final boss becomes reachable.

  Credits play after the final boss, and the player can keep playing.
  **Decide** the story and the name.
  **Done when:** the second act is triggered and the final boss can be beaten.
- [ ] **R7.5 Harder nights over time (S)** (13.4 rest). Day 20 spawns more than day 1, capped by difficulty.
  **Done when:** the test in `tasks.md` passes.
- [ ] **R7.6 Hardcore and challenge seeds (S each)** (idea 14). Hardcore has one life. Challenge seeds have a goal
  and a timer.
  **Done when:** a hardcore death deletes the world after a confirmation.

## R8. Feel, controls and interface (owner play-test first)

- [ ] **R8.1 Tune from play (M, owner).** Adjust movement, jump, digging speed, combat timing and creature numbers
  from the owner's notes on 0.7.0.
  **Done when:** the owner is happy.
- [ ] **R8.2 Frame rate (M, owner)** (18.A4). Use the owner's F3 numbers to fix any remaining hitches. Options:
  - a lower draw distance for creatures;
  - fewer far-chunk faces;
  - an option for half-rate shadows or effects.

  **Done when:** 60 fps on the owner's machine in a normal scene.
- [x] **R8.3 Death and respawn (S).** Done in 0.8.1 with the default: half the coins (no respawn timer). On death:
  - drop half the coins where you died (**Decide**: coins only, or the whole inventory as now);
  - show a death screen with the cause;
  - start a respawn timer.

  **Done when:** a test dies and finds the coins.
- [ ] **R8.4 Chests (S).**
  - Quick stack to all chests nearby.
  - Name a chest.
  - Sort a chest.
  - Take all and deposit all.

  **Done when:** each button is tested.
- [ ] **R8.5 Controller play (M).** Full play with a gamepad: aim assist on targets, radial hotbar, menu navigation
  (part exists in `padMenu.ts`).
  **Done when:** the scripted play-through (R1.1) passes using pad input only.
- [ ] **R8.6 Accessibility (S)** (idea 14).
  - subtitles for sounds;
  - colour-blind safe rarity marks (a symbol as well as a colour);
  - hold-to-toggle for held keys;
  - reduced screen shake.

  **Done when:** each is a setting and is tested.
- [ ] **R8.7 Tutorial (M).** The Guide NPC and short on-screen goals take a new player through the first night. No
  wall of text.
  **Done when:** a new world shows the first goal, and each goal clears when it is done.

## R9. Sound and music

- [ ] **R9.1 Creature voices (S).** A synthesised idle, hurt and death sound for each species.
- [ ] **R9.2 Footsteps and impacts (S).** Steps, landings and hits for each material.
- [ ] **R9.3 Music for each place (M).** Separate synthesised themes for:
  - day and night;
  - caves, the Depths and towns;
  - boss fights;
  - a short win sting after a boss.

  **Done when:** each plays in the right place, and the music volume setting covers all of it.

## R10. Art

- [ ] **R10.1 Faces and markings on shape creatures (M).** Eyes that blink, mouths that open on attack, simple stripes
  and spots. Done with extra small shapes or a decal, within the 64-shape budget.
- [ ] **R10.2 Authored icons (M, art).** Replace the painted placeholders: accessories, wands, the life crystal, gel and
  the crown. Add ore and gear art for each new tier.
- [ ] **R10.3 Effects (M).** Real sprites for magic bolts, potion splashes, status icons and fire.
- [ ] **R10.4 Sky (S).** Stars and moon phases (the red moon for R3.4), and shooting stars that drop a rare item.
- [ ] **R10.5 Open art tasks from `tasks.md`** (19.3–19.7). Beacon activation, flowing fluids and foam, item upgrades
  in first person, mob facial states, the unused UI library, and title and ending illustrations.

## R11. Code health (alongside)

- [ ] **R11.1 Split the large files (M).** `main.ts` (881 lines), `play.ts` (1323) and `app.tsx` (509) split by
  concern: combat, items, townsfolk and screens. Behaviour stays the same.
  **Done when:** no file is over about 600 lines and all checks pass.
- [ ] **R11.2 Error overlay (S).** In development builds, uncaught errors show on screen with a copy button, so the
  owner can paste them.

## R12. Large and undecided

- **Multiplayer (L+).** Play a world with a friend. It needs a server and a sync model. Only if the owner wants it.
- **Mechanisms (L).** Levers, pressure plates, traps and wiring (idea 14).
- **Rails and carts (L)** (idea 14).
- **Seasons that matter, beekeeping, dyes, a cooking pot (M each)** (idea 14).
- **Photo mode (S)** (idea 14).

---

## Decisions for the owner

1. **R3.1:** can summons be used away from an altar?
2. **R4.2:** the name of the Depths ore.
3. **R6.6:** are mounts wanted?
4. **R7.4:** the story of the second act.
5. **R8.3:** what is lost on death?
6. **R12:** is anything here wanted soon, especially multiplayer?

Until the owner answers, the defaults in brackets are used: summons work anywhere and arenas are a bonus; the ore is
"Emberite"; no mounts; the second act waits; on death, half the coins drop.

## Order of work

**Now, without the owner (safe and testable):**
1. R1.1, R1.2, R1.3: prove what exists works.
2. R2.1, R2.3, R2.4: enemies that shoot, status effects, potions.
3. R7.1, R7.2, R7.3: journal rewards, bestiary, item guide.
4. R6.4, R6.2: the grappling hook and set bonuses.
5. R5.1, R5.2: player-built towns and more townsfolk.
6. R3.1, R3.2, R3.4: arenas, treasure bags, night events.
7. R4.3, R4.4, R4.1: sky islands, dungeons, cave biomes.
8. R3.3, R4.2: new bosses and the Depths.

Each group ships as its own pull request and version, so the owner can stop or redirect at any point.

**After the owner plays 0.7.0:** R8.1 and R8.2 first, then R2.7, then the rest of R8.

**Needs art time:** R10.
