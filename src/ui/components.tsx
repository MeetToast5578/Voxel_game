import type { ComponentChildren } from 'preact';
import type { ItemStack } from '../player/inventory';
import { iconUrl } from './icons';

interface SlotProps {
  stack: ItemStack | null;
  atlas: HTMLCanvasElement;
  /** Spoken and shown as the tooltip: the block's name and count, or "empty". */
  label: string;
  selected?: boolean;
  keyLabel?: string;
  /** Inventory slots are buttons: native pointer/touch clicks, Enter and Space call this. Hotbar slots have none. */
  onPress?: () => void;
  onHover?: (over: boolean) => void;
}

/** One inventory or hotbar slot: the block's icon, its count when above one, and the hotbar key number. */
export function Slot(p: SlotProps) {
  const body = (
    <>
      {p.stack && <img class="icon" src={iconUrl(p.atlas, p.stack.state)} alt="" draggable={false} />}
      {p.stack && p.stack.count > 1 && <span class="count">{p.stack.count}</span>}
      {p.keyLabel && <span class="key">{p.keyLabel}</span>}
    </>
  );
  const cls = `slot${p.selected ? ' selected' : ''}`;
  if (!p.onPress) {
    return (
      <div class={cls} aria-label={p.label}>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      class={`${cls} inv-slot`}
      aria-label={p.label}
      onClick={() => p.onPress?.()}
      onKeyDown={event => { if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault(); }}
      onMouseEnter={() => p.onHover?.(true)}
      onMouseLeave={() => p.onHover?.(false)}
      onFocus={() => p.onHover?.(true)}
      onBlur={() => p.onHover?.(false)}
    >
      {body}
    </button>
  );
}

/** A labelled group of rows, for the settings and controls lists. */
export function Section({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <section class="menu-section">
      <h2 class="menu-heading">{title}</h2>
      {children}
    </section>
  );
}
