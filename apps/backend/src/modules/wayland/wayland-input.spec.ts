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
});
