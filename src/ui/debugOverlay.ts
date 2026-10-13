import { el } from './dom';

const REFRESH_S = 0.25;

/** F3 text overlay in the top-left corner. Refreshes 4 times per second while visible. */
export class DebugOverlay {
  private readonly box: HTMLPreElement;
  private timer = 0;

  constructor(parent: HTMLElement) {
    this.box = el('pre', 'debug-overlay');
    this.box.style.display = 'none';
    parent.append(this.box);
  }

  get visible(): boolean {
    return this.box.style.display !== 'none';
  }

  toggle(): void {
    this.box.style.display = this.visible ? 'none' : '';
    this.timer = 0;
  }

  /** `lines` is only called when the text is refreshed. */
  update(frameDt: number, lines: () => string[]): void {
    if (!this.visible) return;
    this.timer -= frameDt;
    if (this.timer > 0) return;
    this.timer = REFRESH_S;
    this.box.textContent = lines().join('\n');
  }
}
