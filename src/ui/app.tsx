import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { BLOCK_SIZE_M, BODY_COLD_C, BODY_HOT_C, MAX_HEALTH, MAX_HUNGER, BREATH_S, MAX_VIEW_CHUNKS, MIN_VIEW_CHUNKS } from '../config';
import { BLOCKS } from '../engine/blocks';
import { clickSlot, type ItemStack } from '../game/inventory';
import { fits, RECIPES, type Recipe } from '../game/crafting';
import { MILESTONES } from '../game/journal';
import { version } from '../../package.json';
import type { Mode, Play } from '../game/play';
import { BINDINGS, DEFAULT_KEYS, keyLabel, type Binding, type Settings } from '../storage/settings';
import type { Difficulty } from '../config';
import type { WorldMeta } from '../storage/store';
import { artUrl } from './artAssets';
import { TRADE_OFFERS, upgradeCost } from '../game/workshops';
import { WOOD_SPECIES, SAPLING_SPECIES } from '../engine/blocks';
import './pixelAero.css';
import { iconUrl, stackIconUrl } from './icons';

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
  /** The beacon was just lit: the ending shows until closed. */
  ending: boolean;
  closeEnding(): void;
}

/** Placeable blocks and items in the creative palette. */
const PALETTE = BLOCKS.types.filter((t) => t.layer !== 'none' && !['flowing_water', 'flowing_lava', 'lit_furnace', 'bedrock'].includes(t.key)).flatMap((t) => t.variantFaces ? Array.from({length:t.variants},(_,v)=>t.id+v).filter(s=>t.key!=='leaves'||(s-t.id)%2===0) : [t.id]);

const TIERS = ['wooden', 'stone', 'iron', 'diamond'];

/** A slot's tooltip: the item's name, then what it is good for and how worn it is. */
export function tooltip(s: ItemStack): string {
  const t = BLOCKS.type(s.state);
  const wood=t.key==='sapling'?SAPLING_SPECIES[BLOCKS.variant(s.state)]:t.variantFaces&&['log','leaves','planks'].includes(t.key)?WOOD_SPECIES[t.key==='leaves'?Math.floor(BLOCKS.variant(s.state)/2):BLOCKS.variant(s.state)]:null;
  const lines = [wood?`${wood.replaceAll('_',' ')} ${t.name}`:t.name];
  if(s.upgrade)lines.push(`Ember upgrade ${s.upgrade}/3 · faster, stronger and more durable`);
  if (t.food) lines.push(`Food: restores ${t.food} hunger`);
  if (t.tool) lines.push(`${TIERS[t.tool.tier] ?? ''} ${t.tool.kind}, ${Math.floor(t.tool.durability * (1+(s.upgrade??0)*.5)) - (s.wear ?? 0)} of ${Math.floor(t.tool.durability*(1+(s.upgrade??0)*.5))} uses left`);
  if (t.mineWith && t.needsTier !== undefined) lines.push(`Needs a ${TIERS[t.needsTier]} ${t.mineWith} or better`);
  if (t.armour) lines.push(`Armour: stops ${(t.armour.protection+(s.upgrade??0)) * 4}% of harm, ${t.armour.warmth+(s.upgrade??0)} °C warmer, ${Math.floor(t.armour.durability*(1+(s.upgrade??0)*.5)) - (s.wear ?? 0)} hits left`);
  if (t.fuel) lines.push(`Fuel: burns ${t.fuel} s`);
  if (t.smeltsTo) lines.push(`Smelts into ${BLOCKS.type(BLOCKS.state(t.smeltsTo)).name}`);
  return lines.join('\n');
}

