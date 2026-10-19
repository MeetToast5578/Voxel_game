import { render } from 'preact';
import { HOTBAR_SIZE } from '../config';
import type { ToolRow } from '../player/buildTool';
import type { ItemStack } from '../player/inventory';
import { getBlockDef } from '../world/blocks';
import { Slot } from './components';
import { HINT_KEYS } from './controls';

const NAME_VISIBLE_S = 1.5;
/** The key hints show for this many seconds of play, so a new player sees how to open the inventory. */
const HINT_SECONDS = 60;
/** The keys of the volume tools, in the order the panel lists them. */
const TOOL_KEYS = 'R mode · Q shape · [ ] size · , . thickness · G solid or shell · C disc · X cancel · Ctrl+Z undo';

interface HudState {
  slots: (ItemStack | null)[];
  selected: number;
  name: string;
  nameVisible: boolean;
  tool: ToolRow[];
  hints: boolean;
  inventoryAvailable: boolean;
}

/** Every setting of the volume tools, always shown, so the screen says what is selected (single block mode included). */
function ToolPanel({ rows }: { rows: ToolRow[] }) {
  return (
    <div class="tool-panel" aria-label="Build tool">
      <h2 class="tool-panel-title">Build tool</h2>
      <dl class="tool-rows">
        {rows.map((row) => (
          <div class={`tool-row${row.unused ? ' unused' : ''}`} key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      <p class="tool-keys">{TOOL_KEYS}</p>
    </div>
  );
}

function HudView({ state, atlas, onInventory }: { state: HudState; atlas: HTMLCanvasElement; onInventory: () => void }) {
  return (
    <>
      <button type="button" class="hud-inventory" aria-keyshortcuts="E" disabled={!state.inventoryAvailable} onClick={onInventory}>
        Inventory <kbd aria-hidden="true">E</kbd>
      </button>
      <div class="crosshair" />
      <div class={`block-name${state.nameVisible ? ' visible' : ''}`}>{state.name}</div>
      <ToolPanel rows={state.tool} />
      <div class="hotbar">
        {state.slots.map((stack, i) => (
          <Slot
            key={i}
            stack={stack}
            atlas={atlas}
            selected={i === state.selected}
            keyLabel={String(i + 1)}
            label={stack ? `${i + 1}: ${getBlockDef(stack.state).name}, ${stack.count}` : `${i + 1}: empty`}
          />
        ))}
      </div>
      {state.hints && (
        <div class="key-hints">
          {HINT_KEYS.map(([key, action]) => (
            <span class="hint" key={key}>
              <kbd>{key}</kbd> {action}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

/** Crosshair, hotbar with block icons and stack counts, the name of the selected block (fades out), the volume tool's line, and the key hints. */
export class Hud {
  private readonly root: HTMLDivElement;
  private state: HudState;
  private slotsKey = '';
  private toolKey = '';
  private nameTimer = 0;
  private hintTimer = HINT_SECONDS;

  constructor(parent: HTMLElement, private readonly atlas: HTMLCanvasElement, private readonly onInventory: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    parent.append(this.root);
    this.state = {
      slots: Array.from({ length: HOTBAR_SIZE }, () => null),
      selected: 0,
      name: '',
      nameVisible: false,
      tool: [],
      hints: true,
      inventoryAvailable: false,
    };
    this.draw();
  }

  /** Call once per frame. `playing` is true while the game receives input (the hints count down only then). */
  update(stacks: readonly (ItemStack | null)[], selected: number, frameDt: number, playing: boolean, inventoryAvailable: boolean): void {
    const slots = stacks.slice(0, HOTBAR_SIZE);
    const key = slots.map((s) => (s ? `${s.state}:${s.count}` : '-')).join(',');
    let next = this.state;
    let dirty = false;
    if (inventoryAvailable !== next.inventoryAvailable) {
      next = { ...next, inventoryAvailable };
      dirty = true;
    }
    if (key !== this.slotsKey) {
      this.slotsKey = key;
      next = { ...next, slots: slots.map((s) => (s ? { ...s } : null)) };
      dirty = true;
    }
    if (selected !== next.selected) {
      next = { ...next, selected };
      const state = slots[selected]?.state ?? 0;
      if (state === 0) {
        next = { ...next, nameVisible: false };
      } else {
        next = { ...next, name: getBlockDef(state).name, nameVisible: true };
        this.nameTimer = NAME_VISIBLE_S;
      }
      dirty = true;
    }
    if (this.nameTimer > 0) {
      this.nameTimer -= frameDt;
      if (this.nameTimer <= 0 && next.nameVisible) {
        next = { ...next, nameVisible: false };
        dirty = true;
      }
    }
    if (playing && this.hintTimer > 0) {
      this.hintTimer -= frameDt;
      if (this.hintTimer <= 0 && next.hints) {
        next = { ...next, hints: false };
        dirty = true;
      }
    }
    this.state = next;
    if (dirty) this.draw();
  }

  /** The build tool panel's rows. Only redraws when a row changes. */
  setTool(rows: ToolRow[]): void {
    const key = rows.map((r) => `${r.label}=${r.value}:${r.unused}`).join('|');
    if (key === this.toolKey) return;
    this.toolKey = key;
    this.state = { ...this.state, tool: rows };
    this.draw();
  }

  private draw(): void {
    render(<HudView state={this.state} atlas={this.atlas} onInventory={this.onInventory} />, this.root);
  }
}
