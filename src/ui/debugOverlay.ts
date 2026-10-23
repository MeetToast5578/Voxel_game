import { el } from './dom';

const REFRESH_S = 0.25;
/** Frames the F3 graph keeps: one pixel column each (T-J8). */
export const GRAPH_FRAMES = 120;
const GRAPH_HEIGHT = 50;
/** Milliseconds at the top of the graph; slower frames are clipped. */
const GRAPH_MAX_MS = 50;
const BUDGET_60_MS = 1000 / 60;
const BUDGET_30_MS = 1000 / 30;

/** Average and worst frame time in milliseconds of the samples recorded so far (0 entries are not recorded yet). */
export function frameStats(samplesMs: Float32Array): { avg: number; max: number } {
  let sum = 0, max = 0, n = 0;
  for (const ms of samplesMs) if (ms > 0) { sum += ms; max = Math.max(max, ms); n++; }
  return { avg: n ? sum / n : 0, max };
}

/** F3 overlay in the top-left corner: text refreshed 4 times per second, and a frame-time graph drawn every frame. */
export class DebugOverlay {
  private readonly box: HTMLDivElement;
  private readonly text: HTMLPreElement;
  private readonly graph: CanvasRenderingContext2D | null;
  private readonly samples = new Float32Array(GRAPH_FRAMES);
  private next = 0;
  private timer = 0;

  constructor(parent: HTMLElement) {
    this.box = el('div', 'debug-overlay');
    this.box.style.display = 'none';
    this.text = el('pre', 'debug-text');
    const canvas = el('canvas', 'debug-graph');
    canvas.width = GRAPH_FRAMES;
    canvas.height = GRAPH_HEIGHT;
    this.graph = canvas.getContext('2d');
    this.box.append(this.text, canvas);
    parent.append(this.box);
  }

  get visible(): boolean {
    return this.box.style.display !== 'none';
  }

  toggle(): void {
    this.box.style.display = this.visible ? 'none' : '';
    this.timer = 0;
    this.samples.fill(0);
  }

  /** `lines` is only called when the text is refreshed. */
  update(frameDt: number, lines: () => string[]): void {
    if (!this.visible) return;
    this.samples[this.next] = frameDt * 1000;
    this.next = (this.next + 1) % GRAPH_FRAMES;
    this.drawGraph();
    this.timer -= frameDt;
    if (this.timer > 0) return;
    this.timer = REFRESH_S;
    const { avg, max } = frameStats(this.samples);
    this.text.textContent = [...lines(), `Frame ${avg.toFixed(1)} ms avg · ${max.toFixed(1)} ms worst (last ${GRAPH_FRAMES})`].join('\n');
  }

  /** Oldest frame on the left. Green fits 60 fps, yellow 30 fps, red is slower; lines mark both budgets. */
  private drawGraph(): void {
    const g = this.graph;
    if (!g) return;
    const y = (ms: number) => GRAPH_HEIGHT - Math.min(ms, GRAPH_MAX_MS) / GRAPH_MAX_MS * GRAPH_HEIGHT;
    g.clearRect(0, 0, GRAPH_FRAMES, GRAPH_HEIGHT);
    for (let i = 0; i < GRAPH_FRAMES; i++) {
      const ms = this.samples[(this.next + i) % GRAPH_FRAMES]!;
      g.fillStyle = ms <= BUDGET_60_MS ? '#5c5' : ms <= BUDGET_30_MS ? '#dc4' : '#e54';
      g.fillRect(i, y(ms), 1, GRAPH_HEIGHT - y(ms));
    }
    g.fillStyle = 'rgba(255, 255, 255, 0.5)';
    for (const ms of [BUDGET_60_MS, BUDGET_30_MS]) g.fillRect(0, Math.round(y(ms)), GRAPH_FRAMES, 1);
  }
}
