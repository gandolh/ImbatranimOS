import { clampRatio, toHostMessage } from './wayland-input';
import {
  MAX_CLIPBOARD_BYTES,
  MAX_RATIO,
  MAX_TEXT_INPUT_BYTES,
} from './wayland.constants';

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

  it("passes the tab's devicePixelRatio with its viewport, clamped", () => {
    expect(
      toHostMessage(S, {
        type: 'viewport',
        width: 800,
        height: 600,
        ratio: 2.625,
      }),
    ).toEqual({
      type: 'output',
      session: S,
      width: 800,
      height: 600,
      ratio: 2.625,
    });
    for (const bad of [undefined, null, '', 'x', 0, -2, Infinity]) {
      expect(clampRatio(bad)).toBe(1);
    }
    expect(clampRatio('1.5')).toBe(1.5);
    expect(clampRatio(1e6)).toBe(MAX_RATIO);
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

  it("passes a paste's clipboard text up to the limit, and nothing else", () => {
    expect(toHostMessage(S, { type: 'clipboard', text: 'pasted ș\n' })).toEqual(
      { type: 'clipboard', session: S, text: 'pasted ș\n' },
    );
    const atLimit = 'a'.repeat(MAX_CLIPBOARD_BYTES);
    expect(toHostMessage(S, { type: 'clipboard', text: atLimit })).toEqual({
      type: 'clipboard',
      session: S,
      text: atLimit,
    });
    // Counted in UTF-8 bytes: ș is two.
    expect(
      toHostMessage(S, { type: 'text_edit', toplevel: 1, commit: '😀' }),
    ).toMatchObject({ commit: '😀' });
    const overInBytes = 'ș'.repeat(MAX_CLIPBOARD_BYTES / 2 + 1);
    for (const text of ['', overInBytes, 1, null, undefined, ['x']]) {
      expect(toHostMessage(S, { type: 'clipboard', text })).toBeNull();
    }
  });

  it('passes a text edit with any of its parts, checked, and nothing more', () => {
    expect(
      toHostMessage(S, {
        type: 'text_edit',
        toplevel: 3,
        delete: { before: 4, after: 0, extra: 1 },
        commit: 'bună ',
        preedit: { text: 'ziu', cursor_begin: 3, cursor_end: 3 },
        extra: 'dropped',
      }),
    ).toEqual({
      type: 'text_edit',
      session: S,
      toplevel: 3,
      delete: { before: 4, after: 0 },
      commit: 'bună ',
      preedit: { text: 'ziu', cursor_begin: 3, cursor_end: 3 },
    });
    // A bare edit clears the preedit; a preedit's cursor may be left out.
    expect(toHostMessage(S, { type: 'text_edit', toplevel: 3 })).toEqual({
      type: 'text_edit',
      session: S,
      toplevel: 3,
    });
    expect(
      toHostMessage(S, {
        type: 'text_edit',
        toplevel: 3,
        preedit: { text: 'ș' },
      }),
    ).toEqual({
      type: 'text_edit',
      session: S,
      toplevel: 3,
      preedit: { text: 'ș' },
    });
    // The cursor counts UTF-8 bytes (ș is two), and -1 hides it.
    expect(
      toHostMessage(S, {
        type: 'text_edit',
        toplevel: 3,
        preedit: { text: 'ș', cursor_begin: -1, cursor_end: 2 },
      }),
    ).toMatchObject({ preedit: { cursor_begin: -1, cursor_end: 2 } });
  });

  it('drops a text edit with any part out of range or of the wrong type', () => {
    const atLimit = 'a'.repeat(MAX_TEXT_INPUT_BYTES);
    expect(
      toHostMessage(S, { type: 'text_edit', toplevel: 1, commit: atLimit }),
    ).toMatchObject({ commit: atLimit });
    const overInBytes = 'ș'.repeat(MAX_TEXT_INPUT_BYTES / 2 + 1);
    const bad: Record<string, unknown>[] = [
      { toplevel: -1, commit: 'a' },
      { commit: 'a' },
      { toplevel: 1, commit: overInBytes },
      { toplevel: 1, commit: 'a\u0000b' },
      { toplevel: 1, commit: 'a\uD83D' },
      { toplevel: 1, preedit: { text: '\uDE00b' } },
      { toplevel: 1, commit: 5 },
      { toplevel: 1, commit: null },
      { toplevel: 1, delete: { before: -1, after: 0 } },
      { toplevel: 1, delete: { before: 1 } },
      { toplevel: 1, delete: { before: MAX_TEXT_INPUT_BYTES + 1, after: 0 } },
      { toplevel: 1, delete: null },
      { toplevel: 1, preedit: 'x' },
      { toplevel: 1, preedit: { text: '\u0000' } },
      { toplevel: 1, preedit: { text: overInBytes } },
      { toplevel: 1, preedit: { text: 'ș', cursor_begin: 3 } },
      { toplevel: 1, preedit: { text: 'ș', cursor_end: -2 } },
      { toplevel: 1, preedit: { text: 'ș', cursor_end: 0.5 } },
    ];
    for (const m of bad) {
      expect(toHostMessage(S, { type: 'text_edit', ...m })).toBeNull();
    }
  });
});
