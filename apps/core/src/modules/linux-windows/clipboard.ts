import { sendToLinuxApps } from "./linuxWindowsStore";

/**
 * Copy and paste between the session's Linux apps and the real clipboard:
 * plain text, both ways, on the keys.
 *
 * - Out: a Linux app that copies text has the host send it here, and it is
 *   written to the clipboard (`writeText`, which a page may do freely).
 * - In: a paste key in a Linux window reads the clipboard (`readText`, which
 *   asks permission: Chrome once per site, Firefox on every paste), hands the
 *   text to the host as the session's selection, and only then lets the key
 *   through, so the app pastes it.
 *
 * Reads happen on a paste key and nowhere else: no polling.
 */

/** The most text that crosses, in UTF-8 bytes; the backend and host agree. */
export const MAX_CLIPBOARD_BYTES = 1024 * 1024;

/**
 * How long a paste waits for the clipboard. A permission prompt left open
 * longer lets the key through with whatever the Linux side already had.
 */
export const PASTE_READ_TIMEOUT_MS = 10_000;

type KeyLike = Pick<KeyboardEvent, "code" | "ctrlKey" | "shiftKey" | "altKey" | "metaKey">;

/** Ctrl+V, Ctrl+Shift+V (terminals) and Shift+Insert, by physical key. */
export function isPasteKey(e: KeyLike): boolean {
  if (e.altKey || e.metaKey) return false;
  if (e.code === "KeyV") return e.ctrlKey;
  if (e.code === "Insert") return e.shiftKey && !e.ctrlKey;
  return false;
}

export type ClipboardAccess = Pick<Clipboard, "readText" | "writeText">;

const utf8Length = (text: string) => new TextEncoder().encode(text).length;

export class LinuxClipboard {
  /**
   * What the clipboard held when it and the Linux side last agreed: text a
   * Linux app copied (once written), or text read for a paste. A paste that
   * reads the same text leaves the Linux side alone, so an app pasting what
   * it copied itself keeps its own, richer copy (Firefox's HTML), and a
   * Linux copy the clipboard missed isn't overwritten by older text.
   */
  private agreed: string | null = null;
  private readonly access: () => ClipboardAccess | undefined;

  constructor(access: () => ClipboardAccess | undefined) {
    this.access = access;
  }

  /** A Linux app copied text: put it on the clipboard. */
  fromLinux(text: string): Promise<void> {
    const clipboard = this.access();
    if (!clipboard) return Promise.resolve();
    return clipboard.writeText(text).then(
      () => {
        this.agreed = text;
      },
      // Refused (the page isn't focused): the clipboard keeps what it had.
      () => undefined,
    );
  }

  /**
   * Before a paste key reaches the app: the clipboard's text for the host,
   * or null to leave the Linux side's selection as it is (unchanged, refused,
   * empty, too large, or no answer in time). Never rejects.
   */
  async forPaste(timeoutMs = PASTE_READ_TIMEOUT_MS): Promise<string | null> {
    const clipboard = this.access();
    if (!clipboard) return null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    try {
      const text = await Promise.race([clipboard.readText().catch(() => null), late]);
      if (!text || text === this.agreed || utf8Length(text) > MAX_CLIPBOARD_BYTES) return null;
      this.agreed = text;
      return text;
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Keys to the Linux apps, in order. A paste key holds every key after it
 * until the clipboard has been read and its text handed over, so the app
 * sees the selection before the key, and the key's release after its press.
 * Every other key goes at once.
 */
export class PasteGate {
  private held: object[] | null = null;
  private readonly send: (message: object) => void;
  private readonly clipboard: Pick<LinuxClipboard, "forPaste">;

  constructor(send: (message: object) => void, clipboard: Pick<LinuxClipboard, "forPaste">) {
    this.send = send;
    this.clipboard = clipboard;
  }

  /** A key press or release that isn't a paste. */
  key(message: object): void {
    if (this.held) this.held.push(message);
    else this.send(message);
  }

  /** The press of a paste key. */
  paste(message: object): void {
    if (this.held) {
      // A second paste while the first reads goes after it, with its text.
      this.held.push(message);
      return;
    }
    this.held = [message];
    void this.clipboard.forPaste().then((text) => {
      if (text !== null) this.send({ type: "clipboard", text });
      const held = this.held ?? [];
      this.held = null;
      for (const m of held) this.send(m);
    });
  }
}

export const linuxClipboard = new LinuxClipboard(() =>
  typeof navigator === "undefined" ? undefined : navigator.clipboard,
);

export const linuxKeys = new PasteGate(sendToLinuxApps, linuxClipboard);
