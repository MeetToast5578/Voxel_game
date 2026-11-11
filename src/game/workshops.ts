import { BLOCKS } from '../engine/blocks';
import { Inventory, type ItemStack } from './inventory';

export type WorkshopKind = 'trade' | 'forge' | 'sign' | 'frame' | 'waystone';
export const WORKSHOP_BLOCKS: Readonly<Record<string, WorkshopKind>> = { trading_post:'trade', ember_forge:'forge', sign:'sign', item_frame:'frame', waystone:'waystone' };
/** A trade: what it costs (and a second thing, for the tinkerer's combinations) and what it gives. */
export interface TradeOffer { name: string; cost: readonly [string,number]; also?: readonly [string,number]; gives: readonly [string,number] }
export const TRADE_OFFERS: readonly TradeOffer[] = [
  {name:'Sell wheat',cost:['wheat',8],gives:['trade_coin',1]},
  {name:'Sell wool',cost:['wool',4],gives:['trade_coin',2]},
  {name:'Sell iron',cost:['iron_ingot',4],gives:['trade_coin',3]},
  {name:'Buy seeds',cost:['trade_coin',2],gives:['wheat',6]},
  {name:'Buy cooked food',cost:['trade_coin',3],gives:['cooked_meat',4]},
  {name:'Buy leather',cost:['trade_coin',2],gives:['leather',2]},
  {name:'Buy iron',cost:['trade_coin',5],gives:['iron_ingot',2]},
  {name:'Buy a map',cost:['trade_coin',6],gives:['map',1]},
  {name:'Buy a lantern',cost:['trade_coin',4],gives:['lantern',1]},
  {name:'Sell gel',cost:['gel',10],gives:['trade_coin',1]},
  {name:'Buy a Gel Crown',cost:['trade_coin',20],gives:['slime_crown',1]},
  {name:'Buy a Swiftstep Anklet',cost:['trade_coin',30],gives:['swift_anklet',1]},
  {name:'Buy a Gill Pendant',cost:['trade_coin',25],gives:['gill_pendant',1]},
  {name:'Buy a Life Crystal',cost:['trade_coin',60],gives:['life_crystal',1]},
];
const offer = (name: string, cost: readonly [string, number], gives: readonly [string, number]): TradeOffer => ({ name, cost, gives });
/** Each villager's own shop; the traveling trader and trading posts use TRADE_OFFERS. */
export const SHOPS: Readonly<Record<string, readonly TradeOffer[]>> = {
  farmer: [
    offer('Sell wheat', ['wheat', 6], ['trade_coin', 1]), offer('Sell carrots', ['carrots', 8], ['trade_coin', 1]),
    offer('Buy seeds', ['trade_coin', 1], ['wheat', 4]), offer('Buy carrots', ['trade_coin', 2], ['carrots', 3]),
    offer('Buy potatoes', ['trade_coin', 2], ['potatoes', 3]), offer('Buy baked potatoes', ['trade_coin', 2], ['baked_potato', 4]),
    offer('Buy bone meal', ['trade_coin', 1], ['bone_meal', 4]), offer('Buy wool', ['trade_coin', 2], ['wool', 2]),
  ],
  smith: [
    offer('Sell coal', ['coal', 10], ['trade_coin', 1]), offer('Sell iron', ['iron_ingot', 3], ['trade_coin', 2]),
    offer('Buy iron', ['trade_coin', 4], ['iron_ingot', 2]), offer('Buy an iron sword', ['trade_coin', 10], ['iron_sword', 1]),
    offer('Buy an iron pickaxe', ['trade_coin', 12], ['iron_pickaxe', 1]), offer('Buy an iron helmet', ['trade_coin', 12], ['iron_helmet', 1]),
    offer('Buy an iron chestplate', ['trade_coin', 18], ['iron_chestplate', 1]), offer('Buy an Ironskin Band', ['trade_coin', 35], ['iron_band', 1]),
    offer('Buy a bucket', ['trade_coin', 5], ['bucket', 1]), offer('Buy a lantern', ['trade_coin', 4], ['lantern', 1]),
  ],
  guide: [
    offer('Buy torches', ['trade_coin', 1], ['torch', 8]), offer('Buy wheat seeds', ['trade_coin', 1], ['wheat', 6]),
    offer('Buy a map', ['trade_coin', 5], ['map', 1]), offer('Buy a compass', ['trade_coin', 5], ['compass', 1]),
    offer('Sell logs', ['log', 16], ['trade_coin', 1]),
  ],
  merchant: [
    offer('Buy arrows', ['trade_coin', 2], ['arrow', 16]), offer('Buy a bucket', ['trade_coin', 6], ['bucket', 1]),
    offer('Buy a Grappling Hook', ['trade_coin', 20], ['grappling_hook', 1]), offer('Buy string', ['trade_coin', 1], ['string', 3]),
    offer('Sell gold', ['gold_ingot', 1], ['trade_coin', 4]), offer('Sell diamonds', ['diamond', 1], ['trade_coin', 10]),
    offer('Sell meteor shards', ['meteor_shard', 1], ['trade_coin', 6]),
  ],
  nurse: [
    offer('Buy a Healing Potion', ['trade_coin', 4], ['healing_potion', 1]), offer('Buy an Antidote', ['trade_coin', 4], ['antidote', 1]),
    offer('Buy a Regeneration Potion', ['trade_coin', 6], ['regeneration_potion', 1]), offer('Buy a Life Crystal', ['trade_coin', 50], ['life_crystal', 1]),
  ],
  alchemist: [
    offer('Buy red mushrooms', ['trade_coin', 1], ['red_mushroom', 2]), offer('Buy poppies', ['trade_coin', 1], ['poppy', 2]),
    offer('Buy dandelions', ['trade_coin', 1], ['dandelion', 2]), offer('Buy brown mushrooms', ['trade_coin', 1], ['brown_mushroom', 2]),
    offer('Buy a Swiftness Potion', ['trade_coin', 7], ['swiftness_potion', 1]), offer('Buy a Water Breathing Potion', ['trade_coin', 8], ['water_breathing_potion', 1]),
    offer('Buy a Fire Resistance Potion', ['trade_coin', 10], ['fire_resistance_potion', 1]),
  ],
  // The tinkerer puts two accessories together into one that does both.
  tinkerer: [
    {name:'Combine into a Storm Charm',cost:['cloud_charm',1],also:['feather_charm',1],gives:['storm_charm',1]},
    {name:'Combine into Sprint Boots',cost:['swift_anklet',1],also:['dash_boots',1],gives:['sprint_boots',1]},
    {name:'Combine into a Guardian Band',cost:['iron_band',1],also:['heart_locket',1],gives:['guardian_band',1]},
    {name:'Combine into an Elemental Amulet',cost:['ember_ring',1],also:['gill_pendant',1],gives:['elemental_amulet',1]},
    offer('Buy Dash Boots', ['trade_coin', 40], ['dash_boots', 1]), offer('Buy a Grappling Hook', ['trade_coin', 25], ['grappling_hook', 1]),
  ],
  // The explorer sells maps to places not yet marked, and buys the shards found on the way.
  explorer: [
    offer('Buy a treasure map', ['trade_coin', 8], ['treasure_map', 1]), offer('Sell crystal shards', ['crystal_shard', 4], ['trade_coin', 3]),
    offer('Sell frost shards', ['frost_shard', 4], ['trade_coin', 3]), offer('Sell dune fangs', ['dune_fang', 4], ['trade_coin', 3]),
    offer('Buy a Wisp in a Bottle', ['trade_coin', 50], ['wisp_bottle', 1]),
  ],
  herbalist: [
    offer('Sell feathers', ['feather', 6], ['trade_coin', 1]), offer('Sell gel', ['gel', 8], ['trade_coin', 1]),
    offer('Buy cooked fish', ['trade_coin', 2], ['cooked_fish', 3]), offer('Buy a Gill Pendant', ['trade_coin', 25], ['gill_pendant', 1]),
    offer('Buy a Featherfall Charm', ['trade_coin', 30], ['feather_charm', 1]), offer('Buy a Heart Locket', ['trade_coin', 45], ['heart_locket', 1]),
    offer('Buy a Life Crystal', ['trade_coin', 55], ['life_crystal', 1]), offer('Buy a Gel Crown', ['trade_coin', 18], ['slime_crown', 1]),
    offer('Buy glass bottles', ['trade_coin', 2], ['glass_bottle', 3]), offer('Buy a Healing Potion', ['trade_coin', 6], ['healing_potion', 1]),
    offer('Buy an Antidote', ['trade_coin', 5], ['antidote', 1]),
  ],
};
const copy = (inv: Inventory) => {const other=new Inventory();inv.slots.forEach((s,i)=>other.slots[i]=s?{...s}:null);other.selected=inv.selected;return other;};
function take(inv: Inventory, key: string, count: number): boolean {
  const slots=inv.slots.filter(s=>s&&BLOCKS.type(s.state).key===key&&!s.wear&&!s.upgrade&&BLOCKS.variant(s.state)===0);
  if(slots.reduce((sum,s)=>sum+s!.count,0)<count)return false;
  for(let i=0;i<inv.slots.length&&count>0;i++){
    const s=inv.slots[i];if(!s||!slots.includes(s))continue;
    const n=Math.min(count,s.count);s.count-=n;count-=n;if(!s.count)inv.slots[i]=null;
  }
  return true;
}
const commit=(inv:Inventory,other:Inventory)=>other.slots.forEach((s,i)=>inv.slots[i]=s);
/** All exchanges commit together, including capacity checks; failures never consume payment. */
export function trade(inv:Inventory, offer:number, offers:readonly TradeOffer[]=TRADE_OFFERS): boolean {
  const o=offers[offer];if(!o)return false;
  const next=copy(inv);
  if(!take(next,...o.cost)||(o.also&&!take(next,...o.also))||next.add({state:BLOCKS.state(o.gives[0]),count:o.gives[1]})!==0)return false;
  commit(inv,next);return true;
}
export function upgradeCost(stack:ItemStack):number{return 3*((stack.upgrade??0)+1);}
export function forge(inv:Inventory, slot:number):boolean {
  const next=copy(inv),s=next.slots[slot];if(!s)return false;
  const t=BLOCKS.type(s.state);if(!(t.tool||t.armour)||(s.upgrade??0)>=3)return false;
  if(!take(next,'ember_crystal',upgradeCost(s))||!take(next,'iron_ingot',2))return false;
  s.upgrade=(s.upgrade??0)+1;commit(inv,next);return true;
}
export function cleanSign(text:string):string {
  return text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,'').split('\n').slice(0,4).map(l=>l.slice(0,24)).join('\n').slice(0,96);
}
const position=/^-?\d+,-?\d+,-?\d+$/;
/** World decorations are independent of loaded meshes and stored by cell coordinates. */
export class Decorations {
  readonly signs=new Map<string,string>();
  readonly frames=new Map<string,ItemStack>();
  version=0;
  setSign(key:string,text:string):void {if(!position.test(key))return;this.signs.set(key,cleanSign(text));this.version++;}
  frame(inv:Inventory,key:string,slot:number|null):boolean {
    if(!position.test(key))return false;
    const next=copy(inv),old=this.frames.get(key);let inserted:ItemStack|null=null;
    if(slot!==null){const held=next.slots[slot];if(!held)return false;inserted={...held,count:1};if(--held.count===0)next.slots[slot]=null;}
    if(old&&next.add(old)!==0)return false;
    commit(inv,next);if(inserted)this.frames.set(key,inserted);else this.frames.delete(key);this.version++;return true;
  }
  remove(key:string):ItemStack|undefined {const old=this.frames.get(key);this.frames.delete(key);this.signs.delete(key);this.version++;return old;}
  save():unknown {return {signs:[...this.signs],frames:[...this.frames].map(([k,s])=>[k,BLOCKS.stateName(s.state),s.wear??0,s.upgrade??0])};}
  load(saved:unknown):void {
    this.signs.clear();this.frames.clear();if(!saved||typeof saved!=='object')return;
    const p=saved as {signs?:unknown;frames?:unknown};
    if(Array.isArray(p.signs))for(const e of p.signs)if(Array.isArray(e)&&typeof e[0]==='string'&&position.test(e[0])&&typeof e[1]==='string')this.signs.set(e[0],cleanSign(e[1]));
    if(Array.isArray(p.frames))for(const e of p.frames){
      if(!Array.isArray(e)||typeof e[0]!=='string'||!position.test(e[0])||typeof e[1]!=='string')continue;
      const state=BLOCKS.parseStateName(e[1]);if(state===null)continue;
      this.frames.set(e[0],{state,count:1,wear:Math.max(0,Number(e[2])||0),upgrade:Math.max(0,Math.min(3,Math.floor(Number(e[3])||0)))});
    }
    this.version++;
  }
}
