import {describe,it,expect} from 'vitest';
import {BLOCKS} from '../engine/blocks';
import {Inventory,moveStack,takeOutput} from '../game/inventory';
import {Play} from '../game/play';
import {World} from '../engine/world';
import {newFurnace} from '../game/furnace';
import {blockInteractionHint} from '../game/interactionHint';
const S=(k:string)=>BLOCKS.state(k);
const play=()=>new Play(new World(),()=>{}, {sound:()=>{},sleep:()=>false},'survival');
describe('inventory quality of life',()=>{
 it('merges transfers first, retains overflow and conserves item count',()=>{
  const source=[{state:S('dirt'),count:20}],target=[{state:S('dirt'),count:60},null];
  expect(moveStack(source,0,target)).toBe(20);expect(source[0]).toBeNull();expect(target.map(s=>s?.count)).toEqual([64,16]);
  const a=[{state:S('dirt'),count:20}],b=[{state:S('dirt'),count:60}];
  expect(moveStack(a,0,b)).toBe(4);expect(a[0]!.count).toBe(16);expect(b[0]!.count).toBe(64);
 });
 it('preserves upgraded worn equipment and avoids moving into its own range',()=>{
  const inv=new Inventory();inv.slots[0]={state:S('iron_pickaxe'),count:1,wear:39,upgrade:2};
  expect(moveStack(inv.slots,0,inv.slots,9,36)).toBe(1);expect(inv.slots[9]).toEqual({state:S('iron_pickaxe'),count:1,wear:39,upgrade:2});
  expect(moveStack(inv.slots,9,inv.slots,9,36)).toBe(0);expect(inv.slots[9]!.count).toBe(1);
 });
 it('extracts only what fits from output and never replaces a mismatched cursor',()=>{
  const out={state:S('iron_ingot'),count:20};
  const result=takeOutput(out,{state:S('iron_ingot'),count:60});expect(result.cursor?.count).toBe(64);expect(result.source?.count).toBe(16);
  expect(takeOutput(out,{state:S('dirt'),count:1}).source).toBe(out);
  expect(takeOutput(out,null,true).cursor?.count).toBe(1);expect(takeOutput(out,null,true).source?.count).toBe(19);
  expect(takeOutput(out,{state:S('iron_ingot'),count:64}).source).toBe(out);
 });
 it('moves into chests, back to inventory, and respects a busy cursor',()=>{
  const p=play(),chest=new Array(27).fill(null);p.chests.set('0,0,0',chest);p.openChest='0,0,0';p.openScreen('chest');
  p.inventory.slots[0]={state:S('dirt'),count:30};p.quickMove(p.inventory.slots,0);expect(chest[0]?.count).toBe(30);
  p.quickMove(chest,0);expect(p.inventory.count(S('dirt'))).toBe(30);expect(chest[0]).toBeNull();
  p.cursor={state:S('stone'),count:1};p.quickMove(p.inventory.slots,0);expect(p.inventory.count(S('dirt'))).toBe(30);
 });
 it('puts on armour and accessories with Shift-click, swapping worn armour',()=>{
  const p=play();p.openScreen('inventory');
  p.inventory.slots[9]={state:S('iron_helmet'),count:1};p.quickMove(p.inventory.slots,9);
  expect(p.armour[0]?.state).toBe(S('iron_helmet'));expect(p.inventory.slots[9]).toBeNull();
  p.inventory.slots[9]={state:S('jade_helmet'),count:1};p.quickMove(p.inventory.slots,9);
  expect(p.armour[0]?.state).toBe(S('jade_helmet'));expect(p.inventory.slots[9]?.state).toBe(S('iron_helmet'));
  p.inventory.slots[10]={state:S('cloud_charm'),count:1};p.inventory.slots[11]={state:S('cloud_charm'),count:1};
  p.quickMove(p.inventory.slots,10);p.quickMove(p.inventory.slots,11);
  expect(p.accessories.filter((a)=>a?.state===S('cloud_charm')).length).toBe(1);expect(p.inventory.slots[11]).toBeNull();
 });
 it('routes furnace inputs/fuel and collects output without overflowing the cursor',()=>{
  const p=play(),f=newFurnace();p.furnaces.set('0,0,0',f);p.openFurnace='0,0,0';p.openScreen('furnace');
  p.inventory.slots[9]={state:S('iron_ore'),count:5};p.inventory.slots[10]={state:S('coal'),count:4};
  p.quickMove(p.inventory.slots,9);p.quickMove(p.inventory.slots,10);expect(f.input?.count).toBe(5);expect(f.fuel?.count).toBe(4);
  f.output={state:S('iron_ingot'),count:10};p.cursor={state:S('iron_ingot'),count:63};p.takeFurnaceOutput();expect(p.cursor.count).toBe(64);expect(f.output?.count).toBe(9);
  p.cursor=null;p.takeFurnaceOutput(false,true);expect(f.output).toBeNull();expect(p.inventory.count(S('iron_ingot'))).toBe(9);
 });
 it('prompts supported interactions while leaving decorative blocks without a false use action',()=>{
  expect(blockInteractionHint(S('sign'))).toContain('Edit sign');expect(blockInteractionHint(S('trading_post'))).toContain('Trade');
  expect(blockInteractionHint(S('stone'))).toBe('Stone');
 });
});
