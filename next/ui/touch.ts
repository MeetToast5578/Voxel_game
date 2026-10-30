import type { Input } from '../game/input';

/** Stick travel in pixels that counts as fully pushed; look speed in mouse pixels per pixel dragged. */
const STICK_RADIUS = 48;
const LOOK_GAIN = 2.5;

function capture(target: Element, e: PointerEvent): void {
  try {
    target.setPointerCapture(e.pointerId);
  } catch {
    // The pointer is already gone.
  }
}

/**
 * On-screen controls for touch screens: a stick on the left to move, dragging on the right to look, and buttons to
 * jump, go down, break, place, fly, open the inventory, change slot and pause. They feed `Input` like a keyboard.
 */
export function installTouchControls(parent: HTMLElement, input: Input, onPause: () => void): void {
  input.touch = true;
  const root = document.createElement('div');
  root.className = 'touch';
  const look = Object.assign(document.createElement('div'), { className: 'touch-look' });
  const stick = Object.assign(document.createElement('div'), { className: 'touch-stick' });
  const knob = Object.assign(document.createElement('div'), { className: 'touch-knob' });
  stick.append(knob);
  const buttons = Object.assign(document.createElement('div'), { className: 'touch-buttons' });
  const button = (text: string, label: string, press: (down: boolean) => void) => {
    const b = Object.assign(document.createElement('button'), { type: 'button', textContent: text });
    b.setAttribute('aria-label', label);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      capture(b, e);
      press(true);
    });
    for (const end of ['pointerup', 'pointercancel'] as const) b.addEventListener(end, () => press(false));
    return b;
  };
  buttons.append(
    button('◀', 'Previous slot', (d) => d && input.press('slotPrev')),
    button('▶', 'Next slot', (d) => d && input.press('slotNext')),
    button('Inv', 'Inventory', (d) => d && input.press('inventory')),
    button('Fly', 'Fly', (d) => d && input.press('fly')),
    button('▼', 'Down', (d) => input.setKey('ShiftLeft', d)),
    button('Place', 'Place', (d) => input.setButton('place', d)),
    button('Break', 'Break', (d) => input.setButton('break', d)),
    button('Jump', 'Jump', (d) => input.setKey('Space', d)),
  );
  const pause = button('II', 'Pause', (d) => {
    if (d) onPause();
  });
  pause.classList.add('touch-pause');
  root.append(look, stick, buttons, pause);
  parent.append(root);

  let lookId: number | null = null, lx = 0, ly = 0;
  look.addEventListener('pointerdown', (e) => {
    lookId = e.pointerId;
    lx = e.clientX;
    ly = e.clientY;
    capture(look, e);
    input.start();
  });
  look.addEventListener('pointermove', (e) => {
    if (e.pointerId !== lookId) return;
    input.addLook((e.clientX - lx) * LOOK_GAIN, (e.clientY - ly) * LOOK_GAIN);
    lx = e.clientX;
    ly = e.clientY;
  });
  for (const end of ['pointerup', 'pointercancel'] as const) look.addEventListener(end, () => (lookId = null));

  let stickId: number | null = null, sx = 0, sy = 0;
  const moveStick = (dx: number, dy: number) => {
    const len = Math.hypot(dx, dy), k = len > STICK_RADIUS ? STICK_RADIUS / len : 1;
    knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    input.stickX = (dx * k) / STICK_RADIUS;
    input.stickZ = -(dy * k) / STICK_RADIUS;
  };
  stick.addEventListener('pointerdown', (e) => {
    stickId = e.pointerId;
    sx = e.clientX;
    sy = e.clientY;
    capture(stick, e);
    input.start();
  });
  stick.addEventListener('pointermove', (e) => {
    if (e.pointerId === stickId) moveStick(e.clientX - sx, e.clientY - sy);
  });
  for (const end of ['pointerup', 'pointercancel'] as const) {
    stick.addEventListener(end, () => {
      stickId = null;
      moveStick(0, 0);
    });
  }
}

/** Touch controls are used on coarse-pointer devices, or with `?touch=1`. */
export function wantsTouch(): boolean {
  return new URLSearchParams(location.search).get('touch') === '1' || matchMedia('(pointer: coarse)').matches;
}
