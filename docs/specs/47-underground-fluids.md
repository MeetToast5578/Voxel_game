# Spec 47: Underground pools and fluid hazards

Implements T-D4, T-G8, T-G9, T-G13 and T-G14 as one dependency-ordered batch.

## Rules

- Preserve old block IDs; append source lava, 16 flowing-lava states and obsidian. Lava
  is non-solid, opaque-looking, luminous, with a procedural orange texture and level-aware
  geometry. Its density is 3100 kg/m³; drag exceeds water's. Water and lava have separate
  tick delays (5 and 20). Both fall, spread, thin and drain; only their own fluid feeds them.
- Generalize the existing flow handler without changing water timing. On reload, flowing
  states resume with their own delay; sources at water/lava interfaces also resume reactions.
- Contact converts the lava cell, preserving water: lava above water makes stone, otherwise
  source lava makes obsidian and flowing lava makes cobblestone. Recheck neighbours after
  conversion; never silently replace one fluid with the other. Include negative chunk seams.
- Underground pools are deterministic jittered-grid ellipsoid basins with a solid shell,
  a level fluid surface and air above it. Freshwater pools sit at -20 to -60 m; lava pools
  at -140 to -260 m. Surface roof and bottom-band protection take precedence. Each chunk
  computes the same intersecting pools from seed/coordinates; saved edits still override
  generation. This is separate from spec 46's broad groundwater filling.
- Players and loose bodies receive lava buoyancy/drag without treating lava as water for
  drowning, splash sounds or underwater fog. Source and flowing lava share properties.
- Fall damage uses the actual pre-collision downward speed, including fluid drag, instead
  of reconstructing a speed from the original fall height. Contiguous water at landing
  attenuates impact exponentially with depth. Shallow water only partly cushions a fall;
  sufficiently deep water prevents ordinary fatal falls. Flight and teleport reset impact.
- Any actual body overlap with lava causes survival contact damage and ignition. Burning
  continues briefly after leaving lava; water extinguishes it. Simultaneous water/lava
  contact extinguishes residual fire but does not remove direct lava damage. Creative mode
  is immune; mode switches and death clear transient fire state. No fire persistence yet.
- Expose burning in the debug state and show a textual survival hazard warning; preserve
  inventory, controls and save formats. New named states round-trip through existing saves.

## Checks

Unit tests exercise fluid timing, gravity, thinning/draining, reloading and chunk boundaries;
all three reaction products and order; pool shape, shell, surface protection, determinism,
negative coordinates and chunk order; real lava buoyancy/drag; dry/shallow/deep-water landings;
body contact, burn lifetime, extinguishing, creative immunity and death reset via real methods.
Browser smoke verifies generated pools, lava flow/reaction and player fire/extinguishing.
Run full typecheck/unit/build, isolated worker budget guards, GPU checks and gameplay smoke
sequentially. Do not close tasks with unexplained failures or claim manual/CI acceptance.

## Limits

No lava waterfalls, fluid pressure, fire spread, lava item destruction, currents, snow,
seasonal simulation or arbitrary fluid mixing. T-G15 remains partial for animation/snow.
