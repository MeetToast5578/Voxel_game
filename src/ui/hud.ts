import { HOTBAR_SIZE } from '../config';
import { ATLAS_TILES, TILE_SIZE } from '../render/tiles';
import { getBlockDef } from '../world/blocks';
import { el } from './dom';

const ICON_SIZE = 32;
const NAME_VISIBLE_S = 1.5;

/** Crosshair, hotbar with block icons, and the name of the selected block (fades out). */
export class Hud {
  private readonly root: HTMLDivElement;
  private readonly slotElements: HTMLDivElement[] = [];
  private readonly icons: HTMLCanvasElement[] = [];
  private readonly nameLabel: HTMLDivElement;
  private readonly shownSlots: number[] = [];
  private shownSelected = -1;
  private nameTimer = 0;

  constructor(parent: HTMLElement, private readonly atlas: HTMLCanvasElement) {
    this.root = el('div', 'hud');
    const crosshair = el('div', 'crosshair');
    this.nameLabel = el('div', 'block-name');
    const bar = el('div', 'hotbar');
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const slot = el('div', 'slot');
      const icon = el('canvas', 'icon');
      icon.width = ICON_SIZE;
      icon.height = ICON_SIZE;
      slot.append(icon, el('span', 'key', String(i + 1)));
      bar.append(slot);
      this.slotElements.push(slot);
      this.icons.push(icon);
    }
    this.root.append(crosshair, this.nameLabel, bar);
    parent.append(this.root);
  }

  /** Call once per frame. Only touches the DOM when something changed. */
  update(slots: readonly number[], selected: number, frameDt: number): void {
    let selectedBlockChanged = false;
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const id = slots[i]!;
      if (this.shownSlots[i] === id) continue;
      this.shownSlots[i] = id;
      this.drawIcon(this.icons[i]!, id);
      if (i === selected) selectedBlockChanged = true;
    }
    if (selected !== this.shownSelected || selectedBlockChanged) {
      this.slotElements.forEach((s, i) => s.classList.toggle('selected', i === selected));
      if (this.shownSelected !== -1) this.showName(getBlockDef(slots[selected]!).name);
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

  /** Draws the block's side texture, scaled up without smoothing. */
  private drawIcon(canvas: HTMLCanvasElement, blockId: number): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const tile = getBlockDef(blockId).tiles.side;
    const sx = (tile % ATLAS_TILES) * TILE_SIZE;
    const sy = Math.floor(tile / ATLAS_TILES) * TILE_SIZE;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, ICON_SIZE, ICON_SIZE);
    ctx.drawImage(this.atlas, sx, sy, TILE_SIZE, TILE_SIZE, 0, 0, ICON_SIZE, ICON_SIZE);
  }
}
