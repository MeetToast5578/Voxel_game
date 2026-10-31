import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { BLOCK_SIZE_M, BODY_COLD_C, BODY_HOT_C, MAX_HEALTH, MAX_HUNGER, BREATH_S, MAX_VIEW_CHUNKS, MIN_VIEW_CHUNKS } from '../config';
import { BLOCKS } from '../engine/blocks';
import { clickSlot, type ItemStack } from '../game/inventory';
import { fits, RECIPES, type Recipe } from '../game/crafting';
import type { Mode, Play } from '../game/play';
import { BINDINGS, DEFAULT_KEYS, keyLabel, type Binding, type Settings } from '../storage/settings';
import type { Difficulty } from '../config';
import type { WorldMeta } from '../storage/store';
import { iconUrl } from './icons';

/** A world to create: its seed, mode and difficulty. */
export interface NewWorld {
  seed: number;
  mode: Mode;
  difficulty: Difficulty;
}

/** The saved worlds and what can be done with them, on the title screen and in the pause menu. */
export interface WorldsModel {
  /** Most recently played first. */
  worlds: WorldMeta[];
  /** The world being played, or null on the title screen. */
  worldName: string | null;
  settings: Settings;
  changeSettings(s: Settings): void;
  openWorld(name: string, create?: NewWorld): void;
  deleteWorld(name: string): void;
  exportWorld(name: string): void;
  importWorld(file: File): void;
}

/** What the in-game UI shows and can do; main.ts provides it. */
export interface UiModel extends WorldsModel {
  play: Play;
  /** The pause menu is open (pointer not captured and no game screen). */
  paused: boolean;
  dead: boolean;
  /** While the world around the spawn is still being built: what to show, or null once ready. */
  loading: string | null;
  resume(): void;
  respawn(): void;
  setDifficulty(d: Difficulty): void;
  /** Saves and goes back to the title screen. */
  quitToTitle(): void;
}

/** Placeable blocks and items in the creative palette. */
const PALETTE = BLOCKS.types.filter((t) => t.layer !== 'none' && !['flowing_water', 'flowing_lava', 'lit_furnace', 'bedrock'].includes(t.key)).map((t) => t.id);

const TIERS = ['wooden', 'stone', 'iron', 'diamond'];

/** A slot's tooltip: the item's name, then what it is good for and how worn it is. */
export function tooltip(s: ItemStack): string {
  const t = BLOCKS.type(s.state);
  const lines = [t.name];
  if (t.food) lines.push(`Food: restores ${t.food} hunger`);
  if (t.tool) lines.push(`${TIERS[t.tool.tier] ?? ''} ${t.tool.kind}, ${t.tool.durability - (s.wear ?? 0)} of ${t.tool.durability} uses left`);
  if (t.mineWith && t.needsTier !== undefined) lines.push(`Needs a ${TIERS[t.needsTier]} ${t.mineWith} or better`);
  if (t.fuel) lines.push(`Fuel: burns ${t.fuel} s`);
  if (t.smeltsTo) lines.push(`Smelts into ${BLOCKS.type(BLOCKS.state(t.smeltsTo)).name}`);
  return lines.join('\n');
}

