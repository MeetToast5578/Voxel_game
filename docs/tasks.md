# Tasks: Voxel Game

Written 2026-10-31 against `main` at 463450a. This replaces the task list for the deleted 0.3 m game; that list is in
git history, and its `T-…` IDs still appear in `docs/history/` and older `HANDOFF.md` entries.

**Direction (owner, 2026-10-31):** turn the sandbox into a survival game with goals. The player needs progression past
iron, real danger, places worth finding and an end point. Onboarding, sound and polish come with it.

**How to use this list**
- Milestones are in order. Inside a milestone, tasks are in order unless they say otherwise.
- Each task ends with **Done when**. Every task also passes `npm run check`, `npm run benchmark -- --assert` and
  `npm run smoke`.
- Tunable numbers go in `src/config.ts`, in meters and seconds.
- **Decide** marks a choice the owner makes before the task starts.
- Status: `[ ]` open, `[~]` partly done, `[x]` done.

## Where the game stands

- **What survival has today:** log → planks → table → wooden tools → stone tools → furnace → iron tools. You can farm,
  hunt and cook, sleep in a bed, and zombies come out at night.
- **Where it stops:**
  - After iron tools there is nothing left to do.
  - Gold, redstone, lapis, emerald and diamond ore drop themselves and have no use.
  - There is no armour and no weapon, and only one hostile creature.
  - There are no structures, no loot, no goals, no music and no tutorial.
- **First run:** the page opens straight into a creative world named `default`.
- **Settings:** only view distance, mouse sensitivity and FOV.
- **Lost in the switch-over:** these existed in the old game and are not in the rewrite:
  - body temperature;
  - river currents pushing the player;
  - catch-up on reload;
  - plant succession;
  - creative copy and paste;
  - creature sounds;
  - animals following food.

---

## 0. Measure first (owner)

- [ ] **0.1 Survival playtest.** Play 20 minutes of survival on your own machine with a mouse and keyboard. Note what is
  broken, confusing or dull.
  **Done when:** the notes are in `HANDOFF.md`, and every bug found is a task at the top of this list.
- [ ] **0.2 Frame rate on real hardware** (old T-C3). Check F3 at view 8, 12 and 16, in a forest, over the sea and in a
  cave.
  **Done when:** the numbers are in `HANDOFF.md`. Task 10.2 depends on them.

## 1. Front door

- [x] **1.1 Title screen.** On load, show Continue (the last world), New world, Load world and Settings. Nothing
  streams until a world is chosen. URL parameters still skip straight into a world.
  **Done when:** a fresh visit shows the title screen, not a creative world, and the smoke test covers it.
- [x] **1.2 Survival by default, and difficulty.**
  - New worlds start in survival.
  - A difficulty (Peaceful, Normal, Hard) scales hostile spawns, the damage they deal and how fast hunger drains.
  - It is saved in the meta record and can be changed from the pause menu.
  **Done when:** unit tests cover the scaling, and Peaceful spawns no hostiles.
- [x] **1.3 Settings.** (Music volume comes with music, 8.2.) Add music and effects volume, invert Y, key rebinding and GUI scale. `parseSettings` checks
  every new field.
  **Done when:** each setting survives a reload, and a bad stored value falls back to its default.
- [x] **1.4 Loading and a safe spawn.**
  - A loading screen shows progress until the chunks around the spawn are meshed.
  - The first spawn is never in water, inside a cave or on a cliff edge.
  **Done when:** ten random seeds spawn on dry, open ground (unit test on the spawn search).
- [x] **1.5 First-steps hints.** Short prompts in survival, in this order: move, break a log, open the inventory, craft
  planks, a table and a pickaxe; then night is coming, and eat.
  - Each hint shows once per world and can be dismissed.
  - All hints can be turned off in settings.
  **Done when:** someone who has not read the README reaches a stone pickaxe in their first world.
- [x] **1.6 Recipe book.** The crafting screens list every recipe and grey out the ones you cannot make. A click fills
  the grid from the inventory.
  **Done when:** every entry in `RECIPES` appears, and filling works in both the 2×2 and 3×3 grids.
- [x] **1.7 Item tooltips.** Show the name, food value, tool tier and uses left, and fuel time.
  **Done when:** every item type shows a tooltip in the inventory and the hotbar.
- [x] **1.8 Gamepad in menus** (old T-K6 gap). The title screen, menus, inventory and crafting screens work with a
  gamepad.
  **Done when:** a gamepad alone can start a world, craft a pickaxe and quit to the title.

