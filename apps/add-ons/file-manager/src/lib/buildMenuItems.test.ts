import { describe, expect, it, vi } from "vitest";
import type { ContextMenuItem } from "@imbatranim/ui";
import { buildMenuItems, type BuildMenuItemsCtx } from "./buildMenuItems";
import type { Associations } from "./openWith";
import type { FsEntry } from "../types";

/** Open in Terminal: on a folder's menu and the background's, never on a file's or inside an archive. */

const assoc: Associations = {
  resolveOpener: () => ({ appId: "", reason: "none" }),
  candidatesFor: () => [],
  allCandidates: () => [],
  keyFor: (name) => name,
  openerName: () => null,
  setDefault: () => undefined,
};

const entry = (type: FsEntry["type"], path: string): FsEntry => ({
  name: path.split("/").at(-1) ?? path,
  path,
  type,
  size: 0,
  modifiedAt: "2026-11-22T00:00:00Z",
});

function menu(over: Partial<BuildMenuItemsCtx>) {
  const noop = () => undefined;
  const ctx = {
    entry: null,
    root: "home",
    assoc,
    hasClipboard: false,
    onOpen: noop,
    onOpenWith: noop,
    onDownload: noop,
    onRename: noop,
    onCopy: noop,
    onCut: noop,
    onDelete: noop,
    onNewFile: noop,
    onNewFolder: noop,
    onProperties: noop,
    onNewOfficeFile: noop,
    onUpload: noop,
    onPaste: noop,
    onRefresh: noop,
    onExtract: noop,
    onCompress: noop,
    onCompare: null,
    onEditInPaint: noop,
    onOpenInTerminal: noop,
    ...over,
  } as BuildMenuItemsCtx;
  return buildMenuItems(ctx);
}

const item = (items: ContextMenuItem[], label: string) =>
  items.find((i) => "label" in i && i.label === label) as { onSelect: () => void } | undefined;

describe("Open in Terminal", () => {
  it("opens a Terminal in a right-clicked folder", () => {
    const onOpenInTerminal = vi.fn();
    const folder = entry("directory", "projects/x");
    item(menu({ entry: folder, onOpenInTerminal }), "Open in Terminal")?.onSelect();
    expect(onOpenInTerminal).toHaveBeenCalledWith(folder);
  });

  it("opens one in the folder on show from the background menu", () => {
    const onOpenInTerminal = vi.fn();
    item(menu({ onOpenInTerminal }), "Open in Terminal")?.onSelect();
    expect(onOpenInTerminal).toHaveBeenCalledWith(null);
  });

  it("isn't on a file's menu, or inside an archive", () => {
    expect(item(menu({ entry: entry("file", "notes.txt") }), "Open in Terminal")).toBeUndefined();
    expect(item(menu({ inArchive: true }), "Open in Terminal")).toBeUndefined();
    expect(item(menu({ inArchive: true, entry: entry("directory", "a") }), "Open in Terminal")).toBeUndefined();
  });
});
