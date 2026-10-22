/**
 * Collects keyboard and mouse state. Keys are identified by KeyboardEvent.code
 * ('KeyW', 'Space', 'ShiftLeft', 'Digit1', 'F3', ...), which does not depend on keyboard layout.
 * Mouse movement, clicks and the wheel are only recorded while the pointer is locked to the canvas.
 */
export class Input {
  private readonly keysDown = new Set<string>();
  private readonly keysPressed = new Set<string>();
  private readonly shortcuts = new Map<string, boolean>();
  private readonly buttonsDown = new Set<number>();
  private readonly buttonsClicked = new Set<number>();
  private mouseDx = 0;
  private mouseDy = 0;
  private wheelSteps = 0;
  private readonly lockListeners: ((locked: boolean) => void)[] = [];
  private readonly lockFailedListeners: (() => void)[] = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('wheel', this.onWheel, { passive: false });
    document.addEventListener('contextmenu', this.onContextMenu);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  /**
   * Must be called from a user gesture (click). A refusal goes to the onPointerLockFailed listeners, so the menu can say
   * why nothing happened.
   */
  requestPointerLock(): void {
    try {
      const result: Promise<void> | undefined = this.canvas.requestPointerLock();
      result?.catch(() => this.emitLockFailed());
    } catch {
      this.emitLockFailed(); // older browsers throw instead of rejecting
    }
  }

  onPointerLockFailed(listener: () => void): void {
    this.lockFailedListeners.push(listener);
  }

  private emitLockFailed(): void {
    for (const listener of this.lockFailedListeners) listener();
  }

  /** Frees the pointer, e.g. to use the inventory screen. The pause menu does not show for this (spec 24). */
  releasePointerLock(): void {
    if (this.pointerLocked) document.exitPointerLock();
  }

  /** Test hook (debug API): presses or releases a mouse button as if the pointer were locked. */
  simulateButton(button: number, down: boolean): void {
    if (down) {
      this.buttonsDown.add(button);
      this.buttonsClicked.add(button);
    } else {
      this.buttonsDown.delete(button);
    }
  }

  onPointerLockChanged(listener: (locked: boolean) => void): void {
    this.lockListeners.push(listener);
  }

  isDown(code: string): boolean {
    return this.keysDown.has(code);
  }

  /** True once per physical key press (key repeat is ignored). */
  consumePressed(code: string): boolean {
    this.shortcuts.delete(code);
    return this.keysPressed.delete(code);
  }

  /** Capture modifiers at keydown: a quick chord can be released before the next game step. */
  consumeShortcut(code: string, shift = false): boolean {
    if (!this.shortcuts.has(code) || this.shortcuts.get(code) !== shift) return false;
    this.shortcuts.delete(code); this.keysPressed.delete(code);
    return true;
  }

  isMouseDown(button: number): boolean {
    return this.buttonsDown.has(button);
  }

  /** True once per mouse button press. 0 = left, 1 = middle, 2 = right. */
  consumeClick(button: number): boolean {
    return this.buttonsClicked.delete(button);
  }

  /** Mouse movement in pixels since the last call. */
  consumeMouseDelta(): { dx: number; dy: number } {
    const d = { dx: this.mouseDx, dy: this.mouseDy };
    this.mouseDx = 0;
    this.mouseDy = 0;
    return d;
  }

  /** Wheel notches since the last call: positive = scrolled down. */
  consumeWheel(): number {
    const w = this.wheelSteps;
    this.wheelSteps = 0;
    return w;
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (this.pointerLocked || e.code === 'F3') e.preventDefault();
    if (!e.repeat) {
      this.keysPressed.add(e.code);
      if (e.ctrlKey || e.metaKey) this.shortcuts.set(e.code, e.shiftKey);
    }
    this.keysDown.add(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keysDown.delete(e.code);
  };

  private readonly onBlur = (): void => {
    // Without this, keys held while the window loses focus stay "down" forever.
    this.keysDown.clear();
    this.keysPressed.clear(); this.shortcuts.clear();
    this.buttonsDown.clear(); this.buttonsClicked.clear();
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    if (!this.pointerLocked) return;
    this.mouseDx += e.movementX;
    this.mouseDy += e.movementY;
  };

  private readonly onMouseDown = (e: MouseEvent): void => {
    if (!this.pointerLocked) return;
    e.preventDefault();
    this.buttonsDown.add(e.button);
    this.buttonsClicked.add(e.button);
  };

  private readonly onMouseUp = (e: MouseEvent): void => {
    this.buttonsDown.delete(e.button);
  };

  private readonly onWheel = (e: WheelEvent): void => {
    if (!this.pointerLocked) return;
    e.preventDefault();
    this.wheelSteps += Math.sign(e.deltaY);
  };

  private readonly onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  private readonly onPointerLockChange = (): void => {
    const locked = this.pointerLocked;
    this.shortcuts.clear(); this.keysPressed.clear();
    if (!locked) {
      this.keysDown.clear();
      this.keysPressed.clear();
      this.buttonsDown.clear();
      this.buttonsClicked.clear();
    }
    for (const listener of this.lockListeners) listener(locked);
  };
}
