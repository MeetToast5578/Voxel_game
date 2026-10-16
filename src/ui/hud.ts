import { HOTBAR_SIZE } from '../config';
import type { ItemStack } from '../player/inventory';
import { ATLAS_TILES, TILE_SIZE } from '../render/tiles';
import { getBlockDef } from '../world/blocks';
import { el } from './dom';

const ICON_SIZE = 32;
const NAME_VISIBLE_S = 1.5;

/** Draws a block's side texture into a square canvas, scaled up without smoothing. State 0 clears the canvas. */
export function drawBlockIcon(canvas: HTMLCanvasElement, atlas: HTMLCanvasElement, state: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (state === 0) return;
  const tile = getBlockDef(state).tiles.side;
  const sx = (tile % ATLAS_TILES) * TILE_SIZE;
  const sy = Math.floor(tile / ATLAS_TILES) * TILE_SIZE;
  ctx.drawImage(atlas, sx, sy, TILE_SIZE, TILE_SIZE, 0, 0, canvas.width, canvas.height);
}

/** Crosshair, hotbar with block icons and stack counts, and the name of the selected block (fades out). */
export class Hud {
  private readonly root: HTMLDivElement;
  private readonly slotElements: HTMLDivElement[] = [];
  private readonly icons: HTMLCanvasElement[] = [];
  private readonly counts: HTMLSpanElement[] = [];
  private readonly nameLabel: HTMLDivElement;
  private readonly toolLabel: HTMLDivElement;
  private toolText = '';
  private readonly shownStates: number[] = [];
  private readonly shownCounts: number[] = [];
  private shownSelected = -1;
  private nameTimer = 0;

  constructor(parent: HTMLElement, private readonly atlas: HTMLCanvasElement) {
    this.root = el('div', 'hud');
    const crosshair = el('div', 'crosshair');
    this.nameLabel = el('div', 'block-name');
    this.toolLabel = el('div', 'tool-label');
    const bar = el('div', 'hotbar');
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const slot = el('div', 'slot');
      const icon = el('canvas', 'icon');
      icon.width = ICON_SIZE;
      icon.height = ICON_SIZE;
      const count = el('span', 'count');
      slot.append(icon, el('span', 'key', String(i + 1)), count);
      bar.append(slot);
      this.slotElements.push(slot);
      this.icons.push(icon);
      this.counts.push(count);
      this.shownStates.push(-1);
      this.shownCounts.push(-1);
    }
    this.root.append(crosshair, this.nameLabel, this.toolLabel, bar);
    parent.append(this.root);
  }

  /** The volume tool's line (empty hides it). Only touches the DOM when the text changes. */
  setToolLabel(text: string): void {
    if (text === this.toolText) return;
    this.toolText = text;
    this.toolLabel.textContent = text;
    this.toolLabel.style.display = text ? '' : 'none';
  }

  /** Call once per frame. Only touches the DOM when something changed. */
  update(stacks: readonly (ItemStack | null)[], selected: number, frameDt: number): void {
    let selectedChanged = false;
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const stack = stacks[i] ?? null;
      const state = stack?.state ?? 0;
      const count = stack?.count ?? 0;
      if (this.shownStates[i] !== state) {
        this.shownStates[i] = state;
        drawBlockIcon(this.icons[i]!, this.atlas, state);
        if (i === selected) selectedChanged = true;
      }
      if (this.shownCounts[i] !== count) {
        this.shownCounts[i] = count;
        this.counts[i]!.textContent = count > 1 ? String(count) : '';
      }
    }
    if (selected !== this.shownSelected || selectedChanged) {
      this.slotElements.forEach((s, i) => s.classList.toggle('selected', i === selected));
      if (this.shownSelected !== -1) {
        const state = this.shownStates[selected]!;
        if (state === 0) this.nameLabel.classList.remove('visible');
        else this.showName(getBlockDef(state).name);
      }
      this.shownSelected = selected;
    }
    if (this.nameTimer > 0) {
      this.nameTimer -= frameDt;
      if (this.nameTimer <= 0) this.nameLabel.classList.remove('visible');
    }
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? '' : 'none';
  }

  private showName(name: string): void {
    this.nameLabel.textContent = name;
    this.nameLabel.classList.add('visible');
    this.nameTimer = NAME_VISIBLE_S;
  }
}
