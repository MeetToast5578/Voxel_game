export class FixedStepLoop {
  private accumulator = 0;
  private last = 0;
  private rafId = 0;

  constructor(
    private readonly step: number,
    private readonly maxFrameDt: number,
    private readonly update: (dt: number) => void,
    private readonly render: (alpha: number, frameDt: number) => void,
  ) {}

  /** Advances time by frameDt seconds: runs 0..n fixed updates, then one render. Returns the number of updates run. */
  advance(frameDt: number): number {
    const dt = Math.min(Math.max(frameDt, 0), this.maxFrameDt);
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= this.step) {
      this.update(this.step);
      this.accumulator -= this.step;
      steps++;
    }
    this.render(this.accumulator / this.step, dt);
    return steps;
  }

  start(): void {
    this.last = performance.now();
    const tick = (now: number) => {
      this.advance((now - this.last) / 1000);
      this.last = now;
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    cancelAnimationFrame(this.rafId);
  }
}
