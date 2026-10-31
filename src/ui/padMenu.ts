export type Dir = 'up' | 'down' | 'left' | 'right';
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Spatial navigation: the index of the box nearest `from` in direction `dir`, or -1. Distance along the direction counts
 * once and distance across it twice, so boxes in line win over closer ones off to the side.
 */
export function nearestInDirection(from: Box, boxes: readonly Box[], dir: Dir): number {
  const cx = from.x + from.w / 2, cy = from.y + from.h / 2;
  let best = -1, bestScore = Infinity;
  boxes.forEach((b, i) => {
    const dx = b.x + b.w / 2 - cx, dy = b.y + b.h / 2 - cy;
    const along = dir === 'right' ? dx : dir === 'left' ? -dx : dir === 'down' ? dy : -dy;
    const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    if (along <= 1) return;
    const score = along + across * 2;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

const FOCUSABLE = 'button, input, select, summary, .slot';
const rect = (e: Element): Box => {
  const r = e.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};

/**
 * Menus and inventory screens with a gamepad: the d-pad or left stick moves the focus between buttons, fields and slots,
 * A clicks (on a slot: left click), X right-clicks a slot, B goes back and Start resumes. Poll once a frame while the
 * game is not being played.
 */
export class PadMenu {
  private prev: boolean[] = [];
  private lastDir: Dir | null = null;
  private repeatAt = 0;

  constructor(private readonly root: HTMLElement, private readonly on: { back(): void; start(): void }) {}

  poll(now: number): void {
    const pad = navigator.getGamepads?.().find((p) => p?.connected);
    if (!pad) return;
    const button = (i: number) => pad.buttons[i]?.pressed ?? false;
    const pressed = (i: number) => button(i) && !this.prev[i];
    const ax = pad.axes[0] ?? 0, ay = pad.axes[1] ?? 0;
    const dir: Dir | null = button(12) || ay < -0.5 ? 'up' : button(13) || ay > 0.5 ? 'down' : button(14) || ax < -0.5 ? 'left' : button(15) || ax > 0.5 ? 'right' : null;
    // A held direction repeats, after a pause.
    if (dir && (dir !== this.lastDir || now >= this.repeatAt)) {
      this.repeatAt = now + (dir !== this.lastDir ? 400 : 130);
      this.move(dir);
    }
    this.lastDir = dir;
    if (pressed(0)) this.activate(false);
    if (pressed(2)) this.activate(true);
    if (pressed(1)) this.on.back();
    if (pressed(9)) this.on.start();
    this.prev = pad.buttons.map((b) => b.pressed);
  }

  private move(dir: Dir): void {
    const active = document.activeElement as HTMLElement | null;
    // Sliders take left and right themselves.
    if (active instanceof HTMLInputElement && active.type === 'range' && (dir === 'left' || dir === 'right')) {
      if (dir === 'left') active.stepDown();
      else active.stepUp();
      active.dispatchEvent(new Event('input', { bubbles: true }));
      active.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    const all = [...this.root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((e) => e.getClientRects().length > 0);
    if (all.length === 0) return;
    if (!active || !all.includes(active)) {
      all[0]!.focus();
      return;
    }
    const others = all.filter((e) => e !== active);
    const i = nearestInDirection(rect(active), others.map(rect), dir);
    if (i >= 0) {
      others[i]!.focus();
      others[i]!.scrollIntoView({ block: 'nearest' });
    }
  }

  private activate(right: boolean): void {
    const el = document.activeElement as HTMLElement | null;
    if (!el || !this.root.contains(el)) return;
    if (el.classList.contains('slot')) el.dispatchEvent(new MouseEvent('mousedown', { button: right ? 2 : 0, bubbles: true }));
    else if (!right) el.click();
  }
}
