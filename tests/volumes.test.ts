import { describe, expect, it } from 'vitest';
import { VOLUME_MAX_SIZE } from '../src/config';
import { BuildTool, cornerFor, frameFor } from '../src/player/buildTool';
import type { RaycastHit } from '../src/player/raycast';
import { BlockId } from '../src/world/blocks';
import {
  boundsOf,
  boxCells,
  clampSize,
  effectiveThickness,
  planeCells,
  rayPlaneHit,
  rectBox,
  sphereCells,
  volumeBox,
} from '../src/player/volumes';

const hit = (x: number, y: number, z: number, nx: number, ny: number, nz: number): RaycastHit => ({
  x,
  y,
  z,
  nx,
  ny,
  nz,
  distance: 1,
});

describe('volume geometry', () => {
  it('caps the thickness so the cavity keeps at least one block', () => {
    expect(effectiveThickness(1, 5)).toBe(0);
    expect(effectiveThickness(3, 5)).toBe(1);
    expect(effectiveThickness(5, 2)).toBe(2);
    expect(effectiveThickness(6, 9)).toBe(2);
    expect(effectiveThickness(5, 0)).toBe(0);
  });

  it('clamps sizes to 1 .. VOLUME_MAX_SIZE', () => {
    expect(clampSize(0)).toBe(1);
    expect(clampSize(VOLUME_MAX_SIZE + 10)).toBe(VOLUME_MAX_SIZE);
    expect(clampSize(3.4)).toBe(3);
  });

  it('centres a volume on its cell; even sizes reach one block further negative', () => {
    expect(volumeBox({ x: 0, y: 0, z: 0 }, 3)).toEqual({ min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } });
    expect(volumeBox({ x: 0, y: 0, z: 0 }, 2)).toEqual({ min: { x: -1, y: -1, z: -1 }, max: { x: 0, y: 0, z: 0 } });
  });

  it('counts box cells solid and as shells at several thicknesses', () => {
    const box3 = volumeBox({ x: 0, y: 0, z: 0 }, 3);
    const box5 = volumeBox({ x: 0, y: 0, z: 0 }, 5);
    expect(boxCells(box3)).toHaveLength(27);
    expect(boxCells(box3, 1)).toHaveLength(26);
    expect(boxCells(box5)).toHaveLength(125);
    expect(boxCells(box5, 1)).toHaveLength(125 - 27);
    // Thickness 2 on size 5 leaves a one-block cavity.
    expect(boxCells(box5, effectiveThickness(5, 2))).toHaveLength(124);
  });

  it('counts sphere cells: solid, and a one-block-cavity shell', () => {
    // Size 3: the centre cell plus 6 face and 12 edge neighbours (corners are farther than the radius 1.5).
    expect(sphereCells(volumeBox({ x: 0, y: 0, z: 0 }, 3))).toHaveLength(19);
    expect(sphereCells(volumeBox({ x: 0, y: 0, z: 0 }, 3), 1)).toHaveLength(18);
    // Size 5: all cells with squared offset at most 6.25, which is 81 cells.
    expect(sphereCells(volumeBox({ x: 0, y: 0, z: 0 }, 5))).toHaveLength(81);
  });

  it('makes a flat layer: a square or a disc, several cells deep', () => {
    const base = { x: 0, y: 0, z: 0 };
    expect(planeCells(base, 1, 1, 3, 1, false)).toHaveLength(9);
    expect(planeCells(base, 1, 1, 5, 1, false)).toHaveLength(25);
    expect(planeCells(base, 1, 1, 5, 1, true)).toHaveLength(21);
    expect(planeCells(base, 1, 1, 3, 2, false)).toHaveLength(18);
    // The layer lies in the plane y = 0 when its normal is y and it grows upward from base.
    expect(planeCells(base, 1, 1, 3, 1, false).every((c) => c.y === 0)).toBe(true);
    // A vertical plane across x grows along +x from base.
    expect(planeCells(base, 0, 1, 3, 2, false).every((c) => c.x >= 0 && c.x <= 1)).toBe(true);
  });

  it('spans a rectangle between two cells, several cells deep along the normal', () => {
    const flat = rectBox({ x: 0, y: 0, z: 0 }, { x: 4, y: 3, z: 9 }, 1, 1, 1);
    expect(boxCells(flat)).toHaveLength(5 * 1 * 10);
    const wall = rectBox({ x: 0, y: 0, z: 0 }, { x: 7, y: 3, z: 5 }, 0, 1, 2);
    expect(wall.min).toEqual({ x: 0, y: 0, z: 0 });
    expect(wall.max).toEqual({ x: 1, y: 3, z: 5 });
    expect(boxCells(wall)).toHaveLength(2 * 4 * 6);
  });

  it('finds where a ray crosses a plane, and refuses parallel rays and crossings behind the origin', () => {
    expect(rayPlaneHit({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 2, 5)).toEqual({ x: 0, y: 0, z: 5 });
    expect(rayPlaneHit({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 2, 5)).toBeNull();
    expect(rayPlaneHit({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 2, -5)).toBeNull();
  });

  it('bounds some cells', () => {
    expect(boundsOf([])).toBeNull();
    expect(boundsOf([{ x: 1, y: 2, z: 3 }, { x: -1, y: 0, z: 5 }])).toEqual({ min: { x: -1, y: 0, z: 3 }, max: { x: 1, y: 2, z: 5 } });
  });
});

describe('build tool', () => {
  it('cycles modes and kinds, and a kind change drops a half-placed wall', () => {
    const tool = new BuildTool();
    expect(tool.mode).toBe('single');
    tool.cycleMode();
    expect(tool.mode).toBe('add');
    tool.cycleMode();
    tool.cycleMode();
    expect(tool.mode).toBe('single');
    tool.kind = 'wall';
    tool.frame = frameFor('wall', hit(0, 0, 0, 1, 0, 0), { x: 1, y: 0, z: 0 }, true);
    tool.cycleKind();
    expect(tool.kind).toBe('floor');
    expect(tool.frame).toBeNull();
  });

  it('keeps thickness in range for each kind', () => {
    const tool = new BuildTool();
    tool.adjustThickness(-1);
    expect(tool.thickness).toBe(0);
    tool.adjustThickness(100);
    expect(tool.thickness).toBeLessThanOrEqual(16);
    tool.thickness = 0;
    tool.toggleHollow();
    expect(tool.depth).toBe(1);
    tool.toggleHollow();
    expect(tool.depth).toBe(0);
    tool.kind = 'wall';
    tool.thickness = 0;
    expect(tool.depth).toBe(1);
    tool.adjustThickness(-5);
    expect(tool.thickness).toBe(1);
  });

  it('adds a box on the far side of the aimed face and removes one centred on the aimed block', () => {
    const tool = new BuildTool();
    tool.size = 3;
    const east = hit(0, 0, 0, 1, 0, 0);
    expect(boundsOf(tool.cellsAt(east, true))).toEqual({ min: { x: 1, y: -1, z: -1 }, max: { x: 3, y: 1, z: 1 } });
    expect(boundsOf(tool.cellsAt(east, false))).toEqual({ min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } });
  });

  it('adds a box whose near face touches the aimed face even when the face points the other way', () => {
    const tool = new BuildTool();
    tool.size = 4;
    const west = hit(0, 0, 0, -1, 0, 0);
    // Even size 4 reaches 2 blocks toward -x and 1 toward +x, so the far side is one block short of the aimed cell.
    expect(boundsOf(tool.cellsAt(west, true))?.max.x).toBe(-1);
  });

  it('places a plane on the aimed top face and a wall on the aimed side face', () => {
    const tool = new BuildTool();
    tool.kind = 'plane';
    tool.size = 3;
    const top = tool.cellsAt(hit(0, 0, 0, 0, 1, 0), true);
    expect(top).toHaveLength(9);
    expect(top.every((c) => c.y === 1)).toBe(true);

    const wall = frameFor('wall', hit(0, 0, 0, 1, 0, 0), { x: 1, y: 0, z: 0 }, true);
    expect(wall).toEqual({ base: { x: 1, y: 0, z: 0 }, normal: 0, dir: 1 });
    const dig = frameFor('wall', hit(0, 0, 0, 1, 0, 0), { x: 1, y: 0, z: 0 }, false);
    expect(dig).toEqual({ base: { x: 0, y: 0, z: 0 }, normal: 0, dir: -1 });
  });

  it('grows a floor up from the aimed top face, and down from a ceiling', () => {
    expect(frameFor('floor', hit(0, 0, 0, 0, 1, 0), { x: 0, y: 0, z: 1 }, true)).toEqual({ base: { x: 0, y: 1, z: 0 }, normal: 1, dir: 1 });
    expect(frameFor('floor', hit(0, 5, 0, 0, -1, 0), { x: 0, y: 0, z: 1 }, true)).toEqual({ base: { x: 0, y: 4, z: 0 }, normal: 1, dir: -1 });
  });

  it('finds the far corner where the look ray crosses the wall plane, clamped to the size limit', () => {
    const frame = { base: { x: 0, y: 0, z: 0 }, normal: 0 as const, dir: 1 as const };
    // The plane is x = 0.5. The ray from (-3, 2.5, 0.5) along +x crosses it at y = 2.5, z = 0.5.
    expect(cornerFor(frame, { x: -3, y: 2.5, z: 0.5 }, { x: 1, y: 0, z: 0 })).toEqual({ x: 0, y: 2, z: 0 });
    // Looking along the plane gives no corner.
    expect(cornerFor(frame, { x: -3, y: 2.5, z: 0.5 }, { x: 0, y: 1, z: 0 })).toBeNull();
    // A corner far away is clamped to the size limit.
    const far = cornerFor(frame, { x: -3, y: 500.5, z: 0.5 }, { x: 1, y: 0.001, z: 0 });
    expect(far!.y).toBe(VOLUME_MAX_SIZE - 1);
  });

  it('builds a wall solid between its base and corner, its width deep', () => {
    const tool = new BuildTool();
    tool.kind = 'wall';
    tool.thickness = 1;
    tool.frame = { base: { x: 0, y: 0, z: 0 }, normal: 0, dir: 1 };
    const cells = tool.cellsBetween({ x: 0, y: 2, z: 3 });
    expect(cells).toHaveLength(1 * 3 * 4);
  });

  it('describes the tool for the HUD', () => {
    const tool = new BuildTool();
    expect(tool.describe()).toBe('Single block');
    tool.mode = 'add';
    tool.size = 6;
    tool.thickness = 1;
    tool.kind = 'sphere';
    expect(tool.describe()).toBe('Add · Sphere · 1.8 m · shell 0.3 m');
  });

  it('flattens the ground under the footprint to the aimed height', () => {
    const tool = new BuildTool();
    tool.kind = 'flatten';
    tool.size = 3;
    const aimed = hit(0, 2, 0, 0, 1, 0);
    // Ground at 0 everywhere, except the centre column, which rises to 4.
    const cells = tool.cellsFlatten(aimed, (x, z) => (x === 0 && z === 0 ? 4 : 0), BlockId.STONE);
    const fills = cells.filter((c) => !c.clear);
    const clears = cells.filter((c) => c.clear);
    // Eight columns are filled at y = 1 and 2; the centre column is cleared at y = 3 and 4.
    expect(fills).toHaveLength(16);
    expect(fills.every((c) => c.id === BlockId.STONE && c.y >= 1 && c.y <= 2)).toBe(true);
    expect(clears).toHaveLength(2);
    expect(clears.every((c) => c.x === 0 && c.z === 0 && c.id === BlockId.AIR)).toBe(true);
  });

  it('skips columns that are not loaded, columns too far from the height, and air fills', () => {
    const tool = new BuildTool();
    tool.kind = 'flatten';
    tool.size = 3;
    const aimed = hit(0, 2, 0, 0, 1, 0);
    expect(tool.cellsFlatten(aimed, (x) => (x === 1 ? undefined : 0), BlockId.STONE).filter((c) => c.x === 1)).toEqual([]);
    expect(tool.cellsFlatten(aimed, () => 100, BlockId.STONE)).toEqual([]);
    expect(tool.cellsFlatten(aimed, () => 0, BlockId.AIR)).toEqual([]);
  });

  it('describes flatten by its size and outline', () => {
    const tool = new BuildTool();
    tool.mode = 'add';
    tool.kind = 'flatten';
    tool.size = 3;
    expect(tool.describe()).toBe('Flatten · 0.9 m · square');
  });
});