## 2. A world that pushes back

- [x] **2.1 Body temperature** (lost in the switch-over).
  - It comes from the biome, season, altitude, weather, wetness, a roof overhead, and nearby torches, campfires or lava.
  - A HUD gauge shows it. Hypothermia and heatstroke hurt, and the value is saved.
  **Done when:** standing outside at night in a snowstorm hurts, and a roofed room with torches does not. Unit tests
  cover the formula.
- [x] **2.2 Campfire.** Crafted from sticks and logs. It gives light and warmth, and cooks food slowly without fuel.
  **Done when:** it warms the player (2.1) and cooks raw meat; unit test.
- [x] **2.3 Weapons.** Swords for each tier, with an attack cooldown and damage by tier.
  **Done when:** a test pins the damage table, and an iron sword kills a zombie in fewer hits than a fist.
- [x] **2.4 Bow and arrows.** Ranged damage that falls off with distance, with arrows as items. The string comes from
  4.1.
  **Done when:** arrows fly, hit creatures, and can be picked up again; unit test on the flight path.
- [x] **2.5 Taking damage feels like it.**
  - The screen flashes red and the camera kicks, with a hurt sound.
  - The death screen names the cause, which `Survival.cause` already records.
  **Done when:** every cause of damage triggers the flash, and the smoke test checks the death message.
- [x] **2.6 Buckets.** An iron bucket picks up and places water and lava sources, and a lava bucket is furnace fuel.
  **Done when:** unit tests cover pick-up, placement and fuel, and placed water flows through the existing ticks.
- [x] **2.7 Crouch and ladders.** Shortcut: a ladder stays when its wall is broken.
  - Crouching is slower and stops you walking off edges.
  - Ladders can be climbed and placed on walls.
  **Done when:** physics tests cover the edge stop and climbing.
- [x] **2.8 Burning.** Lava and fire set the player and creatures alight for a few seconds, and water puts them out.
  **Done when:** unit tests in `survival.ts`.

## 3. Progression past iron

- [x] **3.1 Decide what each ore is for.**
  **Decide.** Proposed default:
  - gold becomes ingots for the compass and clock;
  - diamond gives tier-3 tools and armour;
  - lapis is a dye for maps and the journal;
  - redstone and emerald come out of generation until they have a use.
  **Done when:** every generated ore has a use or is no longer generated.
- [x] **3.2 Smelting and tier 3.**
  - Gold ore smelts to ingots, and diamond ore drops a diamond.
  - Diamond pickaxe, axe, shovel and sword.
  - `needsTier: 3` exists for the deep material in 3.4.
  **Done when:** recipe and break-time tests pass, and a survival world runs through to diamond tools.
- [x] **3.3 Armour.**
  - Head, chest, legs and feet slots in the inventory.
  - Leather (warm, little protection), iron and diamond.
  - Armour reduces damage and wears out, and the HUD shows it.
  **Done when:** a damage-reduction test passes, and leather counts in body temperature (2.1).
- [x] **3.4 A deep material.** Built as *ember ore* (ember crystals), the proposed default.
  **Decide** its name and look.
  - It is found only below −100 m, in deepslate near lava, and needs a diamond pickaxe.
  - It feeds the end goal (6.1).
  **Done when:** the generation test finds it only in its depth band.
- [x] **3.5 Compass, map and lantern.** Shortcut: the map shows only loaded land and remembers nothing.
  - A compass points to your bed, or the spawn if you have none.
  - A map shows the explored area from above, reusing the far-terrain colour sampling.
  - A lantern is a hanging light.
  **Done when:** each has a recipe and a unit test, and the map updates as you walk.

## 4. Danger

- [x] **4.1 More hostile creatures.** Built: skulker (archer, feathers), cave crawler (climbs, string), frost brute (cold and deep, bones → bone meal). Add three of our own designs. Each gets drops that feed a recipe.
  **Decide** the designs. Suggested roles:
  - an archer that keeps its distance and drops bone or feathers;
  - a cave climber that drops string;
  - a cold or deep-dwelling brute.
  **Done when:** each spawns in its own conditions and hunts with the existing path-finding; behaviour tests.
- [x] **4.2 Danger by depth and light.**
  - Spawn rate and toughness rise with depth and darkness.
  - Use the stored block light instead of today's shortcut, which judges darkness from the sky and nearby light
    sources.
  - Torches keep an area safe.
  **Done when:** a test shows no spawns in a torch-lit room, and more spawns at −100 m than at the surface.
