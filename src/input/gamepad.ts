import type { Input } from './input';

/** The part of Input a gamepad drives. */
export type VirtualInput = Pick<Input, 'setVirtualKey' | 'setVirtualButton' | 'addLook' | 'addWheel'>;

/** Standard-mapping buttons (https://w3c.github.io/gamepad/#remapping) and what each does (T-K6). */
const KEY_BUTTONS: readonly [button: number, code: string][] = [
  [0, 'Space'], // A: jump, swim up, fly up
  [1, 'ShiftLeft'], // B: crouch, fly down
  [2, 'KeyF'], // X: fly
  [3, 'KeyE'], // Y: inventory
  [10, 'ControlLeft'], // left stick press: sprint
];
const MOUSE_BUTTONS: readonly [button: number, mouse: number][] = [[7, 0], [6, 2], [11, 1]]; // RT break, LT place, right stick pick
const START = 9;
const DEAD_ZONE = 0.3;
/** Look speed at full right-stick tilt, in mouse pixels per second. */
const LOOK_PX_S = 900;

/** Reads the first connected gamepad each frame and feeds it to Input as keys, buttons and look movement (T-K6). */
export class GamepadInput {
  private held = new Set<string>();
  private heldButtons = new Set<number>();
  private wasDown = new Set<number>();
  /** True once a gamepad has been used, so the game may run without pointer capture. */
  used = false;

  constructor(private readonly input: VirtualInput, private readonly pads: () => readonly (Gamepad | null)[] = () => navigator.getGamepads?.() ?? []) {}

  /** Polls the pad. Returns true on the frame Start is pressed (the game pauses or resumes). */
  poll(dt: number): boolean {
    const pad = this.pads().find((p): p is Gamepad => !!p && p.connected);
    if (!pad) return false;
    const down = (b: number) => !!pad.buttons[b]?.pressed;
    const [lx = 0, ly = 0, rx = 0, ry = 0] = pad.axes;
    const keys = new Set<string>();
    for (const [b, code] of KEY_BUTTONS) if (down(b)) keys.add(code);
    if (ly < -DEAD_ZONE) keys.add('KeyW');
    if (ly > DEAD_ZONE) keys.add('KeyS');
    if (lx < -DEAD_ZONE) keys.add('KeyA');
    if (lx > DEAD_ZONE) keys.add('KeyD');
    for (const code of keys) if (!this.held.has(code)) this.input.setVirtualKey(code, true);
    for (const code of this.held) if (!keys.has(code)) this.input.setVirtualKey(code, false);
    this.held = keys;
    const buttons = new Set(MOUSE_BUTTONS.filter(([b]) => down(b)).map(([, m]) => m));
    for (const m of buttons) if (!this.heldButtons.has(m)) this.input.setVirtualButton(m, true);
    for (const m of this.heldButtons) if (!buttons.has(m)) this.input.setVirtualButton(m, false);
    this.heldButtons = buttons;
    // Squared response: fine aim near the centre, quick turns at full tilt.
    const look = (v: number) => (Math.abs(v) < DEAD_ZONE / 2 ? 0 : Math.sign(v) * v * v * LOOK_PX_S * dt);
    this.input.addLook(look(rx), look(ry));
    const pressed = (b: number) => down(b) && !this.wasDown.has(b);
    if (pressed(4)) this.input.addWheel(-1); // LB: previous slot
    if (pressed(5)) this.input.addWheel(1); // RB: next slot
    const start = pressed(START);
    this.wasDown = new Set(pad.buttons.map((b, i) => (b.pressed ? i : -1)).filter((i) => i >= 0));
    if (keys.size || buttons.size || this.wasDown.size || Math.abs(rx) > DEAD_ZONE || Math.abs(ry) > DEAD_ZONE) this.used = true;
    return start;
  }
}
