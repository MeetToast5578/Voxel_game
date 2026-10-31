# Spec 53: Building copy/paste and portable world backups

Finish the copy/paste and export/import parts of T-K5. Keep stairs, doors, gamepad,
in-world touch controls and Pixel Aero open. Preserve dependencies, old state IDs,
world generation and save/database schema versions.

## Building clipboard

Creative-mode Ctrl/Cmd+C selects two opposite aimed block corners. Show the first corner,
selection outline and copied count/dimensions in the tool panel; X cancels a selection
without destroying the previous clipboard. Bound each edge to the existing 32-block volume
limit and reject unloaded cells. Copy succeeds atomically; failure keeps the old snapshot.

Snapshot non-air states, including slab halves and horizontal logs, independent of later
source edits. Air is omitted: paste does not clear existing buildings. Ctrl/Cmd+V anchors
the copied minimum corner against the aimed face. Fill only air/water, apply the existing
actual-body overlap exclusion and edit budgets, and record one undoable/redoable action.
An empty successful selection clears stale copied blocks. Clipboard is session-only and
does not use the operating-system clipboard. No rotation, cut or replacement paste in this batch.

## World files

Export the live world, including unsaved/unloaded edits, seed, inventory, player, clocks,
mode/vitals, items and paused scheduled updates. Explicit air edits preserve dug holes.
Serialize canonical state names; generated terrain is recreated from the seed. The JSON
wrapper has its own format/version tag; save version remains 3.

Validate imported JSON **before** confirmation or writes. Reject wrong versions, malformed
or noncanonical data, unknown states, duplicate chunks/edits, metadata requiring repairs,
unsafe coordinates and configured byte/chunk/edit limits. Do not silently discard data.
Export must obey the same limits so it never downloads an unimportable backup.

Expose accessible Export world / Import world controls in start/pause menus. Temporary
worlds may export; imports require a persistent saved world. Confirm the destination
replacement with seed/chunk summary; the user can export first. Disable controls during
replacement. Pause old simulation/autosaves, drain active/coalesced writes, replace metadata
and all chunks in **one IndexedDB transaction**, then reload without temporary-world options.
Abort on synchronous or asynchronous write failure; preserve the old saved world and
resume the old session. Deleting a world also drains old writes and handles clear failure.

Store a save revision in the existing metadata store. Replacement/deletion increments it;
every write checks the revision inside its transaction. Other tabs with old sessions must
not resurrect the previous world. Reject their writes and explain that they can export
their session before reloading. No database schema bump or raw revision field in exports.

## Verification

Unit tests cover copy ordering/negative coordinates/limits/unloaded cells/snapshots and
paste/undo preservation of existing blocks and water; backup metadata/state/air/tick
roundtrips; malformed and duplicate input; replacement failures; and writer draining.

Full gameplay smoke uses real Ctrl+C/Ctrl+V, preserves a copied top slab after a source edit,
keeps an existing destination block and undoes paste. The world-transfer browser suite
downloads an actual backup, rejects invalid import, forces a put failure after partial writes
to assert transactional rollback, imports through the file picker and confirmation, verifies
complete restoration/removal of later edits, then proves a stale second tab cannot save over it.
Run the offline/platform suite after adding the new UI and client modules. Inspect captures.