- [x] **4.3 Creature sounds** (lost in the switch-over). Calls pitched per species, a hurt sound and a death sound.
  **Done when:** every species has its sounds, and they are quieter with distance.
- [x] **4.4 Path-finding for every creature** (a handoff candidate). Grazers and fleeing animals plan paths too,
  within a per-frame budget.
  **Done when:** a fleeing deer goes round a wall instead of turning back, and the frame cost stays inside the
  benchmark gate.

## 5. Places to find

- [x] **5.1 Structure system.**
  - Placement is deterministic, on a jittered grid per structure type.
  - Each structure is built whole and clipped per column, as trees are.
  - Structures stay out of rivers and the sea, and run in the workers.
  **Done when:** seam tests like the tree tests pass, and generation stays under its 2 ms gate.
- [x] **5.2 Surface structures.** Ruined cabins, a watchtower and a camp, chosen by biome, each with a chest.
  **Done when:** a 1 km square of seed 1 holds a few of each.
- [x] **5.3 Underground structures.** Abandoned mine tunnels with timber supports, and a deep vault guarded by
  hostiles.
  **Done when:** they are reachable from caves, and the vault appears only below −60 m.
- [x] **5.4 Loot tables.** Loot is per structure, depth-scaled and seeded from the world, so the same world gives the
  same loot. Chests save once opened.
  **Done when:** unit tests pin the table rolls, and an opened chest survives a reload.
- [x] **5.5 The goal structure.** A rare deep structure that holds what 6.1 needs.
  **Done when:** at least one appears within 1.5 km of spawn on any seed (test over 20 seeds).

## 6. Goals

- [x] **6.1 The end goal.** Built as proposed: three beacon shards (one per ember shrine), five ember crystals and glass make the beacon.
  **Decide.** Proposed, and our own design: *Relight the beacon.*
  - Collect shards from the goal structures (5.5) and craft them with the deep material (3.4) into a beacon.
  - Light it on a mountaintop above 150 m.
  - An ending screen follows, then the world stays playable.
  **Done when:** the beacon can be built and lit in survival, and the ending shows once per world.
- [x] **6.2 Journal.**
  - About 20 milestones, such as: first night survived, iron, diamond, reaching −200 m, visiting five biomes, finding
    each structure.
  - A toast when one is reached.
  - Saved per world, with a journal screen in the pause menu.
  **Done when:** each milestone has a test that triggers it.
- [x] **6.3 Statistics.** Days survived, distance walked, deaths, creatures defeated and blocks mined, shown in the
  journal and on the death screen.
  **Done when:** they are saved and survive a reload.

## 7. Animals and farming

- [x] **7.1 Follow and breed** (following was lost in the switch-over). Animals follow their food when it is held, and
  two fed animals make a young one, within the population caps.
  **Done when:** behaviour tests pass, and the caps still hold.
- [x] **7.2 Animal products.** Beds take wool or wheat. Leather from cows and deer, and wool from sheep.
  **Decide** whether beds then need wool instead of wheat.
  **Done when:** leather armour (3.3) can be crafted from hunted animals.
- [x] **7.3 Fishing.** A rod made from sticks and string catches fish in water after a wait.
  **Done when:** unit tests cover catch timing, and fish can be cooked.
- [x] **7.4 Farmland.** A hoe tills grass or dirt into farmland, and crops near water grow faster.
  **Done when:** growth-rate tests pass.
- [x] **7.5 Plant succession and catch-up on reload** (crops only; shortcut: light and water are not checked while away, and saplings, snow and ice wait until loaded) (lost in the switch-over). Bare ground regrows plants. A reloaded
  chunk advances its crops, snow and ice by the time it was away.
  **Done when:** unit tests compare a reloaded chunk with the expected outcome.

## 8. Sound and music

All of it stays procedural: no asset files.

- [x] **8.1 Ambient sound.** Wind by altitude and weather, rain, running water nearby, cave drips, and birds by day or
  insects at night, by biome.
  **Done when:** each layer fades in and out with its condition, and obeys the effects volume.
- [x] **8.2 Music.** Short generated pieces at random intervals: calm on the surface, tense underground.
  **Done when:** music plays, obeys its volume, and can be turned off.
- [x] **8.3 Sound effects.** Footsteps by material, eating, menu clicks and the journal toast.
  **Done when:** each action has its sound.

## 9. Feel and polish

- [x] **9.1 Hand and held item.** Built as a 2D overlay of the item's picture (a fist when empty), not a 3D model. A first-person hand that shows the held item and swings on break, hit and place.
  **Done when:** the smoke test screenshot shows it.
