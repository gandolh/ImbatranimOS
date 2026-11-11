import type { AppIdentity } from "./app-identity.types";
import {
  formatMode,
  IMPLIED_DIRECTORY,
  IMPLIED_FILE,
  newEntry,
  parseMode,
  permits,
  R,
  S_ISGID,
  W,
  X,
  type ModeEntry,
} from "./modes";

function app(appId: string, install: string): AppIdentity {
  return {
    appId,
    instanceId: `${appId}-1`,
    windowId: null,
    groups: [appId, install],
  };
}

const docs = app("office-docs", "imbatranim-office");
const sheets = app("office-sheets", "imbatranim-office");
const stranger = app("hollow", "hollow");
const notepad = app("notepad", "system");

describe("modes: one class of bits applies", () => {
  // rw- r-- --- : owner reads and writes, group reads, others nothing.
  const entry: ModeEntry = {
    owner: "office-docs",
    group: "imbatranim-office",
    mode: 0o640,
  };

  it("the owner reads and writes per the owner bits", () => {
    expect(permits(docs, entry, R)).toBe(true);
    expect(permits(docs, entry, W)).toBe(true);
    expect(permits(docs, entry, X)).toBe(false);
  });

  it("a group member reads and writes per the group bits", () => {
    expect(permits(sheets, entry, R)).toBe(true);
    expect(permits(sheets, entry, W)).toBe(false);
  });

  it("anyone else reads and writes per the others bits", () => {
    expect(permits(stranger, entry, R)).toBe(false);
    expect(permits(stranger, entry, W)).toBe(false);
    const open: ModeEntry = { ...entry, mode: 0o646 };
    expect(permits(stranger, open, R | W)).toBe(true);
  });

  it("the owner gets the owner bits even when the group bits say more", () => {
    const odd: ModeEntry = { ...entry, mode: 0o060 };
    expect(permits(docs, odd, R)).toBe(false);
    expect(permits(sheets, odd, R | W)).toBe(true);
  });

  it("the user (no app identity) may do anything", () => {
    expect(permits(null, { ...entry, mode: 0 }, R | W | X)).toBe(true);
  });

  it("a path with no row is the user’s: every app, built-in or not, only passes through", () => {
    expect(permits(notepad, IMPLIED_FILE, R)).toBe(false);
    expect(permits(notepad, IMPLIED_FILE, W)).toBe(false);
    expect(permits(notepad, IMPLIED_DIRECTORY, R)).toBe(false);
    expect(permits(notepad, IMPLIED_DIRECTORY, W)).toBe(false);
    expect(permits(notepad, IMPLIED_DIRECTORY, X)).toBe(true);
    expect(permits(null, IMPLIED_FILE, R | W)).toBe(true);
    expect(permits(stranger, IMPLIED_FILE, R)).toBe(false);
    expect(permits(stranger, IMPLIED_DIRECTORY, R)).toBe(false);
    expect(permits(stranger, IMPLIED_DIRECTORY, X)).toBe(true);
  });
});

describe("modes: new entries", () => {
  it("an app’s new data is private, in its own group, as under umask 077", () => {
    expect(newEntry(stranger, IMPLIED_DIRECTORY, "file")).toEqual({
      owner: "hollow",
      group: "hollow",
      mode: 0o600,
    });
    expect(newEntry(stranger, IMPLIED_DIRECTORY, "directory")).toEqual({
      owner: "hollow",
      group: "hollow",
      mode: 0o700,
    });
  });

  it("a setgid folder passes its group on, and its bit to subfolders", () => {
    const shared: ModeEntry = {
      owner: null,
      group: "imbatranim-office",
      mode: parseMode("rwxrws---"),
    };
    expect(newEntry(docs, shared, "file", 0o660)).toEqual({
      owner: "office-docs",
      group: "imbatranim-office",
      mode: 0o660,
    });
    const sub = newEntry(docs, shared, "directory");
    expect(sub).toEqual({
      owner: "office-docs",
      group: "imbatranim-office",
      mode: 0o700 | S_ISGID,
    });
    // …and on again, one level further down.
    expect(newEntry(sheets, sub!, "file")?.group).toBe("imbatranim-office");
  });

  it("the group passed on only shares what the mode lets it", () => {
    const shared: ModeEntry = {
      owner: null,
      group: "imbatranim-office",
      mode: 0o2770,
    };
    const privateFile = newEntry(docs, shared, "file")!;
    expect(permits(sheets, privateFile, R)).toBe(false);
    const sharedFile = newEntry(docs, shared, "file", 0o660)!;
    expect(permits(sheets, sharedFile, R | W)).toBe(true);
    expect(permits(stranger, sharedFile, R)).toBe(false);
  });

  it("the user needs no row outside a setgid folder, and joins its group inside", () => {
    expect(newEntry(null, IMPLIED_DIRECTORY, "file")).toBeNull();
    expect(newEntry(null, { owner: null, group: "suite", mode: 0o2770 }, "file")).toEqual({
      owner: null,
      group: "suite",
      mode: 0o660,
    });
  });

  it("refuses a mode out of range", () => {
    expect(() => newEntry(docs, IMPLIED_DIRECTORY, "file", 0o10000)).toThrow(RangeError);
    expect(() => newEntry(docs, IMPLIED_DIRECTORY, "file", 1.5)).toThrow(RangeError);
  });
});

describe("modes: the ls letters", () => {
  it.each([
    [0o600, "rw-------"],
    [0o700, "rwx------"],
    [0o2770, "rwxrws---"],
    [0o2760, "rwxrwS---"],
    [0o1777, "rwxrwxrwt"],
    [0o4755, "rwsr-xr-x"],
    [0o771, "rwxrwx--x"],
  ])("%o reads as %s and back", (mode, text) => {
    expect(formatMode(mode)).toBe(text);
    expect(parseMode(text)).toBe(mode);
  });

  it("refuses text that is not a mode", () => {
    expect(() => parseMode("rwxrwxrws")).toThrow(RangeError);
    expect(() => parseMode("rwx")).toThrow(RangeError);
  });
});
