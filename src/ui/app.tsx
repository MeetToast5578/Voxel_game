import { render, type ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ARMOUR_PER_POINT, BLOCK_SIZE_M, BODY_COLD_C, BODY_HOT_C, MAX_HUNGER, MAX_MANA, BREATH_S, MAX_VIEW_CHUNKS, MIN_VIEW_CHUNKS } from '../config';
import { BLOCKS } from '../engine/blocks';
import { clickSlot, type ItemStack } from '../game/inventory';
import { canCraft, CRAFTS, haveFor, timesCraftable } from '../game/crafting';
import { MILESTONES } from '../game/journal';
import { version } from '../../package.json';
import { armourFactor, type Mode, type Play } from '../game/play';
import { EFFECTS, type Effect } from '../game/effects';
import { sourcesOf, usesOf } from '../game/guide';
import { SPECIES } from '../creatures/species';
import { BINDINGS, DEFAULT_KEYS, keyLabel, type Binding, type Settings } from '../storage/settings';
import type { Difficulty } from '../config';
import type { WorldMeta } from '../storage/store';
import { artUrl } from './artAssets';
import { upgradeCost } from '../game/workshops';
import { WOOD_SPECIES, SAPLING_SPECIES } from '../engine/blocks';
import './pixelAero.css';
import { iconUrl, stackIconUrl } from './icons';
import { rarity, RARITY_NAMES } from '../game/rarity';

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

const TIERS = ['wooden', 'stone', 'iron', 'diamond', 'jade'];

/** A slot's tooltip: the item's name, then what it is good for and how worn it is. */
export function tooltip(s: ItemStack): string {
  const t = BLOCKS.type(s.state);
  const wood=t.key==='sapling'?SAPLING_SPECIES[BLOCKS.variant(s.state)]:t.variantFaces&&['log','leaves','planks'].includes(t.key)?WOOD_SPECIES[t.key==='leaves'?Math.floor(BLOCKS.variant(s.state)/2):BLOCKS.variant(s.state)]:null;
  const r = rarity(s);
  const lines = [`${wood?`${wood.replaceAll('_',' ')} ${t.name}`:t.name}${r ? ` · ${RARITY_NAMES[r]}` : ''}`];
  if(s.upgrade)lines.push(`Ember upgrade ${s.upgrade}/3 · faster, stronger and more durable`);
  if (t.food) lines.push(`Food: restores ${t.food} hunger`);
  if (t.tool) lines.push(`${TIERS[t.tool.tier] ?? ''} ${t.tool.kind}, ${Math.floor(t.tool.durability * (1+(s.upgrade??0)*.5)) - (s.wear ?? 0)} of ${Math.floor(t.tool.durability*(1+(s.upgrade??0)*.5))} uses left`);
  if (t.mineWith && t.needsTier !== undefined) lines.push(`Needs a ${TIERS[t.needsTier]} ${t.mineWith} or better`);
  if (t.armour) lines.push(`Armour: stops ${Math.round((t.armour.protection+(s.upgrade??0)) * ARMOUR_PER_POINT * 100)}% of harm, ${t.armour.warmth+(s.upgrade??0)} °C warmer, ${Math.floor(t.armour.durability*(1+(s.upgrade??0)*.5)) - (s.wear ?? 0)} hits left`);
  if (t.accessory) lines.push(`Accessory: ${t.accessory.effect}`);
  if (t.potion) lines.push(`Potion: ${t.potion.text} (right click to drink)`);
  if (t.spell) lines.push(`Magic: ${t.spell.damage} damage, ${t.spell.mana} mana a cast (hold right click)`);
  if (t.fuel) lines.push(`Fuel: burns ${t.fuel} s`);
  if (t.smeltsTo) lines.push(`Smelts into ${BLOCKS.type(BLOCKS.state(t.smeltsTo)).name}`);
  // The item guide: where it comes from and what it goes into.
  const from = sourcesOf(t.key), uses = usesOf(t.key);
  if (from.length) lines.push(`From: ${from.join('; ')}`);
  if (uses.length) lines.push(`Used in: ${uses.slice(0, 5).join(', ')}${uses.length > 5 ? ` and ${uses.length - 5} more` : ''}`);
  return lines.join('\n');
}

