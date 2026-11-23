// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { Terminal } from "@xterm/xterm";
import { colorSchemeReports, type ColorMode } from "./colorSchemeReports";

/** A real xterm, never opened: its parser runs all the same. */
let term: Terminal;
let mode: ColorMode;
let sent: string[];
let reports: ReturnType<typeof colorSchemeReports>;
const write = (data: string) => new Promise<void>((r) => term.write(data, r));

beforeEach(() => {
  term = new Terminal({ allowProposedApi: true });
  mode = "dark";
  sent = [];
  reports = colorSchemeReports(
    term,
    () => mode,
    (d) => sent.push(d),
  );
});

describe("dark and light mode reports", () => {
  it("answers the query with the desktop's mode", async () => {
    await write("\x1b[?996n");
    mode = "light";
    await write("\x1b[?996n");
    expect(sent).toEqual(["\x1b[?997;1n", "\x1b[?997;2n"]);
  });

  it("reports a mode change once while reports are on, and not while they are off", async () => {
    reports.modeChanged();
    expect(sent).toEqual([]);
    await write("\x1b[?2031h");
    mode = "light";
    reports.modeChanged();
    expect(sent).toEqual(["\x1b[?997;2n"]);
    await write("\x1b[?2031l");
    reports.modeChanged();
    expect(sent).toHaveLength(1);
  });

  it("leaves the other modes in the same sequence to xterm", async () => {
    await write("\x1b[?2031;1049h");
    expect(reports.enabled).toBe(true);
    expect(term.buffer.active.type).toBe("alternate");
    await write("\x1b[?1049;2031l");
    expect(reports.enabled).toBe(false);
    expect(term.buffer.active.type).toBe("normal");
  });

  it("says whether reports are on when asked with DECRQM, and leaves other DECRQM to xterm", async () => {
    await write("\x1b[?2031$p");
    await write("\x1b[?2031h\x1b[?2031$p");
    expect(sent).toEqual(["\x1b[?2031;2$y", "\x1b[?2031;1$y"]);
  });

  it("turns reports off on a full reset", async () => {
    await write("\x1b[?2031h\x1bc");
    expect(reports.enabled).toBe(false);
  });

  it("stops answering once disposed", async () => {
    reports.dispose();
    await write("\x1b[?996n");
    expect(sent).toEqual([]);
  });
});