function Slot(props: { stack: ItemStack | null; onClick?: (right: boolean) => void; selected?: boolean; big?: boolean; title?: string; dim?: boolean }) {
  const s = props.stack;
  const tool = s ? BLOCKS.type(s.state).tool : undefined;
  return (
    <div class={`slot${props.selected ? ' selected' : ''}${props.big ? ' big' : ''}${props.dim ? ' dim' : ''}`} title={props.title ?? (s ? tooltip(s) : '')} tabIndex={0}
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

/** Body temperature, coloured as it leaves normal, and how warm it feels. */
function Thermometer({ coreC, feltC }: { coreC: number; feltC: number }) {
  const color = coreC < BODY_COLD_C + 0.6 ? '#7bf' : coreC > BODY_HOT_C - 0.6 ? '#f84' : '#ddd';
  return <span class="thermo" style={{ color }} title={`Body ${coreC.toFixed(1)} °C, feels like ${Math.round(feltC)} °C`}>🌡 {coreC.toFixed(1)}° · feels {Math.round(feltC)}°</span>;
}

function Hud({ play, hideKey }: { play: Play; hideKey: string }) {
  const inv = play.inventory;
  const s = play.survival;
  return (
    <div class="hud">
      {play.hints.text && <div class="hintbox">{play.hints.text} <small>({keyLabel(hideKey)} hides this)</small></div>}
      {play.mode === 'survival' && (
        <div class="bars">
          <Bar value={s.health} max={MAX_HEALTH} color="#d33" label="Health" />
          <Bar value={s.hunger} max={MAX_HUNGER} color="#c8862a" label="Hunger" />
          {s.air < BREATH_S && <Bar value={s.air} max={BREATH_S} color="#5ad" label="Air" />}
          <Thermometer coreC={s.temperature.coreC} feltC={s.feltC} />
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
  const chest = play.screen === 'chest' && play.openChest ? play.chests.get(play.openChest) : undefined;
  return (
    <div class="screen" onContextMenu={(e) => e.preventDefault()}>
      {chest ? (
        <Grid slots={chest} from={0} to={chest.length} play={play} />
      ) : furnace ? (
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
        <>
          <div class="row">
            <Grid slots={play.craft} from={0} to={play.craftSize * play.craftSize} play={play} cols={play.craftSize} />
            <span class="arrow">→</span>
            <Slot big stack={play.craftOutput} onClick={() => play.takeCraft()} />
          </div>
          <RecipeList play={play} />
        </>
      )}
      <Grid slots={inv} from={9} to={36} play={play} />
      <Grid slots={inv} from={0} to={9} play={play} />
      {play.cursor && <div class="hint">Holding {BLOCKS.type(play.cursor.state).name} × {play.cursor.count}. E or Esc closes.</div>}
    </div>
  );
}

function SettingsSection({ m }: { m: WorldsModel }) {
  const s = m.settings;
  const set = (patch: Partial<Settings>) => m.changeSettings({ ...s, ...patch });
  return (
    <>
      <label>View distance: {s.viewChunks} chunks ({Math.round(s.viewChunks * 16 * BLOCK_SIZE_M)} m)
        <input type="range" min={MIN_VIEW_CHUNKS} max={MAX_VIEW_CHUNKS} step={1} value={s.viewChunks} onInput={(e) => set({ viewChunks: Number((e.target as HTMLInputElement).value) })} />
      </label>
      <label>Field of view: {Math.round(s.fov)}°
        <input type="range" min={40} max={110} step={1} value={s.fov} onInput={(e) => set({ fov: Number((e.target as HTMLInputElement).value) })} />
      </label>
      <label>Mouse sensitivity
        <input type="range" min={0.0005} max={0.01} step={0.0001} value={s.mouseSensitivity} onInput={(e) => set({ mouseSensitivity: Number((e.target as HTMLInputElement).value) })} />
      </label>
      <label>Effects volume: {Math.round(s.effectsVolume * 100)}%
        <input type="range" min={0} max={1} step={0.05} value={s.effectsVolume} onInput={(e) => set({ effectsVolume: Number((e.target as HTMLInputElement).value) })} />
      </label>
      <label>Menu and HUD size: {Math.round(s.guiScale * 100)}%
        <input type="range" min={0.75} max={1.5} step={0.05} value={s.guiScale} onChange={(e) => set({ guiScale: Number((e.target as HTMLInputElement).value) })} />
      </label>
      <label class="check"><input type="checkbox" checked={s.invertY} onChange={(e) => set({ invertY: (e.target as HTMLInputElement).checked })} /> Invert mouse Y</label>
      <label class="check"><input type="checkbox" checked={s.hints} onChange={(e) => set({ hints: (e.target as HTMLInputElement).checked })} /> Show hints</label>
      <KeyBindings m={m} />
    </>
  );
}

/** The key list: click a key, then press the new one (Esc keeps the old one). Keys bound twice are marked. */
function KeyBindings({ m }: { m: WorldsModel }) {
  const [waiting, setWaiting] = useState<Binding | null>(null);
  const keys = m.settings.keys;
  useEffect(() => {
    if (!waiting) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      // Esc keeps the old key; the digits stay the hotbar's.
      if (e.code !== 'Escape' && !/^Digit[1-9]$/.test(e.code)) m.changeSettings({ ...m.settings, keys: { ...m.settings.keys, [waiting]: e.code } });
      setWaiting(null);
    };
    addEventListener('keydown', onKey, { capture: true });
    return () => removeEventListener('keydown', onKey, { capture: true });
  }, [waiting]);
  const used = Object.values(keys);
  return (
    <details class="keys">
      <summary>Keys</summary>
      <div class="keygrid">
        {(Object.entries(BINDINGS) as [Binding, string][]).map(([b, label]) => (
          <>
            <span>{label}</span>
            <button class={used.filter((k) => k === keys[b]).length > 1 ? 'clash' : ''} onClick={() => setWaiting(b)}>
              {waiting === b ? 'press a key…' : keyLabel(keys[b])}
            </button>
          </>
        ))}
      </div>
      <button onClick={() => m.changeSettings({ ...m.settings, keys: { ...DEFAULT_KEYS } })}>Reset keys</button>
    </details>
  );
}

/** A name for a new world that no saved world has yet. */
export function freshWorldName(worlds: readonly { name: string }[]): string {
  const taken = new Set(worlds.map((w) => w.name));
  let n = worlds.length + 1;
  while (taken.has(`World ${n}`)) n++;
  return `World ${n}`;
}

function NewWorldForm({ m }: { m: WorldsModel }) {
  // Form fields live in refs: the menu re-renders while open, and plain variables would reset.
  const form = useRef({ name: '', seed: '', mode: 'survival' as Mode, difficulty: 'normal' as Difficulty }).current;
  return (
    <div class="newworld">
      <input placeholder={freshWorldName(m.worlds)} aria-label="World name" onInput={(e) => (form.name = (e.target as HTMLInputElement).value)} />
      <input placeholder="Seed (optional)" aria-label="Seed" onInput={(e) => (form.seed = (e.target as HTMLInputElement).value)} />
      <select aria-label="Mode" onChange={(e) => (form.mode = (e.target as HTMLSelectElement).value as Mode)}>
        <option value="survival">Survival</option>
        <option value="creative">Creative</option>
      </select>
      <DifficultySelect value={form.difficulty} onChange={(d) => (form.difficulty = d)} />
      <button class="create" onClick={() => {
        const name = form.name.trim() || freshWorldName(m.worlds);
        if (m.worlds.some((w) => w.name === name) && !confirm(`A world named '${name}' exists. Replace it?`)) return;
        const text = form.seed.trim();
        const seed = text === '' ? Math.floor(Math.random() * 2 ** 31) : Number.isFinite(Number(text)) ? Number(text) : hashSeed(text);
        m.openWorld(name, { seed, mode: form.mode, difficulty: form.difficulty });
      }}>Create world</button>
    </div>
  );
}

function DifficultySelect(props: { value: Difficulty; onChange: (d: Difficulty) => void }) {
  return (
    <select aria-label="Difficulty" value={props.value} onChange={(e) => props.onChange((e.target as HTMLSelectElement).value as Difficulty)}>
      <option value="peaceful">Peaceful</option>
      <option value="normal">Normal</option>
      <option value="hard">Hard</option>
    </select>
  );
}

function WorldsSection({ m }: { m: WorldsModel }) {
  return (
    <>
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
      <label class="file">Import world file <input type="file" accept=".json,application/json" onChange={(e) => {
        const f = (e.target as HTMLInputElement).files?.[0];
        if (f) m.importWorld(f);
      }} /></label>
    </>
  );
}

const CONTROLS = `WASD move · Space jump / swim · Shift down (flying) · Ctrl sprint · F fly (creative) · E inventory ·
  left mouse break · right mouse place / use / eat · middle mouse pick (creative) · 1–9 or wheel hotbar · Q throw ·
  T skip an hour · +/− view distance · F3 debug text. Creative building: B marks a corner, B again fills the box with
  the held block; G does the same to clear it; Ctrl+Z undo, Ctrl+Y redo.`;

/** Ingredients of a recipe, for its tooltip: '3 × Planks, 2 × Stick'. */
function ingredients(r: Recipe): string {
  const counts = new Map<string, number>();
  for (const row of r.pattern) for (const ch of row) if (ch !== ' ') counts.set(ch, (counts.get(ch) ?? 0) + 1);
  return [...counts].map(([ch, n]) => `${n} × ${r.key[ch]!.map((k) => BLOCKS.type(BLOCKS.state(k)).name).join(' or ')}`).join(', ');
}

/** Every recipe; those you can make now are bright, and a click lays one out in the grid. */
function RecipeList({ play }: { play: Play }) {
  return (
    <details class="recipes" open>
      <summary>Recipes</summary>
      <div class="palette">
        {RECIPES.map((r) => {
          const out = { state: BLOCKS.state(r.result[0]), count: r.result[1] };
          const small = !fits(r, play.craftSize);
          const title = `${BLOCKS.type(out.state).name}${out.count > 1 ? ` × ${out.count}` : ''}\nNeeds ${ingredients(r)}${small ? '\nOnly at a crafting table' : ''}`;
          return <Slot stack={out} title={title} dim={!play.canMake(r)} onClick={() => play.fillRecipe(r)} />;
        })}
      </div>
    </details>
  );
}

function Menu({ m }: { m: UiModel }) {
  return (
    <div class="menu">
      <h1>Paused</h1>
      <button class="primary" onClick={m.resume}>Resume</button>
      {m.play.mode === 'survival' && (
        <label>Difficulty <DifficultySelect value={m.play.difficulty} onChange={m.setDifficulty} /></label>
      )}
      <h2>Settings</h2>
      <SettingsSection m={m} />
      <h2>Worlds</h2>
      <WorldsSection m={m} />
      <h2>New world</h2>
      <NewWorldForm m={m} />
      <h2>Controls</h2>
      <p class="help">{CONTROLS}</p>
      <button onClick={m.quitToTitle}>Save and quit to title</button>
    </div>
  );
}

/** The first screen: carry on with the last world, start a new one, or manage the saved ones. */
function Title({ m }: { m: WorldsModel }) {
  const last = m.worlds[0];
  return (
    <div class="menu title">
      <h1>Voxel Game</h1>
      {last && <button class="primary continue" onClick={() => m.openWorld(last.name)}>Continue: {last.name}</button>}
      <h2>New world</h2>
      <NewWorldForm m={m} />
      {m.worlds.length > 0 && <><h2>Saved worlds</h2><WorldsSection m={m} /></>}
      {m.worlds.length === 0 && <WorldsSection m={m} />}
      <h2>Settings</h2>
      <SettingsSection m={m} />
      <h2>Controls</h2>
      <p class="help">{CONTROLS}</p>
    </div>
  );
}

/** Draws the title screen into `root`. Call again whenever the model changes. */
export function drawTitle(root: HTMLElement, m: WorldsModel): void {
  render(<Title m={m} />, root);
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
  if (m.loading !== null) return <div class="menu loading"><h1>Loading</h1><p>{m.loading}</p></div>;
  return (
    <>
      <Hud play={m.play} hideKey={m.settings.keys.hint} />
      {m.play.screen !== 'none' && <InventoryScreen play={m.play} />}
      {m.dead ? <Death m={m} /> : m.paused && m.play.screen === 'none' && <Menu m={m} />}
    </>
  );
}

/** Draws the UI into `root`. Call again whenever the model changes. */
export function drawUi(root: HTMLElement, m: UiModel): void {
  render(<App m={m} />, root);
}
