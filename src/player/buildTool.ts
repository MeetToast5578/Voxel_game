import { BLOCK_SIZE_M, UNDO_LIMIT, VOLUME_DEFAULT_SIZE, VOLUME_MAX_SIZE, VOLUME_MAX_THICKNESS } from '../config';
import { BlockId } from '../world/blocks';
import type { EditCell } from '../world/editQueue';
import type { Vec3 } from './physics';
import type { RaycastHit } from './raycast';
import {
  type Axis,
  type Box,
  type Cell,
  boxCells,
  clampSize,
  coordOf,
  effectiveThickness,
  inPlaneAxes,
  planeCells,
  rayPlaneHit,
  rectBox,
  sphereCells,
  volumeBox,
  withCoord,
} from './volumes';

export type ToolKind = 'box' | 'sphere' | 'plane' | 'wall' | 'floor' | 'roof' | 'flatten';
/** single: today's one-block breaking and placing. add and remove: the volume tools. */
export type ToolMode = 'single' | 'add' | 'remove';

const KINDS: readonly ToolKind[] = ['box', 'sphere', 'plane', 'wall', 'floor', 'roof', 'flatten'];
const MODES: readonly ToolMode[] = ['single', 'add', 'remove'];
const NAMES: Record<ToolKind, string> = {
  box: 'Box',
  sphere: 'Sphere',
  plane: 'Plane',
  wall: 'Wall',
  floor: 'Floor',
  roof: 'Roof',
  flatten: 'Flatten',
};

/** One row of the tool panel on screen: what it is, and its current value (or "not used" when this tool ignores it). */
export interface ToolRow {
  label: string;
  value: string;
  /** True when the tool ignores this row, so the panel can grey it out. */
  unused: boolean;
}

/** What the HUD needs beyond the tool's own state. */
export interface ToolContext {
  /** Blocks the current action would change, or null when nothing is aimed. */
  preview: number | null;
  /** The block that add fills with (the selected hotbar block), by name. */
  block: string;
  /** Undo steps available. */
  undo: number;
  redo?: number;
}

/** Where a two-click wall or floor starts: the cell of its first corner, its normal axis and the way it grows. */
export interface Frame {
  base: Cell;
  normal: Axis;
  dir: 1 | -1;
}

/** The face that was hit, as an axis and the sign of its outward normal (which points back at the player). */
function faceOf(hit: RaycastHit): { axis: Axis; sign: 1 | -1 } {
  if (hit.nx !== 0) return { axis: 0, sign: hit.nx > 0 ? 1 : -1 };
  if (hit.ny !== 0) return { axis: 1, sign: hit.ny > 0 ? 1 : -1 };
  return { axis: 2, sign: hit.nz > 0 ? 1 : -1 };
}

/**
 * The first corner and growth direction of a two-click wall or floor. Add grows out of the aimed face. Remove grows
 * into the aimed block. A floor is always horizontal, and a wall always vertical. A wall on a top or bottom face takes
 * its direction from the look.
 */
export function frameFor(kind: ToolKind, hit: RaycastHit, look: Vec3, add: boolean): Frame {
  const hitCell: Cell = { x: hit.x, y: hit.y, z: hit.z };
  const face = faceOf(hit);
  // A roof is a horizontal layer built upward: add starts just above the aimed block, remove clears from it upward.
  if (kind === 'roof') return { base: withCoord(hitCell, 1, hit.y + (add ? 1 : 0)), normal: 1, dir: 1 };
  if (kind === 'floor') {
    const vertical = face.axis === 1;
    const step = vertical ? face.sign : 1;
    return {
      base: add ? withCoord(hitCell, 1, hit.y + step) : hitCell,
      normal: 1,
      dir: add ? (step as 1 | -1) : (-step as 1 | -1),
    };
  }
  const horizontal: Axis = face.axis === 1 ? (Math.abs(look.x) >= Math.abs(look.z) ? 0 : 2) : face.axis;
  const sign: 1 | -1 = face.axis === 1 ? (coordOf(look, horizontal) >= 0 ? 1 : -1) : face.sign;
  const base = add ? withCoord(hitCell, face.axis, coordOf(hitCell, face.axis) + face.sign) : hitCell;
  return { base, normal: horizontal, dir: add ? sign : (-sign as 1 | -1) };
}

/**
 * The far corner of a two-click frame: where the look ray crosses the frame's plane, clamped to the size limit. Null
 * when the ray is parallel to the plane or points away from it.
 */
