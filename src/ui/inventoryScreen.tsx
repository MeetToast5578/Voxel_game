import { render } from 'preact';
import { HOTBAR_SIZE, INVENTORY_SIZE } from '../config';
import type { Inventory, ItemStack } from '../player/inventory';
import { getBlockDef } from '../world/blocks';
import { Slot } from './components';

interface ViewProps {
  inventory: Inventory;
  atlas: HTMLCanvasElement;
  cursor: ItemStack | null;
  hovered: number | null;
  onPress: (index: number) => void;
  onHover: (index: number, over: boolean) => void;
  onClose: () => void;
  cursorRef: (el: HTMLDivElement | null) => void;
  tipRef: (el: HTMLDivElement | null) => void;
}

function slotLabel(stack: ItemStack | null): string {
  return stack ? `${getBlockDef(stack.state).name}, ${stack.count}` : 'empty';
}

function InventoryView(p: ViewProps) {
  const slot = (i: number) => (
    <Slot
      key={i}
      stack={p.inventory.slots[i] ?? null}
      atlas={p.atlas}
      label={slotLabel(p.inventory.slots[i] ?? null)}
      selected={i === p.inventory.selected}
      onPress={() => p.onPress(i)}
      onHover={(over) => p.onHover(i, over)}
    />
  );
  const hovered = p.hovered !== null ? (p.inventory.slots[p.hovered] ?? null) : null;
  const tip = hovered && !p.cursor ? getBlockDef(hovered.state).name : '';
  const grid = Array.from({ length: INVENTORY_SIZE - HOTBAR_SIZE }, (_, k) => slot(HOTBAR_SIZE + k));
  const bar = Array.from({ length: HOTBAR_SIZE }, (_, k) => slot(k));
  return (
    <>
      <div class="inventory-panel" role="dialog" aria-label="Inventory">
        <div class="inventory-head">
          <h2 class="inventory-title">Inventory</h2>
          <button type="button" class="menu-button small" onClick={p.onClose}>
            Close (E)
          </button>
        </div>
        <p class="inventory-hint">Click a slot to pick up or put down a stack. Esc or E closes.</p>
        <div class="inventory-grid">{grid}</div>
        <div class="inventory-bar">{bar}</div>
      </div>
      {tip && (
        <div class="inventory-tooltip" ref={p.tipRef}>
          {tip}
        </div>
      )}
      {p.cursor && (
        <div class="inventory-cursor" ref={p.cursorRef}>
          <Slot stack={p.cursor} atlas={p.atlas} label={slotLabel(p.cursor)} />
        </div>
      )}
    </>
  );
}

/**
 * The inventory grid, opened with E or from the pause menu. A click on a slot takes its stack onto the cursor, or puts
 * the cursor down (see Inventory.clickSlot). The held stack and the name tooltip follow the mouse.
 */
export class InventoryScreen {
  private readonly root: HTMLDivElement;
  private cursor: ItemStack | null = null;
  private hovered: number | null = null;
  private open = false;
  private cursorEl: HTMLDivElement | null = null;
  private tipEl: HTMLDivElement | null = null;

  constructor(
    parent: HTMLElement,
    private readonly atlas: HTMLCanvasElement,
    private readonly inventory: Inventory,
    /** The Close button and Escape: the game decides what closing does (back to the pause menu or to play). */
    private readonly onClose: () => void,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'inventory';
    this.root.style.display = 'none';
    parent.append(this.root);
    window.addEventListener('mousemove', (e) => {
      for (const el of [this.cursorEl, this.tipEl]) {
        if (!el) continue;
        el.style.left = `${e.clientX}px`;
        el.style.top = `${e.clientY}px`;
      }
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
    this.hovered = null;
    this.open = false;
    this.root.style.display = 'none';
    this.draw();
    return leftover;
  }

  /** Redraws every slot and the cursor stack. The game calls it when items change while the screen is open. */
  refresh(): void {
    this.draw();
  }

  private draw(): void {
    render(
      <InventoryView
        inventory={this.inventory}
        atlas={this.atlas}
        cursor={this.cursor}
        hovered={this.hovered}
        onPress={(i) => {
          this.cursor = this.inventory.clickSlot(i, this.cursor);
          this.draw();
        }}
        onHover={(i, over) => {
          this.hovered = over ? i : this.hovered === i ? null : this.hovered;
          this.draw();
        }}
        onClose={this.onClose}
        cursorRef={(el) => (this.cursorEl = el)}
        tipRef={(el) => (this.tipEl = el)}
      />,
      this.root,
    );
  }
}
