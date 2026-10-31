# Spec 41: Region simulation — rivers, lakes, erosion, moisture

**Goal:** the world reads as geography, not noise. Rivers run downhill from mountains to the
sea without breaks, valleys are carved, basins hold lakes at a real water level, and moisture
arrives on the windward side of a range instead of coming from a noise field.

**Phase:** 2, item 3. This is the "hybrid" part of the terrain decision (F).

## Why now

Everything downstream is waiting on this:

- Phase 2 item 5 (gravel and clay in riverbeds) needs riverbeds.
- Phase 5's "digging a riverbank floods the hole" needs rivers and lake levels.
- Phase 5's "a river current carries the player downstream" needs a flow direction per river.
- Phase 3's biome table wants moisture from advection, not a noise field, so deserts line up
  behind mountain ranges.
- Phase 2's done-when ("rivers run downhill from mountains to lakes and the sea without breaks")
  is untestable until this exists.

## Design

### Grid

A region is a square of world, simulated on a coarse grid:

| Quantity | Blocks | Metres |
|---|---|---|
| Core (what a region owns) | 4 096 | 1 228.8 |
| Margin (simulated, not owned) | 512 | 153.6 |
| Simulated extent | 5 120 | 1 536 |
| Coarse cell | 32 | 9.6 |

So the simulated grid is 160 × 160 = 25 600 cells. One region's core covers the camera far plane
(600 m) on its own, so a player usually needs one region.

The margin exists so that flow routing and erosion near a core boundary do not depend on the
artificial edge of the simulated area. Results are read from the core; the margin is discarded.

### Pipeline

1. **Sample base height** at each cell centre from the existing climate fields
   (`heightMeters`), so the simulation starts from exactly the surface the generator produces today.
2. **Priority-flood depression filling** (Barnes et al.). A binary heap pops the lowest cell; each
   neighbour is filled to `max(its own height, the popped cell's fill)`. This guarantees every cell
   has a downhill path to the sea, which is what makes rivers continuous.
3. **Flow routing.** D8: each cell drains to its lowest of eight neighbours on the *filled*
   surface (the real surface is noisy enough that D8 on it leaves pits).
4. **Flow accumulation.** Cells are visited in decreasing filled height; each pushes its
   accumulation to its downstream neighbour. Gives catchment size per cell.
5. **Erosion.**
   - Stream power: `E = K · A^m · S^n`, the standard incision law. Carves valleys along the
     drainage network and never below the base height.
   - Thermal (talus): material above the angle of repose slides to the steepest downhill
     neighbour. This is what keeps cliffs from looking like noise.
6. **Lakes.** A cell is a lake where the filled surface is above the real surface by more than a
   dead band, and the fill level is above sea level. Connected components are grouped; each lake
   gets the level of its highest member, so a basin has one flat surface.
7. **Rivers.** Cells with accumulation above a threshold that are not in a lake. Width and depth
   grow with the square root of accumulation. Each river cell also stores its flow direction, for
   Phase 5's currents.
8. **Moisture.** Advection along a prevailing wind. Each cell's moisture is blown downwind and
   accumulates; over a range the upwind side is wet and the lee side is dry — a rain shadow, which
   is the point of doing this instead of using the humidity noise.

### Determinism and caching

`RegionSim.sample` is a pure function of `(seed, regionIndex)`. A cached region equals a fresh
one; `RegionCache` is only a cache, and clearing it never changes a result. This is the
cross-cutting "determinism" rule.

## Seam continuity

The roadmap requires a spike first: 50 sampled seams with no breaks.

Two neighbouring regions do **not** have to agree cell for cell. A core ends where the next core
begins, 32 blocks apart, and those two cells legitimately differ by the terrain slope. What must not
happen is a step *larger than the terrain already has*. Measured on seed 1337:

| | median step | worst step |
|---|---|---|
| between ordinary adjacent cells inside a core | 1.23 m | 6.18 m (p99) |
| across a region seam | 1.01 m | 4.69 m |

The seam is smaller than ordinary terrain, so nothing can see it. This is stated as a test
("produces no visible step at a region boundary") rather than an equality, because equality is the
wrong requirement and chasing it produces margin sizes nobody can afford.

Exact agreement *is* impossible in principle: a river's catchment has no bounded upstream reach, so
no finite margin fully contains it. The 32-cell margin bounds the error in practice.

## Blocks, not just the coarse grid

The coarse grid is 9.6 m per cell, so the block-resolution pass still runs the 3D detail noise.
That noise has an amplitude of up to 22 m — far more than a river channel is deep — so left alone
it fills every channel back in with rock and **no river is ever visible**. The generator damps the
noise to 20% inside channels and 35% inside lakes, which is what lets the water show while keeping
some bumpiness. This was found by generating a real chunk, not by reading the code.

Channels and basins also read the *nearest* coarse cell's height rather than a bilinear blend.
Interpolating across a lake pulls the bed up toward its banks and drains it; interpolating across a
channel fills the trough back in. Open ground still interpolates, because it is smooth.

## Results

On seed 1337, one region: 1003 river cells (2.7% of the grid), 306 lake cells (0.8%), surface from
−139 m to +152 m, moisture 0.48 to 1.00. Simulation costs 162 ms per region, amortised over the
1228 m the region covers — several times the 600 m view distance.

## Acceptance

- `npm run check` passes (415 tests).
- No cell is a pit: every cell's filled height has a strictly lower neighbour, except the outlets
  at the grid edge. Verified on noise, which is full of noise-scale pits before filling.
- Catchment is conserved: every cell's flow reaches an outlet exactly once.
- Lakes have one level per basin, taken at the basin's spill point.
- A river's water level never rises along its drainage chain, and the chain ends at the sea.
- A generated chunk shows water over a sand bed inside a river channel.
- The seam step is within the terrain's own adjacent-cell range.

