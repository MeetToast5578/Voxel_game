import { HOTBAR_SIZE, INVENTORY_SIZE } from '../config';
import type { Inventory, ItemStack } from '../player/inventory';
import { el } from './dom';
import { drawBlockIcon } from './hud';

const ICON_SIZE = 36;

/**
 * The inventory grid, opened with E (spec 24). A click on a slot takes its stack onto the cursor, or puts the cursor
 * down (see Inventory.clickSlot). The held stack follows the mouse. The game opens and closes it.
 */
export class InventoryScreen {
  private readonly root: HTMLDivElement;
  private readonly slots: HTMLDivElement[] = [];
  private readonly icons: HTMLCanvasElement[] = [];
  private readonly counts: HTMLSpanElement[] = [];
  private readonly cursorEl: HTMLDivElement;
  private readonly cursorIcon: HTMLCanvasElement;
  private readonly cursorCount: HTMLSpanElement;
  private cursor: ItemStack | null = null;
  private open = false;

  constructor(parent: HTMLElement, private readonly atlas: HTMLCanvasElement, private readonly inventory: Inventory) {
    this.root = el('div', 'inventory');
    this.root.style.display = 'none';
    const panel = el('div', 'inventory-panel');
    panel.append(el('div', 'inventory-title', 'Inventory'), el('div', 'inventory-hint', 'Click a slot to pick up or put down a stack. E closes.'));
    const grid = el('div', 'inventory-grid');
    const bar = el('div', 'inventory-bar');
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const slot = this.makeSlot(i);
      if (i >= HOTBAR_SIZE) grid.append(slot);
      else bar.append(slot);
    }
    panel.append(grid, bar);

    this.cursorEl = el('div', 'inventory-cursor');
    this.cursorIcon = el('canvas', 'icon');
    this.cursorIcon.width = ICON_SIZE;
    this.cursorIcon.height = ICON_SIZE;
    this.cursorCount = el('span', 'count');
    this.cursorEl.append(this.cursorIcon, this.cursorCount);
    this.cursorEl.style.display = 'none';
    this.root.append(panel, this.cursorEl);
    parent.append(this.root);
    window.addEventListener('mousemove', (e) => {
      this.cursorEl.style.left = `${e.clientX}px`;
      this.cursorEl.style.top = `${e.clientY}px`;
    });
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(): void {
    this.open = true;
    this.root.style.display = '';
    this.refresh();
  }

  /** Closes the screen. A stack still on the cursor goes back into the inventory; what does not fit is returned. */
  hide(): ItemStack | null {
    let leftover: ItemStack | null = null;
    if (this.cursor) {
      const left = this.inventory.add(this.cursor.state, this.cursor.count);
      leftover = left > 0 ? { state: this.cursor.state, count: left } : null;
    }
    this.cursor = null;
    this.open = false;
    this.root.style.display = 'none';
    return leftover;
  }

  private makeSlot(index: number): HTMLDivElement {
    const slot = el('div', 'slot inv-slot');
    const icon = el('canvas', 'icon');
    icon.width = ICON_SIZE;
    icon.height = ICON_SIZE;
    const count = el('span', 'count');
    slot.append(icon, count);
    slot.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.cursor = this.inventory.clickSlot(index, this.cursor);
      this.refresh();
    });
    this.slots[index] = slot;
    this.icons[index] = icon;
    this.counts[index] = count;
    return slot;
  }

  /** Redraws every slot and the cursor stack. The game calls it when items change while the screen is open. */
  refresh(): void {
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const stack = this.inventory.slots[i] ?? null;
      drawBlockIcon(this.icons[i]!, this.atlas, stack?.state ?? 0);
      this.counts[i]!.textContent = stack && stack.count > 1 ? String(stack.count) : '';
      this.slots[i]!.classList.toggle('selected', i === this.inventory.selected);
    }
    this.cursorEl.style.display = this.cursor ? '' : 'none';
    if (this.cursor) {
      drawBlockIcon(this.cursorIcon, this.atlas, this.cursor.state);
      this.cursorCount.textContent = this.cursor.count > 1 ? String(this.cursor.count) : '';
    }
  }
}
