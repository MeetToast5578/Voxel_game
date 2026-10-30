import { render } from 'preact';
import { useRef } from 'preact/hooks';
import { BLOCK_SIZE_M, MAX_HEALTH, MAX_HUNGER, BREATH_S, MAX_VIEW_CHUNKS, MIN_VIEW_CHUNKS } from '../config';
import { BLOCKS } from '../engine/blocks';
import { clickSlot, type ItemStack } from '../game/inventory';
import type { Play } from '../game/play';
import type { Settings } from '../storage/settings';
import type { WorldMeta } from '../storage/store';
import { iconUrl } from './icons';

/** What the UI shows and can do; main.ts provides it. */
export interface UiModel {
  play: Play;
  /** The pause menu is open (pointer not captured and no game screen). */
  paused: boolean;
  dead: boolean;
  settings: Settings;
  worldName: string;
  worlds: WorldMeta[];
  resume(): void;
  respawn(): void;
  changeSettings(s: Settings): void;
  openWorld(name: string, create?: { seed: number; mode: string }): void;
  deleteWorld(name: string): void;
  exportWorld(name: string): void;
  importWorld(file: File): void;
  refreshWorlds(): void;
}

/** Placeable blocks and items in the creative palette. */
const PALETTE = BLOCKS.types.filter((t) => t.layer !== 'none' && !['flowing_water', 'flowing_lava', 'lit_furnace', 'bedrock'].includes(t.key)).map((t) => t.id);

function Slot(props: { stack: ItemStack | null; onClick?: (right: boolean) => void; selected?: boolean; big?: boolean }) {
  const s = props.stack;
  const tool = s ? BLOCKS.type(s.state).tool : undefined;
  return (
    <div class={`slot${props.selected ? ' selected' : ''}${props.big ? ' big' : ''}`} title={s ? BLOCKS.type(s.state).name : ''}
      onMouseDown={(e) => { e.preventDefault(); props.onClick?.(e.button === 2); }} onContextMenu={(e) => e.preventDefault()}>
      {s && <img src={iconUrl(s.state)} draggable={false} />}
      {s && s.count > 1 && <span class="count">{s.count}</span>}
      {s && tool && s.wear ? <span class="wear" style={{ width: `${100 * (1 - s.wear / tool.durability)}%` }} /> : null}
    </div>
  );
}

function Bar(props: { value: number; max: number; color: string; label: string }) {
  return (
    <div class="bar" title={props.label}>
      <div style={{ width: `${(100 * Math.max(0, props.value)) / props.max}%`, background: props.color }} />
    </div>
  );
}

function Hud({ play }: { play: Play }) {
  const inv = play.inventory;
  const s = play.survival;
  return (
    <div class="hud">
      {play.mode === 'survival' && (
        <div class="bars">
          <Bar value={s.health} max={MAX_HEALTH} color="#d33" label="Health" />
          <Bar value={s.hunger} max={MAX_HUNGER} color="#c8862a" label="Hunger" />
          {s.air < BREATH_S && <Bar value={s.air} max={BREATH_S} color="#5ad" label="Air" />}
        </div>
      )}
      <div class="hotbar">{inv.slots.slice(0, 9).map((st, i) => <Slot stack={st} selected={i === inv.selected} />)}</div>
      {play.breaking > 0 && <div class="progress"><div style={{ width: `${play.breaking * 100}%` }} /></div>}
    </div>
  );
}

function Grid({ slots, from, to, play, cols = 9 }: { slots: (ItemStack | null)[]; from: number; to: number; play: Play; cols?: number }) {
  return (
    <div class="grid" style={{ gridTemplateColumns: `repeat(${cols}, auto)` }}>
      {slots.slice(from, to).map((st, k) => (
        <Slot stack={st} onClick={(right) => { play.cursor = clickSlot(slots, from + k, play.cursor, right); play.version++; }} />
      ))}
    </div>
  );
}

function InventoryScreen({ play }: { play: Play }) {
  const inv = play.inventory.slots;
  const furnace = play.screen === 'furnace' && play.openFurnace ? play.furnaces.get(play.openFurnace) : undefined;
  return (
    <div class="screen" onContextMenu={(e) => e.preventDefault()}>
      {furnace ? (
        <div class="row">
          <div class="col">
            <Slot stack={furnace.input} onClick={(r) => { const box = [furnace.input]; play.cursor = clickSlot(box, 0, play.cursor, r); furnace.input = box[0]!; play.version++; }} />
            <div class="flame" style={{ opacity: furnace.burn > 0 ? 1 : 0.2 }}>🔥</div>
            <Slot stack={furnace.fuel} onClick={(r) => { const box = [furnace.fuel]; play.cursor = clickSlot(box, 0, play.cursor, r); furnace.fuel = box[0]!; play.version++; }} />
          </div>
          <div class="progress small"><div style={{ width: `${(furnace.progress / 8) * 100}%` }} /></div>
          <Slot big stack={furnace.output} onClick={() => {
            if (furnace.output && (!play.cursor || (play.cursor.state === furnace.output.state))) {
              play.cursor = play.cursor ? { ...play.cursor, count: play.cursor.count + furnace.output.count } : furnace.output;
              furnace.output = null;
              play.version++;
            }
          }} />
        </div>
      ) : play.mode === 'creative' ? (
        <div class="palette">
          {PALETTE.map((s) => <Slot stack={{ state: s, count: 1 }} onClick={() => { play.cursor = { state: s, count: BLOCKS.type(s).maxStack ?? 64 }; play.version++; }} />)}
        </div>
      ) : (
        <div class="row">
          <Grid slots={play.craft} from={0} to={play.craftSize * play.craftSize} play={play} cols={play.craftSize} />
          <span class="arrow">→</span>
          <Slot big stack={play.craftOutput} onClick={() => play.takeCraft()} />
        </div>
      )}
      <Grid slots={inv} from={9} to={36} play={play} />
      <Grid slots={inv} from={0} to={9} play={play} />
      {play.cursor && <div class="hint">Holding {BLOCKS.type(play.cursor.state).name} × {play.cursor.count}. E or Esc closes.</div>}
    </div>
  );
}