function Slot(props: { stack: ItemStack | null; onClick?: (right: boolean, quick?:boolean) => void; selected?: boolean; big?: boolean; title?: string; dim?: boolean; shortcut?:number }) {
  const s = props.stack;
  const t = s ? BLOCKS.type(s.state) : undefined;
  const tool = t?.tool ?? (t?.armour && { durability: t.armour.durability });
  return (
    <div class={`slot${props.selected ? ' selected' : ''}${props.big ? ' big' : ''}${props.dim ? ' dim' : ''}${s?.upgrade?' upgraded':''}${s && rarity(s) ? ` rarity-${rarity(s)}` : ''}`} role="button" aria-label={props.title ?? (s ? tooltip(s) : 'Empty slot')} title={props.title ?? (s ? tooltip(s) : '')} tabIndex={0}
      onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();props.onClick?.(false,e.shiftKey);}}}
      onMouseDown={(e) => { e.preventDefault(); props.onClick?.(e.button === 2,e.shiftKey); }} onContextMenu={(e) => e.preventDefault()}>
      {props.shortcut&&<span class="slot-key" aria-hidden="true">{props.shortcut}</span>}
      {s && <img alt="" src={stackIconUrl(s)} draggable={false} />}
      {s && s.count > 1 && <span class="count">{s.count}</span>}
      {s && tool && s.wear ? <span class="wear" style={{ width: `${100 * (1 - s.wear / (tool.durability*(1+(s.upgrade??0)*.5)))}%` }} /> : null}
    </div>
  );
}

function Bar(props: { value: number; max: number; color: string; label: string }) {
  return (
    <div class="status-meter"><img class="ui-glyph" alt="" src={artUrl('ui',props.label==='Health'?'status_vitality':props.label==='Hunger'?'status_hunger':'status_breath')} /><div class="bar" title={props.label} role="meter" aria-label={props.label} aria-valuenow={Math.round(props.value)} aria-valuemax={props.max}>
      <div style={{ width: `${(100 * Math.max(0, props.value)) / props.max}%`, background: props.color }} /><span>{Math.ceil(Math.max(0, props.value))}</span>
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
          <Bar value={s.health} max={s.maxHealth} color="#d33" label="Health" />
          <Bar value={s.hunger} max={MAX_HUNGER} color="#c8862a" label="Hunger" />
          {s.air < BREATH_S && <Bar value={s.air} max={BREATH_S} color="#5ad" label="Air" />}
          {(s.mana < MAX_MANA || (play.held && BLOCKS.type(play.held.state).spell)) && <Bar value={s.mana} max={MAX_MANA} color="#5a6cf0" label="Mana" />}
          <Thermometer coreC={s.temperature.coreC} feltC={s.feltC} />
        </div>
      )}
      {play.mode === 'survival' && <Effects s={s} />}
      <div class="hotbar">{inv.slots.slice(0, 9).map((st, i) => <Slot key={i} stack={st} shortcut={i+1} selected={i === inv.selected} />)}</div>
      {play.breaking > 0 && <div class="progress"><div style={{ width: `${play.breaking * 100}%` }} /></div>}
    </div>
  );
}

/** Status effects with the seconds left of each, harmful ones marked. */
function Effects({ s }: { s: Play['survival'] }) {
  const list: [string, number, boolean][] = (Object.entries(s.effects) as [Effect, number][]).map(([k, left]) => [EFFECTS[k].name, left, !!EFFECTS[k].bad]);
  if (s.burning > 0) list.unshift(['Burning', s.burning, true]);
  if (!list.length) return null;
  return <ul class="effects" aria-label="Status effects">{list.map(([name, left, bad]) => <li key={name} class={bad ? 'bad' : 'good'}>{name} <small>{Math.ceil(left)} s</small></li>)}</ul>;
}

function Grid({ slots, from, to, play, cols = 9 }: { slots: (ItemStack | null)[]; from: number; to: number; play: Play; cols?: number }) {
  return (
    <div class="grid" style={{ gridTemplateColumns: `repeat(${cols}, auto)` }}>
      {slots.slice(from, to).map((st, k) => (
        <Slot key={from+k} stack={st} onClick={(right,quick) => { if(quick){play.quickMove(slots,from+k);return;} play.cursor = clickSlot(slots, from + k, play.cursor, right); play.version++; }} />
      ))}
    </div>
  );
}