- [x] **9.2 Break particles.** Bits of the block's own tile fly out when it breaks.
  **Done when:** they appear for every block, and stay within the draw-call budget.
- [x] **9.3 View bob and sprint FOV.** Both can be turned off in settings.
  **Done when:** both settings work.
- [x] **9.4 River currents** (flowing and falling water push; shortcut: generated rivers are still water and do not push) (lost in the switch-over). River and flowing water push the player and dropped items.
  **Done when:** a physics test shows the player carried downstream.
- [x] **9.5 Per-box collision for stairs and doors** (open doors stay passable: their panel would leave a gap narrower than the player).
  **Done when:** you walk up stairs without stepping, and an open door does not block its cell.
- [x] **9.6 Stony shores and sandbars** (stony shores only, in stretches chosen by noise; no sandbars yet) (a handoff candidate).
  **Done when:** steep coasts and river bends show them on seed 1.
- [x] **9.7 Creative copy and paste** (lost in the switch-over). Low priority.
  **Done when:** a copied box pastes at the aimed face, and Ctrl+Z undoes it.

## 10. Release

- [ ] **10.1 Balance pass.** Set targets and tune toward them. Proposed: iron by the end of day 1, diamond by day 5,
  the end goal in about 10 hours.
  **Done when:** an owner playtest meets the targets.
- [ ] **10.2 Default view distance and quality presets,** from the numbers in 0.2.
  **Done when:** the default holds 60 fps on the owner's machine.
- [~] **10.3 Save safety.** The autosave note is done; save migration waits for the first change to the save format.
  - A save version with a migration step, and a backup made before migrating.
  - An autosave indicator.
  **Done when:** a test migrates a saved world from the version before.
- [x] **10.4 Hosting.** A deploy workflow (`.github/workflows/deploy.yml`) publishes `main` to GitHub Pages; Pages must be turned on once (Settings → Pages → Source: GitHub Actions).
  **Decide** where. GitHub Pages is the default.
  - CI deploys the production build from `main`.
  **Done when:** a public URL plays offline after the first visit.
- [x] **10.5 Version and changelog,** shown on the title screen.
  **Done when:** CI fails if the version did not change with the changelog.
- [x] **10.6 Docs.** Rewrite the README for players. Move `ROADMAP.md`, `OPEN-TASKS.md`, `REFERENCE-GAPS.md` and specs
  1–53 into `docs/history/`.
  **Done when:** no current doc points at deleted code.

## 11. More to find and do (after 0.2.0)

- [x] **11.1 The map remembers.** The map keeps a saved atlas of the land walked through (also while not held), so
  places stay on it after they unload.
  **Done when:** a test saves and reloads the atlas.
- [x] **11.2 Fittings fall.** Ladders whose wall goes, lanterns with nothing above or below and torches with nothing
  below drop as items.
  **Done when:** a simulation test drops them.
- [x] **11.3 Boats** (crouching steps out and the boat goes back in the inventory; it is never left in the world). Craft one from planks, put it on water, ride it faster than swimming; break it to take it back.
  **Done when:** a test rides a boat across water and it stops at the shore.
- [x] **11.4 The Ember Warden** (wakes while its shrine's ancient chest is unopened; keeps the chest shut within 12 m; drops ember crystals and diamonds; a journal milestone). Each ember shrine has a guardian that wakes when the player comes near: strong, slow,
  fire-proof; it drops something worth the fight.
  **Done when:** a test spawns it at a shrine and it fights back.
- [x] **11.5 Thunderstorms** (no fire block yet: strikes scorch grass to dirt and sand to glass instead of setting fires). Heavy rain sometimes brings lightning: a flash, thunder after the light by distance, and
  strikes that can set fire to the ground or hurt a player in the open.
  **Done when:** a test shows strikes only during storms and only on open ground.

---

## Decisions the owner needs to make

- **3.1:** what each ore is for.
- **3.4:** the deep material's name and look.
- **4.1:** the new hostile creatures.
- **6.1:** the end goal.
- **7.2:** wool in beds.
- **10.4:** hosting.

## Suggested order

1. Milestone 0 first. Its findings may reorder everything below.
2. 1.1–1.4: the front door.
3. Milestone 2, then 3, then 4: the survival loop.
4. 5 and 6: reasons to explore.
5. 7, 8 and 9 alongside the above, as smaller tasks.
6. Milestone 10 last.
