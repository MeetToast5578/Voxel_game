# Spec 2: Save hotbar contents and time of day

## Goal

After a reload, the hotbar contains the same blocks as before (including ones added with pick-block), and the time of day continues where it was.

## Current behaviour

The save (`src/storage/save.ts`, version 1) stores the seed, player position/look/flying, the selected slot and block edits. After a reload:

- the hotbar resets to `DEFAULT_HOTBAR`
- the time of day resets to `START_TIME_OF_DAY`

## Requirements

### Save format

1. `SAVE_VERSION` becomes 2. `SaveData` gains two fields:
   - `hotbar`: an array of `HOTBAR_SIZE` block ids
   - `timeOfDay`: a number in [0, 1)
2. `SAVE_KEY` keeps its current string. The "v1" in the key is only a name, and changing it would orphan everyone's existing save.
3. `parseSave` accepts versions 1 and 2:
   - A version 1 save is upgraded to the version 2 shape, with `hotbar` set to a copy of `DEFAULT_HOTBAR` and `timeOfDay` set to `START_TIME_OF_DAY`.
   - Any other version returns `null`, as today.
   - The returned object always has the version 2 shape, with `version: 2`.
4. The critical fields stay as strict as today. An invalid seed, player, selectedSlot or edits still makes `parseSave` return `null`.
5. The two new fields are repaired, never rejected. A bad hotbar or time must not throw away someone's world:
   - **Hotbar.** It's invalid if it isn't an array, isn't exactly `HOTBAR_SIZE` long, or any entry isn't an integer from 1 to the highest block id. AIR (0) is not allowed; any other known block is. If it's invalid, the whole hotbar becomes a copy of `DEFAULT_HOTBAR` (not slot by slot).
   - **Time of day.**
     - A finite number is wrapped into [0, 1): 1.25 → 0.25, −0.25 → 0.75, 1 → 0. The result must be +0, not −0.
     - Anything else, including a missing field, becomes `START_TIME_OF_DAY`.

### Game

6. Every save writes version 2 with a copy of the current hotbar slots and the current `timeOfDay`. That covers autosave, tab hidden, `pagehide` and the debug `save()`.
7. When a save is loaded:
   - The hotbar slots are restored before the first frame.
   - The selected slot is restored as today.
   - `timeOfDay` is restored.

   The hotbar must not share an array with the save data.
8. Unchanged when no save is loaded (no save, `?seed=`, `?nosave=1`, after **New world**): the default hotbar and `START_TIME_OF_DAY`.

### Debug API (for the smoke test)

9. Add `setHotbarSlot(index, blockId)` to `window.__game` (`src/debugApi.ts`). It puts a block into one slot and ignores an invalid index or block id.
10. `state()` (`Game.debugState`) gains `hotbar`: the array of the 9 slot ids.

### Docs

11. In `README.md`, change "Automatic saving to `localStorage`" to say the save also includes the hotbar and the time of day.

## Out of scope

- Saving several worlds
- IndexedDB
- Renaming `SAVE_KEY`
- Changing how settings are saved

## Acceptance criteria

- All unit test cases below pass, together with the existing ones (updated where noted).
- The extended smoke check passes.
- Manual check:
  - Start a world, middle-click a block that isn't in the hotbar, wait about 10 seconds for an autosave, then reload.
  - The picked block is still in the hotbar, and the sky shows roughly the same time of day.

## Test cases

### Unit tests (`tests/save.test.ts`)

Update the existing `sample` to version 2, with a non-default hotbar and a `timeOfDay` of 0.6.

1. **Round trip.** Writing the version 2 sample and loading it back gives an equal object.
2. **Version 1 upgrade.** A version 1 JSON (the old sample shape, without the two new fields) loads as:
   - version 2
   - `hotbar` equal to `DEFAULT_HOTBAR`
   - `timeOfDay` equal to `START_TIME_OF_DAY`
   - every other field unchanged
3. **Unknown versions.** Version 3 → `null`, version 0 → `null`, no version → `null`. This replaces the existing "version 2 is rejected" assertion, which becomes "version 3 is rejected".
4. **Hotbar repairs.** Each of these loads successfully with `hotbar` equal to `DEFAULT_HOTBAR`, while seed, player and edits stay intact:
   - hotbar missing
   - `"abc"`
   - 8 entries
   - 10 entries
   - an entry of 0
   - an entry of 2.5
   - an entry of 999
   - an entry of `"1"`
5. **Hotbar edge cases.** A hotbar containing stone (1, the lowest allowed id), glowstone (13, the highest) and bedrock (10) is kept as is.
6. **Time of day.**

   | Input | Loads as |
   |-------|----------|
   | 0.6 | 0.6 |
   | 1.25 | 0.25 |
   | −0.25 | 0.75 |
   | 1 | exactly +0 (check with `Object.is`) |
   | `"noon"`, `null`, or field missing | `START_TIME_OF_DAY` |

7. **Existing rejections.** The current rejection tests (corrupt JSON, bad player, bad edits) still return `null` when based on the version 2 sample.

### Smoke test (`scripts/smoke.mjs`)

8. Extend the existing check "saves the world and restores it after a reload":
   - **Before saving**, in the same `evaluate` call as `save()`: put glowstone (13) into slot 0 with `setHotbarSlot`, and set the time of day to 0.6.
   - **After the reload:**
     - `state().hotbar[0]` is 13.
     - `state().timeOfDay` is within 0.01 of 0.6.
     - The existing assertions (brick, selected slot, seed, position) still pass.