function ScreenHead({title,subtitle,close}:{title:string;subtitle:string;close:()=>void}) {
  return <header class="screen-head"><div><span class="eyebrow">FIELD KIT</span><h2>{title}</h2><p class="hint">{subtitle}</p></div><button class="close-screen" aria-label="Close" onClick={close}>×<small>ESC</small></button></header>;
}

function MenuShell({title,subtitle,tabs,active,select,children,action}:{title:string;subtitle:string;tabs:readonly string[];active:string;select:(tab:string)=>void;children:ComponentChildren;action?:ComponentChildren}) {
  return <><div class="menu-shade"/><div class={`menu menu-shell${title==='Voxel Game'?' title':''}`} role="dialog" aria-label={title} aria-modal="true">
    <aside class="menu-rail"><div class="brand-mark" aria-hidden="true">◆</div><span class="eyebrow">WOODLAND &amp; EMBER</span><h1>{title}</h1><p class="rail-copy">{subtitle}</p><nav aria-label="Menu sections">{tabs.map(tab=><button key={tab} aria-current={active===tab?'page':undefined} onClick={()=>select(tab)}>{tab}<span aria-hidden="true">›</span></button>)}</nav><div class="rail-bottom">{action}<small>Voxel Game · {version}</small></div></aside>
    <main class="menu-content">{children}</main>
  </div></>;
}

function WorkshopScreen({play}:{play:Play}) {
  const w=play.workshop;
  const [text,setText]=useState(w?play.decorations.signs.get(w.key)??'':'');
  if(!w)return null;
  const title={trade:'Trading',forge:'Ember Forge',sign:'Edit sign',frame:'Item frame'}[w.kind];
  return <div class="screen workshop" role="dialog" aria-modal="true" aria-label={title}>
    <ScreenHead title={title} subtitle={w.kind==='forge'?'Strengthen the equipment you carry. Each level adds speed, protection and durability.':'Supplies for the journey ahead.'} close={()=>play.closeScreen()}/>
    <p class="pack-summary">{play.inventory.slots.filter(Boolean).length}/36 pack slots · {play.inventory.count(BLOCKS.state('trade_coin'))} coins · {play.inventory.count(BLOCKS.state('ember_crystal'))} ember · {play.inventory.count(BLOCKS.state('iron_ingot'))} iron</p>
    {w.kind==='trade'&&<div class="trade-list">{play.offers.map((o,i)=>{const owned=play.inventory.count(BLOCKS.state(o.cost[0]));return <button key={i} disabled={owned<o.cost[1]} onClick={()=>play.performTrade(i)}><span class="offer-item"><img alt="" src={iconUrl(BLOCKS.state(o.gives[0]))}/><b>{o.gives[1]} {BLOCKS.byName(o.gives[0]).name}</b></span><span class="offer-cost"><img alt="" src={iconUrl(BLOCKS.state(o.cost[0]))}/>{o.cost[1]} {BLOCKS.byName(o.cost[0]).name}<small>You have {owned}</small></span></button>;})}</div>}
    {w.kind==='forge'&&<div class="equipment-list">{play.inventory.slots.map((s,i)=>s&&(BLOCKS.type(s.state).tool||BLOCKS.type(s.state).armour)&&<button title={tooltip(s)} disabled={(s.upgrade??0)>=3} onClick={()=>play.performForge(i)}><img alt="" src={stackIconUrl(s)}/>{BLOCKS.type(s.state).name}<span>Level {s.upgrade??0}/3</span><span>{upgradeCost(s)} ember + 2 iron</span></button>)}</div>}
    {w.kind==='sign'&&<><label>Up to four lines, 24 characters per line<textarea aria-label="Sign text" maxLength={96} value={text} onInput={e=>setText(e.currentTarget.value)}/></label><button onClick={()=>{if(play.writeSign(text))play.closeScreen();}}>Save sign</button></>}
    {w.kind==='frame'&&<><p class="help">Choose an inventory item to display. Replacing it returns the old item.</p><div class="equipment-list">{play.inventory.slots.map((s,i)=>s&&<button title={tooltip(s)} onClick={()=>play.frameItem(i)}><img alt="" src={stackIconUrl(s)}/>{BLOCKS.type(s.state).name}</button>)}</div><button onClick={()=>play.frameItem(null)}>Take displayed item</button></>}
    {play.message&&<p role="status">{play.message}</p>}
    <footer class="screen-footer">Changes are saved with your world. <button onClick={()=>play.closeScreen()}>Done</button></footer>
  </div>;
}