export function cornerFor(frame: Frame, eye: Vec3, look: Vec3): Cell | null {
  const p = rayPlaneHit(eye, look, frame.normal, coordOf(frame.base, frame.normal) + 0.5);
  if (!p) return null;
  let corner: Cell = { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) };
  for (const a of inPlaneAxes(frame.normal)) {
    const d = coordOf(corner, a) - coordOf(frame.base, a);
    const limited = Math.max(-(VOLUME_MAX_SIZE - 1), Math.min(VOLUME_MAX_SIZE - 1, d));
    corner = withCoord(corner, a, coordOf(frame.base, a) + limited);
  }
  return corner;
}

function next<T>(list: readonly T[], value: T): T {
  return list[(list.indexOf(value) + 1) % list.length]!;
}

function metres(blocks: number): string {
  return `${(blocks * BLOCK_SIZE_M).toFixed(1)} m`;
}

/**
 * The state of the volumetric build tools: which tool, add or remove, the size and thickness, and the first corner of
 * a two-click wall or floor. Pure. The game turns the aimed face into cells with the methods below.
 */
export class BuildTool {
  mode: ToolMode = 'single';
  kind: ToolKind = 'box';
  size = VOLUME_DEFAULT_SIZE;
  /** Box and sphere: 0 is solid. Plane, wall and floor: the depth or width, at least 1. */
  thickness = 0;
  /** Plane outline: false is a square, true is a disc. */
  disc = false;
  /** The first corner of a two-click wall or floor, or null before the first click. */
  frame: Frame | null = null;

  get twoClick(): boolean {
    return this.kind === 'wall' || this.kind === 'floor' || this.kind === 'roof';
  }

  /** The depth in blocks that the current tool uses: a shell thickness for box and sphere, a depth for the rest. */
  get depth(): number {
    return this.kind === 'box' || this.kind === 'sphere'
      ? effectiveThickness(this.size, this.thickness)
      : Math.max(1, this.thickness);
  }

  cycleMode(): void {
    this.mode = next(MODES, this.mode);
    this.frame = null;
  }

  cycleKind(): void {
    this.kind = next(KINDS, this.kind);
    this.frame = null;
  }

  adjustSize(delta: number): void {
    this.size = clampSize(this.size + delta);
  }

  adjustThickness(delta: number): void {
    const min = this.kind === 'box' || this.kind === 'sphere' ? 0 : 1;
    this.thickness = Math.min(VOLUME_MAX_THICKNESS, Math.max(min, this.thickness + delta));
  }

  /** Box and sphere: switches between solid (0) and a one-block shell. */
  toggleHollow(): void {
    this.thickness = this.thickness === 0 ? 1 : 0;
  }

  toggleDisc(): void {
    this.disc = !this.disc;
  }

  cancelFrame(): void {
    this.frame = null;
  }

  /** Cells of a one-click volume (box, sphere or plane) for the aimed face. Empty for two-click tools. */
  cellsAt(hit: RaycastHit, add: boolean): Cell[] {
    const face = faceOf(hit);
    const hitCell: Cell = { x: hit.x, y: hit.y, z: hit.z };
    if (this.kind === 'box' || this.kind === 'sphere') {
      // Add: the volume's near side touches the aimed face from outside. Remove: it is centred on the aimed block.
      const below = Math.floor(this.size / 2);
      const above = this.size - 1 - below;
      const reach = face.sign > 0 ? below : above;
      const centre = add
        ? withCoord(hitCell, face.axis, coordOf(hitCell, face.axis) + face.sign * (1 + reach))
        : hitCell;
      const box = volumeBox(centre, this.size);
      return this.kind === 'box' ? boxCells(box, this.depth) : sphereCells(box, this.depth);
    }
    if (this.kind === 'plane') {
      const base = withCoord(hitCell, face.axis, coordOf(hitCell, face.axis) + (add ? face.sign : 0));
      return planeCells(base, face.axis, add ? face.sign : (-face.sign as 1 | -1), this.size, this.depth, this.disc);
    }
    return [];
  }

  /**
   * The footprint of a flatten at the aimed block: a square or a disc of the tool's size, on the aimed block's height.
   */
  footprint(hit: RaycastHit): Cell[] {
    return planeCells({ x: hit.x, y: hit.y, z: hit.z }, 1, 1, this.size, 1, this.disc);
  }

