import { afterEach, describe, expect, it, vi } from 'vitest';
import { Input } from '../src/input/input';
afterEach(()=>vi.unstubAllGlobals());
function setup() {
  const events=new EventTarget(),doc=new EventTarget();
  Object.assign(doc,{pointerLockElement:null});
  vi.stubGlobal('window',events);vi.stubGlobal('document',doc);
  return {events,doc,input:new Input({} as HTMLCanvasElement)};
}
function key(events:EventTarget,type:string,code:string,extra:Record<string,boolean>={}) {
  const e=new Event(type,{cancelable:true});
  Object.assign(e,{code,repeat:false,ctrlKey:false,metaKey:false,shiftKey:false,...extra});events.dispatchEvent(e);
}
describe('platform keyboard chords',()=>{
  it.each(['ctrlKey','metaKey'])('keeps %s and Shift captured after a complete quick press/release',modifier=>{
    const {events,input}=setup();
    key(events,'keydown','KeyZ',{[modifier]:true,shiftKey:true});
    key(events,'keyup','KeyZ');
    expect(input.consumeShortcut('KeyZ')).toBe(false);
    expect(input.consumeShortcut('KeyZ',true)).toBe(true);
    expect(input.consumeShortcut('KeyZ',true)).toBe(false);
    expect(input.consumePressed('KeyZ')).toBe(false);
  });
  it('ignores repeat and clears stale commands on blur and pointer capture transitions',()=>{
    const {events,doc,input}=setup();
    key(events,'keydown','KeyY',{ctrlKey:true});expect(input.consumeShortcut('KeyY')).toBe(true);
    key(events,'keydown','KeyY',{ctrlKey:true,repeat:true});expect(input.consumeShortcut('KeyY')).toBe(false);
    key(events,'keydown','KeyY',{ctrlKey:true});events.dispatchEvent(new Event('blur'));
    expect(input.consumeShortcut('KeyY')).toBe(false);expect(input.isDown('KeyY')).toBe(false);
    key(events,'keydown','KeyY',{ctrlKey:true});doc.dispatchEvent(new Event('pointerlockchange'));
    expect(input.consumeShortcut('KeyY')).toBe(false);
  });
});
