import type { Input } from '../input/input';
import { el } from './dom';

/** Stick travel, in pixels, that counts as fully pushed; past STICK_KEY of it a direction key is held. */
const STICK_RADIUS = 48;
const STICK_KEY = 0.35;
/** Look speed: mouse pixels per pixel dragged. */
const LOOK_GAIN = 2.5;

/** Keeps a touch's moves coming to `target` when it slides off; a pointer that is already gone just has nothing to capture. */
function capture(target: Element, e: PointerEvent): void {
  try { target.setPointerCapture(e.pointerId); } catch { /* not active any more */ }
}

/**
 * In-world touch controls (T-K6): a stick on the left to move, dragging on the right half to look, and buttons to
 * jump, break, place, fly, change the hotbar slot and pause. They feed Input like the keyboard and mouse do.
 */
export class TouchControls {
  readonly root: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private stickHeld = new Set<string>();

  constructor(parent: HTMLElement, private readonly input: Input, onPause: () => void) {
    this.root = el('div', 'touch-controls');
    this.root.style.display = 'none';
    const look = el('div', 'touch-look');
    look.setAttribute('aria-hidden', 'true');
    const stick = el('div', 'touch-stick');
    stick.setAttribute('aria-hidden', 'true');
    this.knob = el('div', 'touch-knob');
    stick.append(this.knob);
    const buttons = el('div', 'touch-buttons');
    const hold = (label: string, text: string, press: (down: boolean) => void) => {
      const b = el('button', 'touch-button', text);
      b.type = 'button';
      b.setAttribute('aria-label', label);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); capture(b, e); press(true); });
      for (const end of ['pointerup', 'pointercancel'] as const) b.addEventListener(end, () => press(false));
      return b;
    };
    buttons.append(
      hold('Previous slot', '◀', (d) => { if (d) input.addWheel(-1); }),
      hold('Next slot', '▶', (d) => { if (d) input.addWheel(1); }),
      hold('Fly', 'Fly', (d) => input.setVirtualKey('KeyF', d)),
      hold('Place', 'Place', (d) => input.setVirtualButton(2, d)),
      hold('Break', 'Break', (d) => input.setVirtualButton(0, d)),
      hold('Jump', 'Jump', (d) => input.setVirtualKey('Space', d)),
    );
    const pause = hold('Pause', 'II', (d) => { if (d) onPause(); });
    pause.classList.add('touch-pause');
    this.root.append(look, stick, buttons, pause);
    parent.append(this.root);

    let lookId: number | null = null, lastX = 0, lastY = 0;
    look.addEventListener('pointerdown', (e) => { lookId = e.pointerId; lastX = e.clientX; lastY = e.clientY; capture(look, e); });
    look.addEventListener('pointermove', (e) => {
      if (e.pointerId !== lookId) return;
      input.addLook((e.clientX - lastX) * LOOK_GAIN, (e.clientY - lastY) * LOOK_GAIN);
      lastX = e.clientX; lastY = e.clientY;
    });
    for (const end of ['pointerup', 'pointercancel'] as const) look.addEventListener(end, (e) => { if (e.pointerId === lookId) lookId = null; });

    let stickId: number | null = null, cx = 0, cy = 0;
    stick.addEventListener('pointerdown', (e) => {
      stickId = e.pointerId;
      const r = stick.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      capture(stick, e);
      this.moveStick(e.clientX - cx, e.clientY - cy);
    });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) this.moveStick(e.clientX - cx, e.clientY - cy); });
    for (const end of ['pointerup', 'pointercancel'] as const) stick.addEventListener(end, (e) => {
      if (e.pointerId !== stickId) return;
      stickId = null;
      this.moveStick(0, 0);
    });
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? '' : 'none';
    if (!visible) this.moveStick(0, 0);
  }

  /** The stick at an offset from its centre: holds W, A, S or D for each direction pushed past STICK_KEY. */
  moveStick(dx: number, dy: number): void {
    const len = Math.hypot(dx, dy), scale = len > STICK_RADIUS ? STICK_RADIUS / len : 1;
    this.knob.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
    const nx = (dx * scale) / STICK_RADIUS, ny = (dy * scale) / STICK_RADIUS;
    const keys = new Set<string>();
    if (ny < -STICK_KEY) keys.add('KeyW');
    if (ny > STICK_KEY) keys.add('KeyS');
    if (nx < -STICK_KEY) keys.add('KeyA');
    if (nx > STICK_KEY) keys.add('KeyD');
    for (const k of keys) if (!this.stickHeld.has(k)) this.input.setVirtualKey(k, true);
    for (const k of this.stickHeld) if (!keys.has(k)) this.input.setVirtualKey(k, false);
    this.stickHeld = keys;
  }
}
