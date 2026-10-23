import { render } from 'preact';
import { HOTBAR_SIZE, INVENTORY_SIZE, MAX_STACK } from '../config';
import type { Inventory, ItemStack } from '../player/inventory';
import { CraftingGrid } from '../player/crafting';
import { usesLeft } from '../player/tools';
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
  /** False in survival: the Blocks tab, which hands out free stacks, is hidden. */
  creative: boolean;
  cursor: ItemStack | null;
  hovered: number | null;
  crafting: CraftingGrid;
  onCraftCell: (index: number) => void;
  onCraftResult: () => void;
  onTab: (tab: InventoryTab) => void;
  onPress: (index: number) => void;
  onPick: (state: number) => void;
  onHover: (index: number, over: boolean) => void;
  onClose: () => void;
  cursorRef: (el: HTMLDivElement | null) => void;
  tipRef: (el: HTMLDivElement | null) => void;
}

/** A state's name; a tool's says how many uses it has left (T-I5). */
function itemName(state: number): string {
  const uses = usesLeft(state);
  return uses === null ? getBlockDef(state).name : `${getBlockDef(state).name} (${uses} uses left)`;
}

function slotLabel(stack: ItemStack | null): string {
  return stack ? `${itemName(stack.state)}, ${stack.count}` : 'empty';
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
  const tip = hovered && !p.cursor ? itemName(hovered.state) : '';
  const grid = Array.from({ length: INVENTORY_SIZE - HOTBAR_SIZE }, (_, k) => slot(HOTBAR_SIZE + k));
  const size = p.crafting.size, result = p.crafting.result;
  const craftCells = Array.from({ length: size * size }, (_, i) => (
    <Slot key={i} stack={p.crafting.cells[i] ?? null} atlas={p.atlas} label={`Crafting cell ${i + 1}: ${slotLabel(p.crafting.cells[i] ?? null)}`}
      onPress={() => p.onCraftCell(i)} />
  ));
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
          {p.creative && (
            <button
              type="button"
              role="tab"
              class="menu-button small"
              aria-selected={p.tab === 'blocks'}
              onClick={() => p.onTab('blocks')}
            >
              Blocks (creative)
            </button>
          )}
        </div>
        {p.creative && p.tab === 'blocks' ? (
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
            <div class="crafting" aria-label={size === 3 ? 'Crafting table' : 'Crafting'}>
              <div class="crafting-grid" style={{ gridTemplateColumns: `repeat(${size}, 44px)` }}>{craftCells}</div>
              <span class="crafting-arrow" aria-hidden="true">→</span>
              <Slot stack={result} atlas={p.atlas} label={result ? `Craft ${slotLabel(result)}` : 'Nothing to craft'}
                onPress={p.onCraftResult} />
            </div>
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
 * the cursor down (see Inventory.clickSlot). The held stack and the name tooltip follow the mouse. In creative, the Blocks
 * tab puts a full stack of any block into the selected hotbar slot.
 */
export class InventoryScreen {
  private readonly root: HTMLDivElement;
  private cursor: ItemStack | null = null;
  private hovered: number | null = null;
  /** The crafting grid (T-I6): 2×2 from the inventory, 3×3 when opened at a crafting table. */
  readonly crafting = new CraftingGrid();
  private tab: InventoryTab = 'inventory';
  private creative = true;
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

  /** Opens on the inventory tab; `craftSize` 3 gives the crafting table's grid. */
  show(craftSize: 2 | 3 = 2): void {
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.crafting.size = craftSize;
    this.open = true;
    this.tab = 'inventory';
    this.root.style.display = '';
    this.refresh();
    this.root.querySelector<HTMLButtonElement>('button')?.focus();
  }

  /**
   * Closes the screen. The stack on the cursor and whatever is left in the crafting grid go back into the inventory;
   * what does not fit is returned, for the game to drop.
   */
  hide(): ItemStack[] {
    const leftover: ItemStack[] = [];
    for (const stack of [...(this.cursor ? [this.cursor] : []), ...this.crafting.clear()]) {
      const left = this.inventory.add(stack.state, stack.count);
      if (left > 0) leftover.push({ state: stack.state, count: left });
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

  /** Creative shows the Blocks tab; survival hides it and leaves it if it was showing. */
  setCreative(creative: boolean): void {
    this.creative = creative;
    if (!creative) this.tab = 'inventory';
    if (this.open) this.draw(); // a closed screen draws on show(); drawing now would build icons at startup
  }

  private draw(): void {
    render(
      <InventoryView
        inventory={this.inventory}
        atlas={this.atlas}
        tab={this.tab}
        creative={this.creative}
        cursor={this.cursor}
        hovered={this.hovered}
        crafting={this.crafting}
        onCraftCell={(i) => {
          this.cursor = this.crafting.click(i, this.cursor);
          this.draw();
        }}
        onCraftResult={() => {
          this.cursor = this.crafting.take(this.cursor);
          this.draw();
        }}
        onTab={(tab) => this.setTab(tab)}
        onPress={(i) => {
          this.cursor = this.inventory.clickSlot(i, this.cursor);
          this.draw();
        }}
        onPick={(state) => {
          if (!this.creative) return;
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