function Menu({ m }: { m: UiModel }) {
  const s = m.settings;
  const set = (patch: Partial<Settings>) => m.changeSettings({ ...s, ...patch });
  // Form fields live in refs: the menu re-renders while open, and plain variables would reset.
  const form = useRef({ name: '', seed: '', mode: 'survival' }).current;
  return (
    <div class="menu">
      <h1>Paused</h1>
      <button class="primary" onClick={m.resume}>Resume</button>
      <h2>Settings</h2>
      <label>View distance: {s.viewChunks} chunks ({Math.round(s.viewChunks * 16 * BLOCK_SIZE_M)} m)
        <input type="range" min={MIN_VIEW_CHUNKS} max={MAX_VIEW_CHUNKS} step={1} value={s.viewChunks} onInput={(e) => set({ viewChunks: Number((e.target as HTMLInputElement).value) })} />
      </label>
      <label>Field of view: {Math.round(s.fov)}°
        <input type="range" min={40} max={110} step={1} value={s.fov} onInput={(e) => set({ fov: Number((e.target as HTMLInputElement).value) })} />
      </label>
      <label>Mouse sensitivity
        <input type="range" min={0.0005} max={0.01} step={0.0001} value={s.mouseSensitivity} onInput={(e) => set({ mouseSensitivity: Number((e.target as HTMLInputElement).value) })} />
      </label>
      <h2>Worlds</h2>
      <ul class="worlds">
        {m.worlds.map((w) => (
          <li>
            <b>{w.name}</b> <small>seed {w.seed} · {new Date(w.lastPlayed).toLocaleString()}</small>
            {w.name === m.worldName ? <em> (playing)</em> : <button onClick={() => m.openWorld(w.name)}>Open</button>}
            <button onClick={() => m.exportWorld(w.name)}>Export</button>
            {w.name !== m.worldName && <button onClick={() => { if (confirm(`Delete world '${w.name}'? This cannot be undone.`)) m.deleteWorld(w.name); }}>Delete</button>}
          </li>
        ))}
      </ul>
      <div class="newworld">
        <input placeholder="New world name" onInput={(e) => (form.name = (e.target as HTMLInputElement).value)} />
        <input placeholder="Seed (optional)" onInput={(e) => (form.seed = (e.target as HTMLInputElement).value)} />
        <select onChange={(e) => (form.mode = (e.target as HTMLSelectElement).value)}>
          <option value="survival">Survival</option>
          <option value="creative">Creative</option>
        </select>
        <button onClick={() => {
          const name = form.name.trim();
          if (!name) return;
          const text = form.seed.trim();
          const seed = text === '' ? Math.floor(Math.random() * 2 ** 31) : Number.isFinite(Number(text)) ? Number(text) : hashSeed(text);
          m.openWorld(name, { seed, mode: form.mode });
        }}>Create</button>
        <label class="file">Import world file <input type="file" accept=".json,application/json" onChange={(e) => {
          const f = (e.target as HTMLInputElement).files?.[0];
          if (f) m.importWorld(f);
        }} /></label>
      </div>
      <h2>Controls</h2>
      <p class="help">WASD move · Space jump / swim · Shift down (flying) · Ctrl sprint · F fly (creative) · E inventory ·
        left mouse break · right mouse place / use / eat · middle mouse pick (creative) · 1–9 or wheel hotbar · T skip an hour ·
        +/− view distance · F3 debug text</p>
    </div>
  );
}

/** A text seed as a number. */
function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function Death({ m }: { m: UiModel }) {
  return (
    <div class="menu death">
      <h1>You died</h1>
      <p>{m.play.survival.cause}</p>
      <button class="primary" onClick={m.respawn}>Respawn</button>
    </div>
  );
}

function App({ m }: { m: UiModel }) {
  return (
    <>
      <Hud play={m.play} />
      {m.play.screen !== 'none' && <InventoryScreen play={m.play} />}
      {m.dead ? <Death m={m} /> : m.paused && m.play.screen === 'none' && <Menu m={m} />}
    </>
  );
}

/** Draws the UI into `root`. Call again whenever the model changes. */
export function drawUi(root: HTMLElement, m: UiModel): void {
  render(<App m={m} />, root);
}
