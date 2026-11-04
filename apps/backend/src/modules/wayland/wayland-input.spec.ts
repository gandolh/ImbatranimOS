import { toHostMessage } from './wayland-input';

const S = 'abcdefghijklmnop';

describe("checking the tab's Linux window input", () => {
  it('keeps well-formed messages and adds the session', () => {
    expect(toHostMessage(S, { type: 'focus', toplevel: null })).toEqual({
      type: 'focus',
      session: S,
      toplevel: null,
    });
    expect(
      toHostMessage(S, {
        type: 'pointer_axis',
        toplevel: 1,
        dx: 0,
        dy: 15,
        v120x: 0,
        v120y: 120,
        wheel: true,
      }),
    ).toMatchObject({ type: 'pointer_axis', session: S, v120y: 120 });
  });

  it('drops anything out of range or of the wrong type', () => {
    expect(
      toHostMessage(S, { type: 'key', keycode: 0x300, pressed: true }),
    ).toBeNull();
    expect(
      toHostMessage(S, { type: 'key', keycode: 30, pressed: 'yes' }),
    ).toBeNull();
    expect(
      toHostMessage(S, { type: 'pointer_motion', toplevel: -1, x: 0, y: 0 }),
    ).toBeNull();
    expect(
      toHostMessage(S, { type: 'pointer_motion', toplevel: 1, x: NaN, y: 0 }),
    ).toBeNull();
    expect(
      toHostMessage(S, {
        type: 'pointer_button',
        toplevel: 1,
        button: 0x118,
        pressed: true,
      }),
    ).toBeNull();
    expect(toHostMessage(S, { type: 'focus', toplevel: '1' })).toBeNull();
    expect(toHostMessage(S, { type: 'session_close' })).toBeNull();
  });

  it("passes a window's position and a press outside the Linux windows", () => {
    expect(
      toHostMessage(S, { type: 'position', toplevel: 3, x: -20, y: 40 }),
    ).toEqual({ type: 'position', session: S, toplevel: 3, x: -20, y: 40 });
    expect(
      toHostMessage(S, { type: 'position', toplevel: 3, x: 1.5, y: 40 }),
    ).toBeNull();
    expect(
      toHostMessage(S, { type: 'position', toplevel: 3, x: 0, y: 1e9 }),
    ).toBeNull();
    expect(
      toHostMessage(S, { type: 'press_outside', session: 'other' }),
    ).toEqual({ type: 'press_outside', session: S });
  });

  it('clamps a configured size into the viewport limits', () => {
    expect(
      toHostMessage(S, {
        type: 'configure',
        toplevel: 1,
        width: 1e9,
        height: -5,
        maximized: true,
      }),
    ).toEqual({
      type: 'configure',
      session: S,
      toplevel: 1,
      width: 16384,
      height: 1024,
      maximized: true,
    });
  });

  it('passes a keyboard layout the host offers, and nothing else', () => {
    expect(toHostMessage(S, { type: 'keyboard_layout', layout: 'ro' })).toEqual(
      {
        type: 'keyboard_layout',
        session: S,
        layout: 'ro',
      },
    );
    expect(toHostMessage(S, { type: 'keyboard_layout', layout: 'us' })).toEqual(
      {
        type: 'keyboard_layout',
        session: S,
        layout: 'us',
      },
    );
    for (const layout of ['de', '', 'ro,us', 1, null, undefined]) {
      expect(toHostMessage(S, { type: 'keyboard_layout', layout })).toBeNull();
    }
  });
});
