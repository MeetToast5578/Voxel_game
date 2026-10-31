# Spec 26: Ores (geology slice 3)

**Built by:** Claude. Third slice of Phase 2 item 5 in `docs/ROADMAP.md`. Follows spec 20 (limestone, slate, basalt, deepslate). Gravel and clay in riverbeds wait for rivers (item 3).

## Goal

Ore veins scatter through the underground: coal near the surface, iron and gold deeper, diamond and lapis deep, and below −100 m the ore sits in deepslate. A cliff face or a cave wall can reveal a vein, and digging down changes the ore you find. Everything is deterministic from the seed, so the same vein is in the same place in every world of that seed.

## Requirements

1. **Block types.** Seven new block types, appended to the registry in `src/world/blocks.ts` after `red_mushroom`, so the state numbers are fixed by order: `coal_ore` (28), `iron_ore` (29), `gold_ore` (30), `redstone_ore` (31), `diamond_ore` (32), `emerald_ore` (33), `lapis_ore` (34). Each has a stable lowercase key, so saves store names. Each has its own atlas tile, `Tile.COAL_ORE` (39) through `Tile.LAPIS_ORE` (45), painted procedurally in `src/render/atlasPixels.ts`: stone with flecks of the ore colour. Each has a hardness in `seconds to break by hand` (coal 2, iron 3, gold 3, redstone 3, diamond 4, emerald 4, lapis 3).
2. **Ores by depth.** Each ore type has a depth band (in meters, measured from sea level, negative down): coal −4 m to −40 m, iron −32 m to −96 m, gold −64 m to −160 m, redstone −96 m to −224 m, lapis −128 m to −320 m, diamond −160 m to −480 m, emerald −160 m to −480 m. The bands live in `src/config.ts`; the generator converts them to blocks. Below −100 m the host rock is deepslate (spec 20), so deep ores appear in deepslate. No ore appears above its band or replaces the surface block.
3. **Ore veins.** Each column gets at most one cluster per ore type, with `chancePerColumn` from `src/config.ts`. A cluster is a few blocks around one cell of the column, placed only in stone-like rock (stone, the strata rocks, deepslate — never soil, plants or air). Placement is deterministic from `(seed, cx, cz)` and does not depend on which chunk of the column is being generated, so a chunk and the matching slice of the legacy column agree byte for byte.
4. **Unchanged.** Caves, water, sea level, strata, bare rock, soil, plants, trees, the warp noise, and the density of spec 14. Below `TERRAIN_CHUNK_BOTTOM` the terrain is still plain stone, as spec 13 says — no ores there.
5. **Saves.** The new states are appended to the registry and saves store block states by name, so existing save records still load unchanged. Chunks already saved keep the blocks they were saved with.

## Out of scope

- Gravel and clay in riverbeds (wait for rivers, phase 2 item 3).
- Deepslate ore variants as separate block types (deep ores simply replace deepslate).
- Ore blocks in the creative hotbar, item drops, smelting or tool tiers (survival, phase 7).
- Biome-based ore frequency (phase 3).

## Acceptance criteria

- `npm run check` passes. The state-count and id tests are extended with the seven new names, keeping their intent: `BLOCK_STATE_COUNT` is 35.
- `npm run smoke` passes.
- In the game, coal shows up in shallow stone and diamonds only deep underground, and below −100 m veins sit in dark deepslate.
- The README, ROADMAP and HANDOFF list the new ores.

## Test cases

1. Each new key round-trips through `blockStateName` and `getBlockDef`, `BLOCK_STATE_COUNT` is 35, and each new id matches its `BlockId` name (`tests/blocks.test.ts`).
2. Every ore is solid, opaque, breakable, with a finite hardness, and its atlas tile is painted (`tests/blocks.test.ts`, `tests/atlasPixels.test.ts`).
3. In the seed-1 mountain column, every ore block sits inside its configured depth band, and no ore block is a column's surface block (`tests/generator.test.ts`).
4. Ore placement is deterministic: two generators with the same seed give identical chunks, including where the ores are (`tests/generator.test.ts`).
5. Stacked chunks still equal the legacy column byte for byte, now with ores in the rock (`tests/generator.test.ts`).
