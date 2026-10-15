export interface Cell {
  x: number;
  y: number;
  z: number;
}

const STAGES = 10; // crack textures, 0 to 9

function sameCell(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

/**
 * Mining progress for the block under the crosshair. A block takes `hardness` seconds to break while the button is
 * held on it. Pure: the game calls update() once per frame.
 */
export class BlockBreaking {
  private cell: Cell | null = null;
  private progress = 0;

  /** The block being broken, or null. */
  get target(): Cell | null {
    return this.cell;
  }

  /** Crack stage 0..9 of the block being broken, or -1 when nothing is being broken. */
  get stage(): number {
    return this.cell ? Math.min(STAGES - 1, Math.floor(this.progress * STAGES)) : -1;
  }

  /**
   * Advances mining by dt seconds. `hardness` is the seconds the target takes to break, or null when it cannot be
   * broken. Moving to another cell, or letting go, starts again. Returns the cell that broke this frame, or null.
   */
  update(dt: number, holding: boolean, target: Cell | null, hardness: number | null): Cell | null {
    if (!holding || !target || hardness === null) {
      this.reset();
      return null;
    }
    if (!this.cell || !sameCell(this.cell, target)) {
      this.cell = { ...target };
      this.progress = 0;
    }
    if (hardness <= 0) return this.finish();
    this.progress += dt / hardness;
    return this.progress >= 1 ? this.finish() : null;
  }

  private finish(): Cell {
    const cell = this.cell!;
    this.reset();
    return cell;
  }

  private reset(): void {
    this.cell = null;
    this.progress = 0;
  }
}