/** The left column of the survival inventory: worn armour and what it adds up to. */
function Character({ play }: { play: Play }) {
  const points = play.armour.reduce((n, a) => n + (a ? BLOCKS.type(a.state).armour!.protection + (a.upgrade ?? 0) : 0), play.bonus.protection);
  return <section class="character-pane"><h3>Equipment</h3>
    <div class="armour">{play.armour.map((a, i) => <Slot key={i} stack={a} title={a ? undefined : ['Helmet', 'Chest armour', 'Leg armour', 'Boots'][i]} onClick={(right) => play.clickArmour(i, right)} />)}</div>
    <p class="defense" title="Share of harm your armour stops"><b>{Math.round((1 - armourFactor(points)) * 100)}%</b> defense</p>
    <h3 class="acc-head">Accessories</h3>
    <div class="accessories">{play.accessories.map((a, i) => <Slot key={i} stack={a} title={a ? undefined : 'Accessory: charms, rings and anklets'} onClick={(right) => play.clickAccessory(i, right)} />)}</div>
  </section>;
}

function InventoryScreen({ play }: { play: Play }) {
  const [search,setSearch]=useState('');
  const filtered=PALETTE.filter(state=>tooltip({state,count:1}).split('\n')[0]!.toLowerCase().includes(search.trim().toLowerCase()));
  const inv = play.inventory.slots;
  const furnace = play.screen === 'furnace' && play.openFurnace ? play.furnaces.get(play.openFurnace) : undefined;
  const chest = play.screen === 'chest' && play.openChest ? play.chests.get(play.openChest) : undefined;
  const survivalKit = !chest && !furnace && play.mode !== 'creative';
  return (
    <div class={`screen inventory-screen${survivalKit ? ' kit' : ''}`} role="dialog" aria-modal="true" aria-label={chest?'Chest':furnace?'Furnace':'Inventory'} onContextMenu={(e) => e.preventDefault()}>
      <ScreenHead title={chest?'Chest':furnace?'Furnace':play.mode==='creative'?'Builder’s kit':'Inventory'} subtitle={chest?'Store supplies or transfer them to your pack.':furnace?'Add a material and fuel. Collect the finished result.':play.mode==='creative'?'Every block and item, ready to place.':play.station==='table'?'At a workbench: every recipe is open to you.':'Crafting by hand. Stand near a workbench for more recipes.'} close={()=>play.closeScreen()}/>
      <div class="inventory-layout">
      {survivalKit && <Character play={play} />}
      <section class="bag-pane">
        <h3>Hotbar <small>1–9 to select</small></h3>
        <Grid slots={inv} from={0} to={9} play={play} />
        <h3>Backpack <small>{inv.filter(Boolean).length}/36</small></h3>
        <Grid slots={inv} from={9} to={36} play={play} />
        <div class="bag-tools">
          <button onClick={() => play.sortBackpack()} title="Merge stacks and sort the backpack">Sort</button>
          <div class="trash" title="Trash: drop an item here to destroy it. Click again to take back the last one.">
            <Slot stack={play.trash} title={play.trash ? `Trash: ${tooltip(play.trash)}` : 'Trash'} dim onClick={() => play.clickTrash()} /><span>Trash</span>
          </div>
        </div>
        <p class="hint">Shift-click to transfer · Right-click to split or place one</p>
        {play.cursor && <div class="hint">Holding {BLOCKS.type(play.cursor.state).name} × {play.cursor.count}. E or Esc closes.</div>}
      </section>
      <section class="activity-pane">
      {chest ? (
        <><h3>Storage</h3><Grid slots={chest} from={0} to={chest.length} play={play} /></>
      ) : furnace ? (
        <div class="row">
          <div class="col"><h3>Material</h3>
            <Slot stack={furnace.input} onClick={(r,q) => { const box = [furnace.input]; if(q)play.quickMove(box,0);else play.cursor = clickSlot(box, 0, play.cursor, r); furnace.input = box[0]!; play.version++; }} />
            <div class="flame" style={{ opacity: furnace.burn > 0 ? 1 : 0.2 }}>🔥</div>
            <h3>Fuel</h3>
            <Slot stack={furnace.fuel} onClick={(r,q) => { const box = [furnace.fuel]; if(q)play.quickMove(box,0);else play.cursor = clickSlot(box, 0, play.cursor, r); furnace.fuel = box[0]!; play.version++; }} />
          </div>
          <div class="progress small"><div style={{ width: `${(furnace.progress / 8) * 100}%` }} /></div>
          <Slot big stack={furnace.output} title="Furnace output · Shift-click to collect · Right-click for one" onClick={(right,quick)=>play.takeFurnaceOutput(right,quick)} />
        </div>
      ) : play.mode === 'creative' ? (
        <><label class="palette-search">Find a block or item<input type="search" aria-label="Search blocks and items" placeholder="Try birch, stairs or lantern…" value={search} onInput={e=>setSearch(e.currentTarget.value)}/></label>
        <div class="palette">
          {filtered.map((s) => <Slot key={s} stack={{ state: s, count: 1 }} onClick={() => { play.cursor = { state: s, count: BLOCKS.type(s).maxStack ?? 64 }; play.version++; }} />)}
        </div>{filtered.length===0&&<p role="status">No matching blocks or items.</p>}</>
      ) : <CraftingPanel play={play} />}
      </section>
      </div>
    </div>
  );
}

