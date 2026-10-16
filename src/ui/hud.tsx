import { render } from 'preact';
import { HOTBAR_SIZE } from '../config';
import type { ItemStack } from '../player/inventory';
import { getBlockDef } from '../world/blocks';
import { Slot } from './components';
import { HINT_KEYS } from './controls';

const NAME_VISIBLE_S = 1.5;
/** The key hints show for this many seconds of play, so a new player sees how to open the inventory. */
const HINT_SECONDS = 60;

interface HudState {
  slots: (ItemStack | null)[];
  selected: number;
  name: string;
  nameVisible: boolean;
  tool: string;
  hints: boolean;
}

function HudView({ state, atlas }: { state: HudState; atlas: HTMLCanvasElement }) {
  return (
    <>
      <div class="crosshair" />
      <div class={`block-name${state.nameVisible ? ' visible' : ''}`}>{state.name}</div>
      <div class="tool-label" style={{ display: state.tool ? '' : 'none' }}>
        {state.tool}
      </div>
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
  private nameTimer = 0;
  private hintTimer = HINT_SECONDS;

  constructor(parent: HTMLElement, private readonly atlas: HTMLCanvasElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    parent.append(this.root);
    this.state = {
      slots: Array.from({ length: HOTBAR_SIZE }, () => null),
      selected: 0,
      name: '',
      nameVisible: false,
      tool: '',
      hints: true,
    };
    this.draw();
  }

  /** Call once per frame. `playing` is true while the game receives input (the hints count down only then). */
  update(stacks: readonly (ItemStack | null)[], selected: number, frameDt: number, playing: boolean): void {
    const slots = stacks.slice(0, HOTBAR_SIZE);
    const key = slots.map((s) => (s ? `${s.state}:${s.count}` : '-')).join(',');
    let next = this.state;
    let dirty = false;
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

  /** The volume tool's line (empty hides it). Only redraws when the text changes. */
  setToolLabel(text: string): void {
    if (text === this.state.tool) return;
    this.state = { ...this.state, tool: text };
    this.draw();
  }

  private draw(): void {
    render(<HudView state={this.state} atlas={this.atlas} />, this.root);
  }
}
