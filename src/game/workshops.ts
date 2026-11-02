import { BLOCKS } from '../engine/blocks';
import { Inventory, type ItemStack } from './inventory';

export type WorkshopKind = 'trade' | 'forge' | 'sign' | 'frame';
export const WORKSHOP_BLOCKS: Readonly<Record<string, WorkshopKind>> = { trading_post:'trade', ember_forge:'forge', sign:'sign', item_frame:'frame' };
export interface TradeOffer { name: string; cost: readonly [string,number]; gives: readonly [string,number] }
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
];
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
export function trade(inv:Inventory, offer:number): boolean {
  const o=TRADE_OFFERS[offer];if(!o)return false;
  const next=copy(inv);
  if(!take(next,...o.cost)||next.add({state:BLOCKS.state(o.gives[0]),count:o.gives[1]})!==0)return false;
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