function SettingsSection({ m }: { m: WorldsModel }) {
  const s = m.settings;
  const set = (patch: Partial<Settings>) => m.changeSettings({ ...s, ...patch });
  return (
    <div class="settings-grid"><fieldset><legend>Display &amp; camera</legend>
      <label>View distance: {s.viewChunks} chunks ({Math.round(s.viewChunks * 16 * BLOCK_SIZE_M)} m)
        <input type="range" min={MIN_VIEW_CHUNKS} max={MAX_VIEW_CHUNKS} step={1} value={s.viewChunks} onInput={(e) => set({ viewChunks: Number((e.target as HTMLInputElement).value) })} />
      </label>
      <label>Field of view: {Math.round(s.fov)}°
        <input type="range" min={40} max={110} step={1} value={s.fov} onInput={(e) => set({ fov: Number((e.target as HTMLInputElement).value) })} />
      </label>
      <label>Mouse sensitivity
        <input type="range" min={0.0005} max={0.01} step={0.0001} value={s.mouseSensitivity} onInput={(e) => set({ mouseSensitivity: Number((e.target as HTMLInputElement).value) })} />
      </label>
      </fieldset><fieldset><legend>Audio</legend><label>Effects volume: {Math.round(s.effectsVolume * 100)}%
        <input type="range" min={0} max={1} step={0.05} value={s.effectsVolume} onInput={(e) => set({ effectsVolume: Number((e.target as HTMLInputElement).value) })} />
      </label>
      <label>Music volume: {Math.round(s.musicVolume * 100)}%
        <input type="range" min={0} max={1} step={0.05} value={s.musicVolume} onInput={(e) => set({ musicVolume: Number((e.target as HTMLInputElement).value) })} />
      </label>
      </fieldset><fieldset><legend>Interface &amp; comfort</legend><label>Menu and HUD size: {Math.round(s.guiScale * 100)}%
        <input type="range" min={0.75} max={1.5} step={0.05} value={s.guiScale} onChange={(e) => set({ guiScale: Number((e.target as HTMLInputElement).value) })} />
      </label>
      <label title="Auto lowers the resolution while frames are slow, for a smooth frame rate">Resolution
        <select aria-label="Resolution" value={String(s.renderScale)} onChange={(e) => set({ renderScale: Number((e.target as HTMLSelectElement).value) })}>
          <option value="0">Auto</option><option value="1">Full</option><option value="0.85">85%</option><option value="0.7">70%</option><option value="0.5">50%</option>
        </select>
      </label>
      <label class="check"><input type="checkbox" checked={s.invertY} onChange={(e) => set({ invertY: (e.target as HTMLInputElement).checked })} /> Invert mouse Y</label>
      <label class="check"><input type="checkbox" checked={s.viewBob} onChange={(e) => set({ viewBob: (e.target as HTMLInputElement).checked })} /> View bob and sprint widening</label>
      <label class="check"><input type="checkbox" checked={s.hints} onChange={(e) => set({ hints: (e.target as HTMLInputElement).checked })} /> Show hints</label>
      </fieldset>
    </div>
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
    <details class="keys" open>
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
  const create = () => {
        const name = form.name.trim() || freshWorldName(m.worlds);
        if (m.worlds.some((w) => w.name === name) && !confirm(`A world named '${name}' exists. Replace it?`)) return;
        const text = form.seed.trim();
        const seed = text === '' ? Math.floor(Math.random() * 2 ** 31) : Number.isFinite(Number(text)) ? Number(text) : hashSeed(text);
        m.openWorld(name, { seed, mode: form.mode, difficulty: form.difficulty });
      };
  return (
    <form class="newworld" onSubmit={e=>{e.preventDefault();create();}}>
      <label>World name<input placeholder={freshWorldName(m.worlds)} aria-label="World name" onInput={(e) => (form.name = (e.target as HTMLInputElement).value)} /></label>
      <label>Seed <small>Optional</small><input placeholder="Leave blank for a surprise" aria-label="Seed" onInput={(e) => (form.seed = (e.target as HTMLInputElement).value)} /></label>
      <label>Play style<select aria-label="Mode" onChange={(e) => (form.mode = (e.target as HTMLSelectElement).value as Mode)}>
        <option value="survival">Survival</option>
        <option value="creative">Creative</option>
      </select></label>
      <label>Challenge<DifficultySelect value={form.difficulty} onChange={(d) => (form.difficulty = d)} /></label>
      <button class="create primary" type="submit">Create world <span aria-hidden="true">→</span></button>
    </form>
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
      {m.worlds.length===0&&<p class="empty-state">No saved worlds yet. Start a new adventure, or import a world below.</p>}<ul class="worlds">
        {m.worlds.map((w) => (
          <li key={w.name}>
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

const CATEGORIES = ['All', 'Tools', 'Armour', 'Building', 'Furniture', 'Potions', 'Items'] as const;
const FURNITURE = new Set(['crafting_table', 'alchemy_table', 'furnace', 'chest', 'campfire', 'bed', 'trading_post', 'ember_forge', 'beacon', 'sign', 'item_frame', 'lantern', 'torch', 'door', 'ladder']);
function category(key: string): (typeof CATEGORIES)[number] {
  const t = BLOCKS.byName(key);
  return t.tool || ['bow', 'arrow', 'fishing_rod', 'bucket'].includes(key) ? 'Tools' : t.armour ? 'Armour' : t.potion || key === 'glass_bottle' ? 'Potions' : FURNITURE.has(key) ? 'Furniture' : t.item ? 'Items' : 'Building';
}

/** Terraria-style crafting: what you can make from what you carry, by category; pick one to see it and make it. */
function CraftingPanel({ play }: { play: Play }) {
  const [search, setSearch] = useState(''), [cat, setCat] = useState<(typeof CATEGORIES)[number]>('All');
  const [all, setAll] = useState(false), [picked, setPicked] = useState<string | null>(null);
  const slots = play.inventory.slots, q = search.trim().toLowerCase();
  const list = CRAFTS.filter((c) => (cat === 'All' || category(c.result[0]) === cat) && BLOCKS.byName(c.result[0]).name.toLowerCase().includes(q))
    .map((c) => ({ c, can: canCraft(c, slots, play.stations) }))
    .filter((e) => all || e.can)
    .sort((a, b) => Number(b.can) - Number(a.can));
  const sel = list.find((e) => e.c.id === picked) ?? list[0];
  const times = sel ? (canCraft(sel.c, slots, play.stations) ? timesCraftable(sel.c, slots) : 0) : 0;
  const out = sel && { state: BLOCKS.state(sel.c.result[0]), count: sel.c.result[1] };
  return <section class="crafting">
    <h3>Crafting <small class={`station ${play.station}`}>{play.station === 'table' ? '⚒ Workbench' : '✋ By hand'}</small>{play.alchemy && <small class="station alchemy">⚗ Alchemy</small>}</h3>
    <div class="craft-cats" role="tablist">{CATEGORIES.map((k) => <button key={k} role="tab" aria-selected={cat === k} class={cat === k ? 'on' : ''} onClick={() => setCat(k)}>{k}</button>)}</div>
    <div class="recipe-tools"><input type="search" aria-label="Search recipes" placeholder="Find a recipe…" value={search} onInput={(e) => setSearch(e.currentTarget.value)} />
      <label class="check"><input type="checkbox" checked={all} onChange={(e) => setAll(e.currentTarget.checked)} />Show all</label></div>
    <div class="recipe-grid">{list.map(({ c, can }) => <button key={c.id} class={`recipe-tile${can ? ' can' : ''}${sel?.c.id === c.id ? ' on' : ''}`} title={BLOCKS.byName(c.result[0]).name}
      onClick={(e) => { setPicked(c.id); if (e.shiftKey && can) play.craftItem(c, timesCraftable(c, slots)); }}
      onDblClick={() => can && play.craftItem(c)}>
      <img alt="" src={stackIconUrl({ state: BLOCKS.state(c.result[0]), count: 1 })} />{c.result[1] > 1 && <span class="count">{c.result[1]}</span>}</button>)}</div>
    {list.length === 0 && <p class="empty-state" role="status">{all || q ? 'No matching recipes.' : 'Nothing to craft from what you carry yet. Chop a tree for logs, or tick Show all.'}</p>}
    {sel && out && <div class="recipe-detail">
      <img alt="" src={stackIconUrl(out)} />
      <div><b class={`rarity-text-${rarity(out)}`}>{BLOCKS.type(out.state).name}{out.count > 1 ? ` × ${out.count}` : ''}</b>
        <small>{tooltip(out).split('\n').slice(1).join(' · ')}</small>
        <ul class="needs">{sel.c.needs.map((n, i) => { const have = haveFor(slots, n.keys); return <li key={i} class={have >= n.count ? 'ok' : 'short'}>
          <img alt="" src={iconUrl(BLOCKS.state(n.keys[0]!))} />{n.keys.map((k) => BLOCKS.byName(k).name).join(' or ')}<span>{n.count} <small>· have {have}</small></span></li>; })}
          {sel.c.station === 'table' && <li class={play.station === 'table' ? 'ok' : 'short'}>⚒ Workbench nearby</li>}
          {sel.c.station === 'alchemy' && <li class={play.alchemy ? 'ok' : 'short'}>⚗ Alchemy table nearby</li>}</ul></div>
      <div class="craft-buttons">
        <button class="primary" disabled={times < 1} onClick={() => play.craftItem(sel.c)}>Craft</button>
        <button disabled={times < 2} onClick={() => play.craftItem(sel.c, times)} title="Craft as many as you can">All ({times})</button>
      </div>
    </div>}
  </section>;
}

function Menu({ m }: { m: UiModel }) {
  const [tab,setTab]=useState('Journey');
  return <MenuShell title="Paused" subtitle={m.worldName??'Your adventure'} tabs={['Journey','Bestiary','Settings','Worlds','Controls']} active={tab} select={setTab} action={<button class="primary" onClick={m.resume}>Resume</button>}>
    <section class="menu-panel" hidden={tab!=='Journey'}><span class="eyebrow">TAKE A BREATHER</span><h2>Your journey</h2><p class="section-copy">Your world will be here when you’re ready.</p><div class="journey-summary"><span>World<strong>{m.worldName}</strong></span><span>Mode<strong>{m.play.mode}</strong></span><span>Milestones<strong>{m.play.journal.done.size} / {MILESTONES.length}</strong></span></div>{m.play.mode==='survival'&&<><label>Difficulty<DifficultySelect value={m.play.difficulty} onChange={m.setDifficulty}/></label><Journal play={m.play}/></>}<StatsList play={m.play}/><button onClick={()=>m.exportWorld(m.worldName!)}>Export this world</button><button class="quiet" onClick={m.quitToTitle}>Save and quit to title</button></section>
    <section class="menu-panel" hidden={tab!=='Bestiary'}><span class="eyebrow">FIELD NOTES</span><h2>Bestiary</h2><Bestiary play={m.play}/></section>
    <section class="menu-panel" hidden={tab!=='Settings'}><span class="eyebrow">MAKE IT YOURS</span><h2>Settings</h2><SettingsSection m={m}/></section>
    <section class="menu-panel" hidden={tab!=='Worlds'}><span class="eyebrow">YOUR COLLECTION</span><h2>Saved worlds</h2><WorldsSection m={m}/></section>
    <section class="menu-panel" hidden={tab!=='Controls'}><span class="eyebrow">FIND YOUR RHYTHM</span><h2>Controls</h2><p class="section-copy">{CONTROLS}</p><KeyBindings m={m}/></section>
  </MenuShell>;
}

/** Distinct destinations keep world creation, saves and preferences out of one long scrolling form. */
function Title({ m }: { m: WorldsModel }) {
  const [tab,setTab]=useState('New adventure');const last=m.worlds[0];
  return <MenuShell title="Voxel Game" subtitle="Build a shelter. Explore what lies below." tabs={['New adventure','Saved worlds','Settings','Controls']} active={tab} select={setTab} action={last?<button class="primary continue" onClick={()=>m.openWorld(last.name)}>Continue: {last.name}</button>:undefined}>
    <section class="menu-panel" hidden={tab!=='New adventure'}><span class="eyebrow">THE NEXT CHAPTER</span><h2>New adventure</h2><p class="section-copy">Choose a world to call your own. Survive the wilds, or build freely in Creative.</p><NewWorldForm m={m}/><p class="save-note">Your progress saves automatically on this device. Export a copy from Saved worlds.</p></section>
    <section class="menu-panel" hidden={tab!=='Saved worlds'}><span class="eyebrow">PICK UP THE TRAIL</span><h2>Saved worlds</h2><WorldsSection m={m}/></section>
    <section class="menu-panel" hidden={tab!=='Settings'}><span class="eyebrow">MAKE IT YOURS</span><h2>Settings</h2><SettingsSection m={m}/></section>
    <section class="menu-panel" hidden={tab!=='Controls'}><span class="eyebrow">READY TO EXPLORE</span><h2>Controls</h2><p class="section-copy">{CONTROLS}</p><KeyBindings m={m}/></section>
  </MenuShell>;
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

/** Kills before a creature's drop chances are shown. */
const STUDIED_KILLS = 25;

/** Every creature: unknown until seen; then where it lives and how strong it is; kills and the drops found so far. */
function Bestiary({ play }: { play: Play }) {
  const list = SPECIES.filter((s) => !s.villager && !s.shop);
  return <>
    <p class="section-copy">{play.seen.size} of {list.length} creatures seen. Drops show once found; their chances after {STUDIED_KILLS} kills.</p>
    <ul class="bestiary">{list.map((s) => {
      const e = play.bestiary.get(s.key), seen = play.seen.has(s.key) || !!e;
      if (!seen) return <li key={s.key} class="unknown"><b>???</b><small>Not seen yet</small></li>;
      const studied = (e?.kills ?? 0) >= STUDIED_KILLS;
      const drops = (s.loot ?? []).filter(([k]) => studied || e?.drops.has(k)).map(([k, , chance]) => `${BLOCKS.byName(k).name}${studied ? ` (${Math.round((chance ?? 1) * 100)}%)` : ''}`);
      const where = s.boss ? 'summoned' : s.guardian ? 'ember shrines' : s.biomes.slice(0, 3).map((b) => b.replaceAll('_', ' ')).join(', ') + (s.biomes.length > 3 ? ' …' : '');
      return <li key={s.key} class={s.hostile ? 'hostile' : ''}><b>{s.name}</b>
        <small>{s.health} health{s.attack ? ` · ${s.attack} attack` : ''} · {where}</small>
        <small>Defeated {e?.kills ?? 0}{drops.length ? ` · drops ${drops.join(', ')}` : ''}</small></li>;
    })}</ul>
  </>;
}

function Journal({ play }: { play: Play }) {
  return (
    <details class="journal">
      <summary>Journal: {play.journal.done.size} of {MILESTONES.length} milestones</summary>
      <ul class="milestones">
        {MILESTONES.map((ms) => <li class={play.journal.done.has(ms.id) ? 'done' : ''}>{play.journal.done.has(ms.id) ? '✔' : '·'} {ms.name} <small>· {ms.reward[1]} {BLOCKS.byName(ms.reward[0]).name}</small></li>)}
      </ul>
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
      {!m.paused && m.play.screen === 'none' && !m.dead && !m.ending && <Hud play={m.play} hideKey={m.settings.keys.hint} />}
      {m.play.workshop ? <WorkshopScreen key={m.play.workshop.key} play={m.play}/> : m.play.screen !== 'none' && <InventoryScreen play={m.play} />}
      {m.dead ? <Death m={m} /> : m.ending ? <Ending m={m} /> : m.paused && m.play.screen === 'none' && <Menu m={m} />}
    </>
  );
}

/** Draws the UI into `root`. Call again whenever the model changes. */
export function drawUi(root: HTMLElement, m: UiModel): void {
  render(<App m={m} />, root);
}
