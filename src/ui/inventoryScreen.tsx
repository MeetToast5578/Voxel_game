import { render } from 'preact';
import { HOTBAR_SIZE, INVENTORY_SIZE, MAX_STACK } from '../config';
import type { Inventory, ItemStack } from '../player/inventory';
import { BLOCKS, BlockId, blockStateName, getBlockDef } from '../world/blocks';
import { Slot } from './components';

/** The two tabs: the player's own slots, and every block in the game to pick from (creative, for testing). */
export type InventoryTab = 'inventory' | 'blocks';

/**
 * Every block type in the game except air, by its first state, in registry order. Each one is a pick in the Blocks tab.
 * Flowing water has a state for each level, so only its first state is listed.
 */
const ALL_BLOCK_STATES: readonly number[] = BLOCKS.filter((def) => def.id !== BlockId.AIR).map((def) => def.id);

interface ViewProps {
  inventory: Inventory;
  atlas: HTMLCanvasElement;
  tab: InventoryTab;
  cursor: ItemStack | null;
  hovered: number | null;
  onTab: (tab: InventoryTab) => void;
  onPress: (index: number) => void;
  onPick: (state: number) => void;
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
  const picks = ALL_BLOCK_STATES.map((state) => (
    <Slot
      key={state}
      stack={{ state, count: MAX_STACK }}
      atlas={p.atlas}
      label={`${blockStateName(state)}, full stack`}
      selected={p.inventory.selectedStack?.state === state}
      onPress={() => p.onPick(state)}
    />
  ));
  return (
    <>
      <div class="inventory-panel" role="dialog" aria-modal="true" aria-label="Inventory">
        <div class="inventory-head">
          <h2 class="inventory-title">{p.tab === 'blocks' ? 'Blocks' : 'Inventory'}</h2>
          <button type="button" class="menu-button small" onClick={p.onClose}>
            Close (E)
          </button>
        </div>
        <div class="inventory-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            class="menu-button small"
            aria-selected={p.tab === 'inventory'}
            onClick={() => p.onTab('inventory')}
          >
            Inventory
          </button>
          <button
            type="button"
            role="tab"
            class="menu-button small"
            aria-selected={p.tab === 'blocks'}
            onClick={() => p.onTab('blocks')}
          >
            Blocks (creative)
          </button>
        </div>
        {p.tab === 'blocks' ? (
          <>
            <p class="inventory-hint">
              Click a block to put a full stack of it in the selected hotbar slot. Every block in the game is here.
            </p>
            <div class="block-picker" aria-label="All blocks">
              {picks}
            </div>
          </>
        ) : (
          <>
            <p class="inventory-hint">Click a slot to pick up or put down a stack. Esc or E closes.</p>
            <div class="inventory-grid">{grid}</div>
          </>
        )}
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
 * the cursor down (see Inventory.clickSlot). The held stack and the name tooltip follow the mouse. The Blocks tab puts a
 * full stack of any block into the selected hotbar slot, for testing.
 */
export class InventoryScreen {
  private readonly root: HTMLDivElement;
  private cursor: ItemStack | null = null;
  private hovered: number | null = null;
  private tab: InventoryTab = 'inventory';
  private open = false;
  private returnFocus: HTMLElement | null = null;
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
    this.root.addEventListener('keydown', event => {
      if (event.key !== 'Tab' || !this.open) return;
      const buttons = [...this.root.querySelectorAll<HTMLButtonElement>('button:not([disabled])')];
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
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

  /** The tab showing now. */
  get currentTab(): InventoryTab {
    return this.tab;
  }

  show(): void {
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.open = true;
    this.tab = 'inventory';
    this.root.style.display = '';
    this.refresh();
    this.root.querySelector<HTMLButtonElement>('button')?.focus();
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
    const previous = this.returnFocus;
    requestAnimationFrame(() => { if (!this.open && previous?.isConnected) previous.focus(); });
    this.returnFocus = null;
    return leftover;
  }

  /** Redraws every slot and the cursor stack. The game calls it when items change while the screen is open. */
  refresh(): void {
    this.draw();
  }

  /** Switches tab. Opening the screen always starts on the inventory tab. */
  setTab(tab: InventoryTab): void {
    this.tab = tab;
    this.draw();
  }

  private draw(): void {
    render(
      <InventoryView
        inventory={this.inventory}
        atlas={this.atlas}
        tab={this.tab}
        cursor={this.cursor}
        hovered={this.hovered}
        onTab={(tab) => this.setTab(tab)}
        onPress={(i) => {
          this.cursor = this.inventory.clickSlot(i, this.cursor);
          this.draw();
        }}
        onPick={(state) => {
          this.inventory.setSlot(this.inventory.selected, state, MAX_STACK);
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