function Slot(props: { stack: ItemStack | null; onClick?: (right: boolean, quick?:boolean) => void; selected?: boolean; big?: boolean; title?: string; dim?: boolean; shortcut?:number }) {
  const s = props.stack;
  const t = s ? BLOCKS.type(s.state) : undefined;
  const tool = t?.tool ?? (t?.armour && { durability: t.armour.durability });
  return (
    <div class={`slot${props.selected ? ' selected' : ''}${props.big ? ' big' : ''}${props.dim ? ' dim' : ''}${s?.upgrade?' upgraded':''}`} role="button" aria-label={props.title ?? (s ? tooltip(s) : 'Empty slot')} title={props.title ?? (s ? tooltip(s) : '')} tabIndex={0}
      onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();props.onClick?.(false,e.shiftKey);}}}
      onMouseDown={(e) => { e.preventDefault(); props.onClick?.(e.button === 2,e.shiftKey); }} onContextMenu={(e) => e.preventDefault()}>
      {props.shortcut&&<span class="slot-key" aria-hidden="true">{props.shortcut}</span>}
      {s && <img src={stackIconUrl(s)} draggable={false} />}
      {s && s.count > 1 && <span class="count">{s.count}</span>}
      {s && tool && s.wear ? <span class="wear" style={{ width: `${100 * (1 - s.wear / (tool.durability*(1+(s.upgrade??0)*.5)))}%` }} /> : null}
    </div>
  );
}

function Bar(props: { value: number; max: number; color: string; label: string }) {
  return (
    <div class="status-meter"><img class="ui-glyph" alt="" src={artUrl('ui',props.label==='Health'?'status_vitality':props.label==='Hunger'?'status_hunger':'status_breath')} /><div class="bar" title={props.label}>
      <div style={{ width: `${(100 * Math.max(0, props.value)) / props.max}%`, background: props.color }} />
    </div></div>
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
      {play.message && <div class="toast">{play.message}</div>}
      {play.hints.text && <div class="hintbox">{play.hints.text} <small>({keyLabel(hideKey)} hides this)</small></div>}
      {play.mode === 'survival' && (
        <div class="bars">
          <Bar value={s.health} max={MAX_HEALTH} color="#d33" label="Health" />
          <Bar value={s.hunger} max={MAX_HUNGER} color="#c8862a" label="Hunger" />
          {s.air < BREATH_S && <Bar value={s.air} max={BREATH_S} color="#5ad" label="Air" />}
          <Thermometer coreC={s.temperature.coreC} feltC={s.feltC} />
        </div>
      )}
      <div class="hotbar">{inv.slots.slice(0, 9).map((st, i) => <Slot stack={st} shortcut={i+1} selected={i === inv.selected} />)}</div>
      {play.breaking > 0 && <div class="progress"><div style={{ width: `${play.breaking * 100}%` }} /></div>}
    </div>
  );
}

function Grid({ slots, from, to, play, cols = 9 }: { slots: (ItemStack | null)[]; from: number; to: number; play: Play; cols?: number }) {
  return (
    <div class="grid" style={{ gridTemplateColumns: `repeat(${cols}, auto)` }}>
      {slots.slice(from, to).map((st, k) => (
        <Slot stack={st} onClick={(right,quick) => { if(quick){play.quickMove(slots,from+k);return;} play.cursor = clickSlot(slots, from + k, play.cursor, right); play.version++; }} />
      ))}
    </div>
  );
}

