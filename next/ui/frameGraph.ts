const FRAMES = 120;
const WIDTH = FRAMES * 2, HEIGHT = 60;
/** Milliseconds at the top of the graph. */
const SCALE_MS = 50;

/**
 * The F3 frame graph: one bar per frame for the last 120 frames, its height the time since the previous frame, the
 * darker lower part the main thread's own work (game update and render calls). Lines mark 60 and 30 fps.
 */
export class FrameGraph {
  readonly canvas = document.createElement('canvas');
  private readonly frame = new Float32Array(FRAMES);
  private readonly cpu = new Float32Array(FRAMES);
  private next = 0;
  private readonly ctx: CanvasRenderingContext2D;

  constructor() {
    this.canvas.width = WIDTH;
    this.canvas.height = HEIGHT;
    this.canvas.id = 'frames';
    this.ctx = this.canvas.getContext('2d')!;
  }

  push(frameMs: number, cpuMs: number): void {
    this.frame[this.next] = frameMs;
    this.cpu[this.next] = cpuMs;
    this.next = (this.next + 1) % FRAMES;
  }

  draw(): void {
    const ctx = this.ctx, y = (ms: number) => HEIGHT - Math.min(HEIGHT, (ms / SCALE_MS) * HEIGHT);
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    for (let k = 0; k < FRAMES; k++) {
      const i = (this.next + k) % FRAMES, f = this.frame[i]!, c = Math.min(f, this.cpu[i]!);
      ctx.fillStyle = f <= 17.5 ? '#5c5' : f <= 34 ? '#dc4' : '#e44';
      ctx.fillRect(k * 2, y(f), 2, HEIGHT - y(f));
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(k * 2, y(c), 2, HEIGHT - y(c));
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fillRect(0, Math.round(y(1000 / 60)), WIDTH, 1);
    ctx.fillRect(0, Math.round(y(1000 / 30)), WIDTH, 1);
  }

  /** "frame avg/max, main thread avg/max" over the graph, in ms. */
  summary(): string {
    let fSum = 0, fMax = 0, cSum = 0, cMax = 0;
    for (let i = 0; i < FRAMES; i++) {
      fSum += this.frame[i]!;
      fMax = Math.max(fMax, this.frame[i]!);
      cSum += this.cpu[i]!;
      cMax = Math.max(cMax, this.cpu[i]!);
    }
    const f = (v: number) => v.toFixed(1);
    return `frame ${f(fSum / FRAMES)} ms (max ${f(fMax)})  main thread ${f(cSum / FRAMES)} ms (max ${f(cMax)})`;
  }
}
