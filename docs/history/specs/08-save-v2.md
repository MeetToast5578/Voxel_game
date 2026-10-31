# Spec 8: Save v2 in IndexedDB (with hotbar and time of day)

**Built by:** Haiku.
**Depends on:** specs 4 (state names) and 5 (3D chunk keys).

This replaces the old spec 2 and resolves decision B.

## Goal

The world save:
- moves from `localStorage` (about 5 MB, all written at once) to IndexedDB (large, one record per chunk)
- stores block states by name, so adding blocks later never corrupts a save
- also remembers the hotbar contents and the time of day

## Current behaviour

After spec 5:
- One JSON value under `voxel-game-save-v2` in `localStorage` holds the seed, player, selected slot and every edit.
- The whole thing is rewritten on each autosave.
- The hotbar and time of day are not saved.

## Requirements

### Format (`src/storage/save.ts`, pure)

1. **World meta.** Version 2, with these fields:
   - `seed`
   - `player` (as today)
   - `selectedSlot`
   - `hotbar`: `HOTBAR_SIZE` state **names**
   - `timeOfDay`
2. **Chunk record.** A chunk key plus a list of `[localIndex, stateName]` pairs.
3. **Parsing meta** never throws, and returns `null` when the meta is missing, corrupt, or of another version.
   - **Strict, as today:** an invalid seed, player or selectedSlot gives `null`.
   - **Repaired, never rejected.** A bad hotbar or time must not throw away someone's world.
     - **Hotbar.** It's invalid if it isn't an array, isn't exactly `HOTBAR_SIZE` long, or any entry isn't the name of a registered state other than AIR. If it's invalid, the whole hotbar becomes a copy of `DEFAULT_HOTBAR` (not slot by slot).
     - **Time of day.** A finite number is wrapped into [0, 1): 1.25 → 0.25, −0.25 → 0.75, 1 → +0 (never −0). Anything else, including a missing field, becomes `START_TIME_OF_DAY`.
4. **Parsing a chunk record** never throws. It drops individual invalid entries and keeps the rest:
   - an index that isn't an integer in 0..4095
   - an unknown state name

   A record whose key isn't three integers separated by commas is dropped whole.

   The function also reports how many entries it dropped, so the game can log one warning.

### Store (`src/storage/worldStore.ts`)

5. **Interface `WorldStore`.** Every method is async, and none throws (failures resolve to a result the caller can check):
   - load everything: meta plus all chunk records
   - write the meta plus a set of chunk records in one transaction
   - clear the world
6. **Two implementations:**
   - `MemoryWorldStore`, for tests, `?nosave=1` and `?seed=`.
   - `IndexedDbWorldStore`: database `voxel-game`, schema version 1, object stores `meta` (one record) and `chunks` (keyed by chunk key).
   - If IndexedDB can't be opened (for example, private mode), the game falls back to `MemoryWorldStore`. The start menu then shows one line: "Saving is unavailable in this browser."
7. **Old saves.**
   - The `localStorage` key `voxel-game-save-v1` is never read, written or deleted (decision B).
   - The interim key `voxel-game-save-v2` (spec 5, only ever written by development builds) is deleted on start.
   - Settings stay in `localStorage`, unchanged.

### Game

8. **Startup.** `src/main.ts` awaits the store's load before creating the `Game`, and the game receives the loaded data. While loading, the page shows "Loading world…".
9. **Applying a loaded save:**
   - Restore the hotbar slots (as a copy, not sharing an array with the save data), the selected slot and `timeOfDay`, before the first frame.
   - Edits are applied through the world's normal edit map, converting names to states.
10. **Writing.**
    - The world tracks which chunk keys' edits changed since the last successful write.
    - Each save writes the meta plus only those chunks. Dirty flags clear only after the transaction completes.
    - Saves happen on autosave (`AUTOSAVE_INTERVAL_S`) and when the tab is hidden. `pagehide` is best effort.
    - Two saves never run at once. A save requested while one is running runs once after it.
11. **New world** clears the store, then reloads, with saving disabled in between as today.
12. **Debug API (`src/debugApi.ts`):**
    - `save()` returns a promise that resolves when the write completes.
    - Add `setHotbarSlot(index, state)`, which ignores an invalid index or state.
    - `state()` gains `hotbar`: the 9 slot states.

### Docs

13. In `README.md`:
    - Change "Automatic saving to `localStorage`" to "Automatic saving in the browser (IndexedDB), including the hotbar and time of day".
    - Add one line: "Saves from versions before the cubic-chunk update are not loaded."

## Out of scope

- Several worlds
- Export and import
- Compressing records
- Storing whole chunks (phase 5 may)
- Changing settings storage

## Acceptance criteria

- `npm run check` and `npm run smoke` pass.
- `package.json` is unchanged: no fake-IndexedDB package. The IndexedDB implementation is covered by the smoke test, and everything else by unit tests.
- Manual check with `npm run dev`:
  - Middle-click a block that isn't in the hotbar.
  - Dig down 30 blocks.
  - Wait 10 s, then reload.
  - The hotbar, the hole and roughly the same time of day are all back.

## Test cases

### Unit tests (`tests/save.test.ts`, `tests/worldStore.test.ts`)

1. **Meta round trip.** A sample meta with a non-default hotbar (by names) and a `timeOfDay` of 0.6 serialises and parses back equal.
2. **Versions.** Version 1, 3, 0 or missing → `null`.
3. **Hotbar repairs.** Each of these loads with `hotbar` equal to `DEFAULT_HOTBAR`, while seed and player stay intact:
   - hotbar missing
   - `"abc"`
   - 8 entries
   - 10 entries
   - containing `"air"`
   - containing `"nope"`
   - containing `"stone#5"`
   - containing the number `1`
4. **Hotbar kept.** `stone`, `glowstone` and `bedrock` are kept as they are.
5. **Time of day:**

   | Input | Loads as |
   |-------|----------|
   | 0.6 | 0.6 |
   | 1.25 | 0.25 |
   | −0.25 | 0.75 |
   | 1 | exactly +0 (check with `Object.is`) |
   | `"noon"`, `null`, or field missing | `START_TIME_OF_DAY` |

6. **Rejections.** Corrupt JSON, a bad player, or a bad seed → `null`.
7. **Chunk records.**
   - A record with entries `[5, "stone"]`, `[4096, "stone"]`, `[7, "nope"]` and `[2.5, "dirt"]` keeps only `[5, "stone"]`, and reports 3 dropped.
   - A key `"1,2"` drops the whole record.
8. **Memory store.**
   - Writing meta plus two chunk records, then a second write of one changed chunk, then loading, gives the latest meta and both chunks, with the changed one updated.
   - Clearing it gives `null` meta and no chunks.
9. **Dirty tracking.**
   - After a save, editing one block marks exactly one chunk dirty.
   - A save whose store write fails leaves that chunk dirty.

### Smoke test (`scripts/smoke.mjs`)

10. Extend "saves the world and restores it after a reload". In the same `evaluate` call as `save()` (now awaited):
    - put glowstone into slot 0 with `setHotbarSlot`
    - set the time of day to 0.6
    - also place a brick 40 blocks below the player and one 40 blocks above, after teleporting so their chunks are loaded

    After the reload:
    - `state().hotbar[0]` is glowstone.
    - `timeOfDay` is within 0.01 of 0.6.
    - Both bricks read back.
    - The existing assertions (brick, selected slot, seed, position) still pass.
