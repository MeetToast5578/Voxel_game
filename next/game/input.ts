
export type Action = 'fly' | 'break' | 'place' | 'pick' | 'slotNext' | 'slotPrev' | 'time' | 'viewUp' | 'viewDown' | 'inventory' | 'debug' |
  'undo' | 'redo' | 'fill' | 'clear' | 'drop';

const KEY_ACTIONS: Record<string, Action> = {
  KeyF: 'fly', KeyT: 'time', Equal: 'viewUp', Minus: 'viewDown', KeyE: 'inventory', F3: 'debug', KeyB: 'fill', KeyG: 'clear', KeyQ: 'drop',
};
const DEADZONE = 0.15;
const STICK_LOOK = 2.6; // radians per second at full right-stick deflection

/**
 * Keyboard, mouse and gamepad folded into one state the game reads each tick: held axes and buttons, look deltas,
 * and edge-triggered actions taken with `consume`.
 */
export class Input {
  moveX = 0;
  moveZ = 0;
  lookYaw = 0;
  lookPitch = 0;
  jump = false;
  sprint = false;
  descend = false;
  breakHeld = false;
  placeHeld = false;
  /** Hotbar slot picked with a number key this frame, or -1. */
  slot = -1;
  private readonly keys = new Set<string>();
  private readonly actions = new Set<Action>();
  private padButtons: boolean[] = [];
  private padBreak = false;
  private padPlace = false;

  constructor(private readonly canvas: HTMLCanvasElement, public sensitivity: number) {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'F3') e.preventDefault();
      this.keys.add(e.code);
      // Ctrl+Z undoes and Ctrl+Y (or Ctrl+Shift+Z) redoes; otherwise keys map to actions directly.
      if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyZ' || e.code === 'KeyY')) {
        e.preventDefault();
        this.actions.add(e.code === 'KeyY' || e.shiftKey ? 'redo' : 'undo');
        return;
      }
      const action = KEY_ACTIONS[e.code];
      if (action) this.actions.add(action);
      if (/^Digit[1-9]$/.test(e.code)) this.slot = Number(e.code.slice(5)) - 1;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('click', () => {
      if (document.pointerLockElement !== canvas && this.canLock()) canvas.requestPointerLock();
    });
    canvas.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement !== canvas) return;
      if (e.button === 0) { this.breakHeld = true; this.actions.add('break'); }
      if (e.button === 2) { this.placeHeld = true; this.actions.add('place'); }
      if (e.button === 1) this.actions.add('pick');
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.breakHeld = false;
      if (e.button === 2) this.placeHeld = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('wheel', (e) => {
      if (document.pointerLockElement === canvas) this.actions.add(e.deltaY > 0 ? 'slotNext' : 'slotPrev');
    });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      this.lookYaw -= e.movementX * this.sensitivity;
      this.lookPitch -= e.movementY * this.sensitivity;
    });
  }

  /** Whether a click on the game may capture the pointer (not while a screen is open). */
  canLock: () => boolean = () => true;

  /** Reads the keyboard and the first gamepad into the held state. Call once per frame. */
  poll(dt: number): void {
    const k = this.keys;
    this.moveZ = Math.max(-1, Math.min(1, (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0) + this.stickZ));
    this.moveX = Math.max(-1, Math.min(1, (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) + this.stickX));
    this.jump = k.has('Space');
    this.descend = k.has('ShiftLeft') || k.has('ShiftRight');
    this.sprint = k.has('ControlLeft') || k.has('ControlRight');
    const pad = navigator.getGamepads?.().find((p) => p?.connected);
    if (!pad) return;
    const axis = (i: number) => (Math.abs(pad.axes[i] ?? 0) > DEADZONE ? pad.axes[i]! : 0);
    const button = (i: number) => pad.buttons[i]?.pressed ?? false;
    const pressed = (i: number) => button(i) && !this.padButtons[i];
    this.moveX = Math.max(-1, Math.min(1, this.moveX + axis(0)));
    this.moveZ = Math.max(-1, Math.min(1, this.moveZ - axis(1)));
    this.lookYaw -= axis(2) * STICK_LOOK * dt;
    this.lookPitch -= axis(3) * STICK_LOOK * dt;
    this.jump ||= button(0);
    this.descend ||= button(1);
    this.sprint ||= button(10);
    if (pressed(3)) this.actions.add('fly');
    if (pressed(2)) this.actions.add('inventory');
    if (pressed(4)) this.actions.add('slotPrev');
    if (pressed(5)) this.actions.add('slotNext');
    if (pressed(7)) this.actions.add('break');
    if (pressed(6)) this.actions.add('place');
    this.padBreak = button(7);
    this.padPlace = button(6);
    this.padButtons = pad.buttons.map((b) => b.pressed);
  }

  get breaking(): boolean {
    return this.breakHeld || this.padBreak;
  }

  get placing(): boolean {
    return this.placeHeld || this.padPlace;
  }

  /** Whether `action` happened since it was last consumed. */
  consume(action: Action): boolean {
    return this.actions.delete(action);
  }

  /** Look movement since the last call. */
  takeLook(): [number, number] {
    const out: [number, number] = [this.lookYaw, this.lookPitch];
    this.lookYaw = 0;
    this.lookPitch = 0;
    return out;
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  /** Touch screens have no pointer lock: the on-screen controls set whether the game is being played. */
  touch = false;
  touchPlaying = false;

  /** The game takes input: the pointer is captured, or touch play is on. */
  get playing(): boolean {
    return this.locked || (this.touch && this.touchPlaying);
  }

  /** Starts play: captures the pointer, or on touch screens just resumes. */
  start(): void {
    if (this.touch) this.touchPlaying = true;
    else this.canvas.requestPointerLock();
  }

  /** Stops play (a screen or menu opens). */
  stop(): void {
    if (this.touch) this.touchPlaying = false;
    else document.exitPointerLock();
  }

  // Virtual controls (touch).
  setKey(code: string, down: boolean): void {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  press(action: Action): void {
    this.actions.add(action);
  }

  setButton(which: 'break' | 'place', down: boolean): void {
    if (which === 'break') this.breakHeld = down;
    else this.placeHeld = down;
    if (down) this.actions.add(which);
  }

  addLook(dx: number, dy: number): void {
    this.lookYaw -= dx * this.sensitivity;
    this.lookPitch -= dy * this.sensitivity;
  }

  /** Stick input in [-1, 1] on both axes, added to the keys. */
  stickX = 0;
  stickZ = 0;
}
