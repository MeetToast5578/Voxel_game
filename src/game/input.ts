import { DEFAULT_KEYS, type Binding } from '../storage/settings';

export type Action = 'fly' | 'break' | 'place' | 'pick' | 'slotNext' | 'slotPrev' | 'time' | 'viewUp' | 'viewDown' | 'inventory' | 'debug' |
  'undo' | 'redo' | 'fill' | 'clear' | 'drop' | 'hint' | 'pause' | 'copy' | 'paste';

/** Bindings that fire an action when pressed (the others are held: movement, jump, crouch, sprint). */
const PRESS_ACTIONS = ['fly', 'time', 'viewUp', 'viewDown', 'inventory', 'debug', 'fill', 'clear', 'drop', 'hint', 'copy', 'paste'] as const satisfies readonly (Binding & Action)[];
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
  /** Look up moves the view down, and the other way round. */
  invertY = false;
  private keyMap: Record<Binding, string> = { ...DEFAULT_KEYS };
  private pressMap = new Map<string, Action>();

  constructor(private readonly canvas: HTMLCanvasElement, public sensitivity: number, keys: Record<Binding, string> = DEFAULT_KEYS) {
    this.bindings = keys;
    addEventListener('keydown', (e) => {
      this.padActive = false;
      if (e.repeat) return;
      if (e.code.startsWith('F') && this.pressMap.has(e.code)) e.preventDefault();
      this.keys.add(e.code);
      // Ctrl+Z undoes and Ctrl+Y (or Ctrl+Shift+Z) redoes; otherwise keys map to actions directly.
      if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyZ' || e.code === 'KeyY')) {
        e.preventDefault();
        this.actions.add(e.code === 'KeyY' || e.shiftKey ? 'redo' : 'undo');
        return;
      }
      const action = this.pressMap.get(e.code);
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
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) this.padActive = false;
      if (document.pointerLockElement !== canvas) return;
      this.lookYaw -= e.movementX * this.sensitivity;
      this.lookPitch -= e.movementY * this.sensitivity * (this.invertY ? -1 : 1);
    });
  }

  /** Which key does what (KeyboardEvent.code per binding). */
  get bindings(): Record<Binding, string> {
    return this.keyMap;
  }

  set bindings(keys: Record<Binding, string>) {
    this.keyMap = { ...keys };
    this.pressMap = new Map(PRESS_ACTIONS.map((a) => [keys[a], a]));
  }

  /** Whether the key bound to `b` is down; a left Shift, Ctrl or Alt binding also takes the right one. */
  private held(b: Binding): boolean {
    const code = this.keyMap[b];
    return this.keys.has(code) || (code.endsWith('Left') && this.keys.has(`${code.slice(0, -4)}Right`));
  }

  /** Whether a click on the game may capture the pointer (not while a screen is open). */
  canLock: () => boolean = () => true;

  /** Reads the keyboard and the first gamepad into the held state. Call once per frame. */
  poll(dt: number): void {
    const h = (b: Binding) => (this.held(b) ? 1 : 0);
    this.moveZ = Math.max(-1, Math.min(1, h('forward') - h('back') + this.stickZ));
    this.moveX = Math.max(-1, Math.min(1, h('right') - h('left') + this.stickX));
    this.jump = this.held('jump');
    this.descend = this.held('descend');
    this.sprint = this.held('sprint');
    const pad = navigator.getGamepads?.().find((p) => p?.connected);
    if (!pad) return;
    const axis = (i: number) => (Math.abs(pad.axes[i] ?? 0) > DEADZONE ? pad.axes[i]! : 0);
    const button = (i: number) => pad.buttons[i]?.pressed ?? false;
    const pressed = (i: number) => button(i) && !this.padButtons[i];
    if (pad.buttons.some((b, i) => b.pressed && !this.padButtons[i])) this.padActive = true;
    // In menus and screens the gamepad navigates them instead (ui/padMenu.ts).
    if (!this.playing) {
      this.padButtons = pad.buttons.map((b) => b.pressed);
      return;
    }
    this.moveX = Math.max(-1, Math.min(1, this.moveX + axis(0)));
    this.moveZ = Math.max(-1, Math.min(1, this.moveZ - axis(1)));
    this.lookYaw -= axis(2) * STICK_LOOK * dt;
    this.lookPitch -= axis(3) * STICK_LOOK * dt * (this.invertY ? -1 : 1);
    this.jump ||= button(0);
    this.descend ||= button(1);
    this.sprint ||= button(10);
    if (pressed(3)) this.actions.add('fly');
    if (pressed(2)) this.actions.add('inventory');
    if (pressed(4)) this.actions.add('slotPrev');
    if (pressed(5)) this.actions.add('slotNext');
    if (pressed(7)) this.actions.add('break');
    if (pressed(6)) this.actions.add('place');
    if (pressed(9)) this.actions.add('pause');
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

  /**
   * Touch screens have no pointer lock, and a gamepad needs none: then play is on or off without it. `padActive` is set
   * while the gamepad is being used (until the mouse or keyboard is).
   */
  touch = false;
  padActive = false;
  touchPlaying = false;

  private get free(): boolean {
    return this.touch || this.padActive;
  }

  /** The game takes input: the pointer is captured, or free play is on. */
  get playing(): boolean {
    return this.locked || (this.free && this.touchPlaying);
  }

  /** Starts play: captures the pointer, or with touch or a gamepad just resumes. */
  start(): void {
    if (this.free) this.touchPlaying = true;
    else this.canvas.requestPointerLock();
  }

  /** Stops play (a screen or menu opens). */
  stop(): void {
    this.touchPlaying = false;
    if (this.locked) document.exitPointerLock();
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
    this.lookPitch -= dy * this.sensitivity * (this.invertY ? -1 : 1);
  }

  /** Stick input in [-1, 1] on both axes, added to the keys. */
  stickX = 0;
  stickZ = 0;
}