function WorkshopScreen({play}:{play:Play}) {
  const w=play.workshop;
  const [text,setText]=useState(w?play.decorations.signs.get(w.key)??'':'');
  if(!w)return null;
  const title={trade:'Trading',forge:'Ember Forge',sign:'Edit sign',frame:'Item frame'}[w.kind];
  return <div class="screen workshop">
    <div class="workshop-head"><img alt="" src={artUrl('future',w.kind==='trade'?'map_trader':w.kind==='forge'?'ember_forge':w.kind==='sign'?'sign':'frame_empty')} /><div><h2>{title}</h2><p class="hint">{w.kind==='forge'?'Upgrade tools and armour: +20% digging speed, +50% durability per level; armour gains protection and warmth.':'Right click to interact · Esc closes'}</p></div></div>
    {w.kind==='trade'&&<div class="trade-list">{TRADE_OFFERS.map((o,i)=><button onClick={()=>play.performTrade(i)}><img alt="" src={iconUrl(BLOCKS.state(o.cost[0]))}/>{o.cost[1]} {BLOCKS.byName(o.cost[0]).name} → <img alt="" src={iconUrl(BLOCKS.state(o.gives[0]))}/>{o.gives[1]} {BLOCKS.byName(o.gives[0]).name}</button>)}</div>}
    {w.kind==='forge'&&<div class="equipment-list">{play.inventory.slots.map((s,i)=>s&&(BLOCKS.type(s.state).tool||BLOCKS.type(s.state).armour)&&<button title={tooltip(s)} disabled={(s.upgrade??0)>=3} onClick={()=>play.performForge(i)}><img alt="" src={stackIconUrl(s)}/>{BLOCKS.type(s.state).name}<span>Level {s.upgrade??0}/3</span><span>{upgradeCost(s)} ember + 2 iron</span></button>)}</div>}
    {w.kind==='sign'&&<><label>Up to four lines, 24 characters per line<textarea aria-label="Sign text" maxLength={96} value={text} onInput={e=>setText(e.currentTarget.value)}/></label><button onClick={()=>{if(play.writeSign(text))play.closeScreen();}}>Save sign</button></>}
    {w.kind==='frame'&&<><p class="help">Choose an inventory item to display. Replacing it returns the old item.</p><div class="equipment-list">{play.inventory.slots.map((s,i)=>s&&<button title={tooltip(s)} onClick={()=>play.frameItem(i)}><img alt="" src={stackIconUrl(s)}/>{BLOCKS.type(s.state).name}</button>)}</div><button onClick={()=>play.frameItem(null)}>Take displayed item</button></>}
    {play.message&&<p role="status">{play.message}</p>}
    <button onClick={()=>play.closeScreen()}>Close</button>
  </div>;
}

