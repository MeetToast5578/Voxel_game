import { describe, expect, it } from 'vitest';
import { GamepadInput, type VirtualInput } from '../src/input/gamepad';

function pad(buttons: number[], axes = [0, 0, 0, 0]): Gamepad {
  return { connected: true, axes, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.includes(i), touched: false, value: buttons.includes(i) ? 1 : 0 })) } as unknown as Gamepad;
}

/** Records what the pad holds, as Input would. */
function fakeInput() {
  const keys = new Set<string>(), buttons = new Set<number>(), look = { dx: 0, dy: 0 }, wheel = { steps: 0 };
  const input: VirtualInput = {
    setVirtualKey: (code, down) => { if (down) keys.add(code); else keys.delete(code); },
    setVirtualButton: (b, down) => { if (down) buttons.add(b); else buttons.delete(b); },
    addLook: (dx, dy) => { look.dx += dx; look.dy += dy; },
    addWheel: (n) => { wheel.steps += n; },
  };
  return { input, keys, buttons, look, wheel };
}

describe('gamepad (T-K6)', () => {
  it('maps sticks and buttons to keys, mouse buttons, look and slots; Start is reported once', () => {
    const f = fakeInput();
    let state = pad([0, 7], [0, -1, 1, 0]);
    const gp = new GamepadInput(f.input, () => [state]);
    expect(gp.poll(0.1)).toBe(false);
    expect([...f.keys].sort()).toEqual(['KeyW', 'Space']);
    expect([...f.buttons]).toEqual([0]);
    expect(f.look.dx).toBeGreaterThan(0);
    expect(gp.used).toBe(true);
    state = pad([5, 9]);
    expect(gp.poll(0.1)).toBe(true);
    expect(f.keys.size).toBe(0);
    expect(f.buttons.size).toBe(0);
    expect(f.wheel.steps).toBe(1);
    expect(gp.poll(0.1)).toBe(false); // still held: not a new press
  });

  it('does nothing without a pad, and a small stick tilt neither moves nor looks', () => {
    const f = fakeInput();
    expect(new GamepadInput(f.input, () => [null]).poll(0.1)).toBe(false);
    const gp = new GamepadInput(f.input, () => [pad([], [0.1, 0.2, 0.1, 0.1])]);
    gp.poll(0.1);
    expect(f.keys.size).toBe(0);
    expect(f.look.dx).toBe(0);
    expect(gp.used).toBe(false);
  });
});
