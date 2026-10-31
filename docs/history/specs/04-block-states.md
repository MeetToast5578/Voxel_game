# Spec 4: 16-bit block states

**Built by:** Claude. It touches the mesher, lighting and worker transfer.
**Depends on:** nothing. Do it before specs 5–7, which build on the 16-bit arrays.

## Goal

Block storage moves from 8-bit ids (at most 256) to 16-bit **block states**, so later phases can add many block types and per-block variants without another format change. Variants include:
- fluid level (8)
- snow layer depth (8)
- log axis (3)
- crop age

Every block state also gets a stable text name, so saves never depend on numbers.

## Current behaviour

- Chunks are `Uint8Array`.
- `BlockId` is a plain object of 14 ids.
- `BLOCKS[id]` is the definition.
- The lookup tables in `blocks.ts` (`OPAQUE`, `SOLID`, `EMISSION`) have 256 entries.
- The mesher, the light code and the worker protocol all assume `Uint8Array`.

## Requirements

### Registry (`src/world/blocks.ts`)

1. **Types and states.**
   - A **block type** is what `BLOCKS` describes today: name, solidity, opacity, tiles, layer, emission.
   - Each type gains a stable lowercase `key` (`'stone'`, `'water'`, `'glowstone'`, …) and a `variants` count (default 1).
2. **State ids.**
   - Block state ids are assigned in registration order: each type takes a run of `variants` consecutive ids.
   - AIR is state 0.
   - With today's 14 types, each having 1 variant, every existing `BlockId` value stays the same number. `BlockId.X` now means "variant 0 of type X".
3. **Helpers:**
   - get the type definition of a state
   - get the variant index of a state
   - make a state from a type and a variant (throws if the variant is out of range)
   - convert a state to a name and back, with the name format `key` for variant 0 and `key#n` otherwise
     - Parsing an unknown name returns `null`, not an exception.
   - Existing helpers (`getBlockDef`, `isOpaque`, `isSolid`, `lightEmission`) take a state and keep their behaviour.
4. **Lookup tables** cover the whole 16-bit range (65,536 entries) and are filled per state from its type.
   - An unregistered state is treated as AIR by the lookups.
   - `getBlockDef` still throws on an unregistered state, as today.
5. **Total states.** Export the total number of registered states. Registering more than 65,535 states throws at start-up.
6. **Registry builder.** The registry is built by a pure function that takes a list of type definitions. The module builds the real registry with it and exports the helpers bound to it. Tests call the function directly to make small test registries.

### Storage width

7. Chunk block arrays become `Uint16Array`. Every place that creates, copies or transfers block arrays follows suit:
   - chunk
   - world edits (already plain numbers)
   - generator
   - `light.ts` region arrays
   - `mesher.ts` padded volume
   - worker protocol and pool (transfer lists use the 16-bit buffers)
   - chunk manager neighbour copies

### No behaviour change

8. Rendering, lighting, generation, physics, saving and the debug API behave exactly as before.
   - The save still writes the same numbers, because ids didn't change. Spec 8 moves saves to names.
   - The hotbar still holds states.

## Out of scope

- Adding new block types or real variants (later phases)
- Palette compression
- Per-variant textures

## Acceptance criteria

- `npm run check` and `npm run smoke` pass.
- Existing tests pass. The only edits allowed are type changes (`Uint8Array` → `Uint16Array`) in test fixtures, listed in the pull request.
- No `Uint8Array` remains for block data. Light arrays may stay 8-bit.

## Test cases (`tests/blocks.test.ts`)

1. **Ids unchanged.** Every `BlockId` value equals its old number, and its state name equals its key (`stone`, `glowstone`, …).
2. **Name round trip.** For every registered state, name → state → name is the identity.
3. **Unknown names.** `"nope"`, `"stone#1"` (stone has 1 variant), `"stone#-1"`, `"#2"` and `""` all parse to `null`.
4. **Variants.** Using the registry builder, register a type with 8 variants between two 1-variant types:
   - its states are consecutive
   - variant index and type are recovered correctly
   - the next type's first state follows directly after
   - making variant 8 throws
5. **Unregistered states.** For state 60,000, `isOpaque` and `isSolid` are false and `lightEmission` is 0.
6. **No 8-bit truncation.** In `mesher.test.ts` and `light.test.ts`, a raw value of 300 written into a neighbour array is copied unchanged by `buildPaddedVolume` and `buildRegion`.