function InventoryScreen({ play }: { play: Play }) {
  const [search,setSearch]=useState('');
  const filtered=PALETTE.filter(state=>tooltip({state,count:1}).split('\n')[0]!.toLowerCase().includes(search.trim().toLowerCase()));
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
            <Slot stack={furnace.input} onClick={(r,q) => { const box = [furnace.input]; if(q)play.quickMove(box,0);else play.cursor = clickSlot(box, 0, play.cursor, r); furnace.input = box[0]!; play.version++; }} />
            <div class="flame" style={{ opacity: furnace.burn > 0 ? 1 : 0.2 }}>🔥</div>
            <Slot stack={furnace.fuel} onClick={(r,q) => { const box = [furnace.fuel]; if(q)play.quickMove(box,0);else play.cursor = clickSlot(box, 0, play.cursor, r); furnace.fuel = box[0]!; play.version++; }} />
          </div>
          <div class="progress small"><div style={{ width: `${(furnace.progress / 8) * 100}%` }} /></div>
          <Slot big stack={furnace.output} title="Furnace output · Shift-click to collect · Right-click for one" onClick={(right,quick)=>play.takeFurnaceOutput(right,quick)} />
        </div>
      ) : play.mode === 'creative' ? (
        <><label class="palette-search">Find a block or item<input type="search" aria-label="Search blocks and items" placeholder="Try birch, stairs or lantern…" value={search} onInput={e=>setSearch(e.currentTarget.value)}/></label>
        <div class="palette">
          {filtered.map((s) => <Slot stack={{ state: s, count: 1 }} onClick={() => { play.cursor = { state: s, count: BLOCKS.type(s).maxStack ?? 64 }; play.version++; }} />)}
        </div>{filtered.length===0&&<p role="status">No matching blocks or items.</p>}</>
      ) : (
        <>
          <div class="row">
            <div class="col armour" title="Armour: head, chest, legs, feet">
              {play.armour.map((a, i) => <Slot stack={a} onClick={(right) => play.clickArmour(i, right)} />)}
            </div>
            <Grid slots={play.craft} from={0} to={play.craftSize * play.craftSize} play={play} cols={play.craftSize} />
            <span class="arrow">→</span>
            <Slot big stack={play.craftOutput} onClick={(_r,q) => play.takeCraft(q)} />
          </div>
          <RecipeList play={play} />
        </>
      )}
      <p class="hint">Shift-click: quick transfer · Right-click: split/place one · Shift+Enter: keyboard quick transfer</p>
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
      <label>Music volume: {Math.round(s.musicVolume * 100)}%
        <input type="range" min={0} max={1} step={0.05} value={s.musicVolume} onInput={(e) => set({ musicVolume: Number((e.target as HTMLInputElement).value) })} />
      </label>
      <label>Menu and HUD size: {Math.round(s.guiScale * 100)}%
        <input type="range" min={0.75} max={1.5} step={0.05} value={s.guiScale} onChange={(e) => set({ guiScale: Number((e.target as HTMLInputElement).value) })} />
      </label>
      <label class="check"><input type="checkbox" checked={s.invertY} onChange={(e) => set({ invertY: (e.target as HTMLInputElement).checked })} /> Invert mouse Y</label>
      <label class="check"><input type="checkbox" checked={s.viewBob} onChange={(e) => set({ viewBob: (e.target as HTMLInputElement).checked })} /> View bob and sprint widening</label>
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
  const [search,setSearch]=useState('');
  const recipes=RECIPES.filter(r=>BLOCKS.byName(r.result[0]).name.toLowerCase().includes(search.trim().toLowerCase()));
  return (
    <details class="recipes" open>
      <summary>Recipes</summary>
      <input type="search" aria-label="Search recipes" placeholder="Find a recipe…" value={search} onInput={e=>setSearch(e.currentTarget.value)}/>
      {recipes.length===0&&<p role="status">No matching recipes.</p>}
      <div class="palette">
        {recipes.map((r) => {
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
      {m.play.mode === 'survival' && <Journal play={m.play} />}
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
      <p class="version">Version {version}</p>
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

function StatsList({ play }: { play: Play }) {
  const s = play.stats;
  return (
    <p class="help">Days survived {s.days} · walked {(s.walkedM / 1000).toFixed(1)} km · creatures defeated {s.killed} ·
      blocks mined {s.mined} · deaths {s.deaths}</p>
  );
}

function Journal({ play }: { play: Play }) {
  return (
    <details class="journal">
      <summary>Journal: {play.journal.done.size} of {MILESTONES.length} milestones</summary>
      <ul class="milestones">
        {MILESTONES.map((ms) => <li class={play.journal.done.has(ms.id) ? 'done' : ''}>{play.journal.done.has(ms.id) ? '✔' : '·'} {ms.name}</li>)}
      </ul>
      <StatsList play={play} />
    </details>
  );
}

function Death({ m }: { m: UiModel }) {
  return (
    <div class="menu death">
      <h1>You died</h1>
      <p>{m.play.survival.cause}</p>
      <StatsList play={m.play} />
      <button class="primary" onClick={m.respawn}>Respawn</button>
    </div>
  );
}

function Ending({ m }: { m: UiModel }) {
  return (
    <div class="menu ending">
      <h1>The beacon burns</h1>
      <p>High above the land the old light is lit again. Its glow carries over every valley you crossed and every cave you
        came back up from.</p>
      <StatsList play={m.play} />
      <p class="help">{m.play.journal.done.size} of {MILESTONES.length} milestones reached. The world is still yours.</p>
      <button class="primary" onClick={m.closeEnding}>Keep playing</button>
    </div>
  );
}

function App({ m }: { m: UiModel }) {
  if (m.loading !== null) return <div class="menu loading"><h1>Loading</h1><p>{m.loading}</p></div>;
  return (
    <>
      <Hud play={m.play} hideKey={m.settings.keys.hint} />
      {m.play.workshop ? <WorkshopScreen key={m.play.workshop.key} play={m.play}/> : m.play.screen !== 'none' && <InventoryScreen play={m.play} />}
      {m.dead ? <Death m={m} /> : m.ending ? <Ending m={m} /> : m.paused && m.play.screen === 'none' && <Menu m={m} />}
    </>
  );
}

/** Draws the UI into `root`. Call again whenever the model changes. */
export function drawUi(root: HTMLElement, m: UiModel): void {
  render(<App m={m} />, root);
}