  /**
   * Cells that flatten the ground under the footprint to the aimed block's height. Air is filled up to that height with
   * `fill` (nothing is filled when fill is air), and blocks above it are cleared. A column whose top is more than
   * VOLUME_MAX_SIZE away from the height is left alone, which bounds the work. Columns outside loaded terrain are skipped.
   */
  cellsFlatten(hit: RaycastHit, topAt: (x: number, z: number) => number | undefined, fill: number): EditCell[] {
    const out: EditCell[] = [];
    for (const c of this.footprint(hit)) {
      const top = topAt(c.x, c.z);
      if (top === undefined || Math.abs(top - hit.y) > VOLUME_MAX_SIZE) continue;
      if (top < hit.y && fill !== BlockId.AIR) {
        for (let y = top + 1; y <= hit.y; y++) out.push({ x: c.x, y, z: c.z, id: fill, clear: false });
      } else if (top > hit.y) {
        for (let y = hit.y + 1; y <= top; y++) out.push({ x: c.x, y, z: c.z, id: BlockId.AIR, clear: true });
      }
    }
    return out;
  }

  /** Cells between the frame and a corner, filled solid. Empty when there is no frame. */
  cellsBetween(corner: Cell): Cell[] {
    const box = this.boxBetween(corner);
    return box ? boxCells(box) : [];
  }

  /** The box between the frame and a corner, or null when there is no frame. */
  boxBetween(corner: Cell): Box | null {
    if (!this.frame) return null;
    return rectBox(this.frame.base, corner, this.frame.normal, this.frame.dir, this.depth);
  }

  /** One line naming the shape and its settings, for example "Sphere 1.8 m, shell 0.3 m". Empty in single-block mode. */
  describe(): string {
    if (this.mode === 'single') return '';
    if (this.kind === 'flatten') return `Flatten ${metres(this.size)}, ${this.disc ? 'disc' : 'square'}`;
    if (this.kind === 'box' || this.kind === 'sphere') {
      return `${NAMES[this.kind]} ${metres(this.size)}, ${this.depth === 0 ? 'solid' : `shell ${metres(this.depth)}`}`;
    }
    if (this.kind === 'plane') return `Plane ${metres(this.size)}, ${this.disc ? 'disc' : 'square'}, thickness ${metres(this.depth)}`;
    return `${NAMES[this.kind]} width ${metres(this.depth)}`;
  }

  /**
   * Every setting the HUD shows, one row each, so the screen always says what is selected. Rows that this shape ignores
   * are marked unused. The context supplies the live numbers: the preview count, the block and the undo steps.
   */
  rows(ctx: ToolContext): ToolRow[] {
    const volume = this.kind === 'box' || this.kind === 'sphere';
    const single = this.mode === 'single';
    const modeName = single ? 'Single block' : this.mode === 'add' ? 'Add' : 'Remove';
    const thickness = volume
      ? this.thickness === 0
        ? 'solid'
        : this.depth === 0
          ? 'solid (the shell would leave no cavity)'
          : `shell ${metres(this.depth)}`
      : this.kind === 'plane'
        ? `${metres(this.depth)} deep`
        : this.kind === 'flatten'
          ? ''
          : `${metres(this.depth)} wide`;
    const outline = this.kind === 'plane' || this.kind === 'flatten' ? (this.disc ? 'disc' : 'square') : '';
    let frame = '';
    if (this.twoClick) frame = this.frame ? 'set the far corner (X or Esc cancels)' : 'click to set the first corner';
    return [
      { label: 'Mode', value: modeName, unused: false },
      { label: 'Shape', value: NAMES[this.kind], unused: single },
      { label: 'Size', value: `${metres(this.size)}, ${this.size} blocks per side`, unused: single },
      { label: 'Thickness', value: thickness || 'not used', unused: single || !(volume || this.kind === 'plane' || this.twoClick) },
      { label: 'Outline', value: outline || 'not used', unused: single || !outline },
      { label: 'Frame', value: frame || 'not used', unused: single || !this.twoClick },
      {
        label: 'Preview',
        value: ctx.preview === null ? 'nothing aimed' : `${ctx.preview.toLocaleString('en-US')} ${ctx.preview === 1 ? 'block' : 'blocks'}`,
        unused: false,
      },
      { label: 'Block', value: ctx.block, unused: this.mode !== 'add' },
      { label: 'Undo', value: `${ctx.undo} of ${UNDO_LIMIT} (Ctrl+Z)`, unused: false },
      { label: 'Redo', value: `${ctx.redo ?? 0} (Ctrl+Y / Ctrl+Shift+Z)`, unused: false },
    ];
  }
}
