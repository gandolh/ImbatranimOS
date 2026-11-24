import { memo, useLayoutEffect, useRef, type RefObject } from "react";
import { Folder, Download, Pencil, Copy, Scissors, Trash2, ArrowDown, ArrowUp } from "lucide-react";
import { cn, useSystem } from "@imbatranim/ui";
import { Tooltip } from "@imbatranim/ui";
import { Button } from "@imbatranim/ui";
import type { VirtualList } from "@imbatranim/ui";
import type { FsEntry } from "../types";
import { modeFromEvent, type SelectMode } from "../lib/selectionModel";
import { ariaSort, SORT_LABELS, type SortDir, type SortKey } from "../lib/fileSort";
import { formatSize, getFileIcon } from "../lib/entryPresentation";
import dayjs from "dayjs";

type FileListProps = {
  /**
   * Already filtered and sorted by FileManager. This component must NOT reorder
   * them: the virtualizer's indices and the keyboard navigation are built from the
   * same array, so a second sort here is how the highlighted row and the row the
   * arrow keys move to drift apart.
   */
  entries: FsEntry[];
  sort: { key: SortKey; dir: SortDir };
  onSortChange: (key: SortKey) => void;
  /** Row virtualizer created in FileManager (shared with keyboard nav). */
  virtualizer: VirtualList<HTMLElement>;
  root: string;
  selected: Set<string>;
  /** `mode` comes from the modifiers — see lib/selectionModel. */
  onSelect: (path: string, mode: SelectMode) => void;
  onOpen: (entry: FsEntry) => void;
  onRename: (entry: FsEntry) => void;
  onCopy: (entry: FsEntry) => void;
  onCut: (entry: FsEntry) => void;
  onDelete: (entry: FsEntry) => void;
  onContextMenu?: (entry: FsEntry, e: React.MouseEvent) => void;
  renamingPath: string | null;
  renameValue: string;
  onRenameChange: (val: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
};

export function FileList({
  entries,
  sort,
  onSortChange,
  virtualizer,
  root,
  selected,
  onSelect,
  onOpen,
  onRename,
  onCopy,
  onCut,
  onDelete,
  onContextMenu,
  renamingPath,
  renameValue,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
}: FileListProps) {
  const { fs } = useSystem();
  const sorted = entries;
  // The latest handlers, for the rows: FileManager makes new ones on every render, and a row that took them
  // as props would re-render with each.
  const latest: RowHandlers = {
    onSelect,
    onOpen,
    onRename,
    onCopy,
    onCut,
    onDelete,
    onContextMenu,
    onRenameChange,
    onRenameCommit,
    onRenameCancel,
  };
  const handlers = useRef(latest);
  useLayoutEffect(() => {
    handlers.current = latest;
  });

  // Virtual window over `sorted`. Only these rows are mounted; the gap above
  // and below is held open by two spacer <tr>s so the scroll height and the
  // thumb stay correct (the padding-spacer technique, table-friendly). Offsets
  // are shifted by scrollMargin (the header that precedes the rows in the same
  // scroll container) so they measure from the top of <tbody>.
  const virtualRows = virtualizer.getVirtualItems();
  const scrollMargin = virtualizer.options.scrollMargin;
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start - scrollMargin : 0;
  const paddingBottom =
    virtualRows.length > 0 ? virtualizer.getTotalSize() - (virtualRows[virtualRows.length - 1].end - scrollMargin) : 0;

  if (sorted.length === 0) {
    return (
      <div className="text-on-surface-variant flex flex-col items-center justify-center gap-2 py-12">
        <Folder size={32} strokeWidth={1} />
        <span className="font-ui text-control">Empty folder</span>
      </div>
    );
  }

  return (
    // In Apricot the table separates its borders, so a row can be rounded: the
    // fill moves from the row onto its cells, with the outer cells rounded, and
    // the table is inset from the pane's edges. Classic keeps the collapsed table.
    <table className="font-ui apricot:mx-(--k-list-inset) apricot:w-[calc(100%-2*var(--k-list-inset))] apricot:border-separate apricot:border-spacing-0 text-control w-full border-collapse">
      <thead>
        <tr className="border-outline-variant bg-surface-container-low text-on-surface-variant border-b">
          <th className="w-6 px-2 py-1 text-left font-medium" />
          <SortHeader column="name" sort={sort} onSortChange={onSortChange} align="left" />
          <SortHeader column="size" sort={sort} onSortChange={onSortChange} width="w-20" />
          <SortHeader column="modified" sort={sort} onSortChange={onSortChange} width="w-32" />
          <th className="w-20 px-2 py-1 text-right font-medium" />
        </tr>
      </thead>
      <tbody>
        {paddingTop > 0 && (
          <tr aria-hidden>
            <td colSpan={5} style={{ height: paddingTop, padding: 0 }} />
          </tr>
        )}
        {virtualRows.map((vr) => {
          const entry = sorted[vr.index];
          const isRenaming = renamingPath === entry.path;
          return (
            <FileRow
              key={entry.path}
              entry={entry}
              index={vr.index}
              isSelected={selected.has(entry.path)}
              isRenaming={isRenaming}
              renameValue={isRenaming ? renameValue : ""}
              measureElement={virtualizer.measureElement}
              downloadUrl={entry.type === "file" ? fs.downloadUrl(root, entry.path) : null}
              handlers={handlers}
            />
          );
        })}
        {paddingBottom > 0 && (
          <tr aria-hidden>
            <td colSpan={5} style={{ height: paddingBottom, padding: 0 }} />
          </tr>
        )}
      </tbody>
    </table>
  );
}

/** What a row calls back into, read through a ref so a row's props stay the same while it stays on screen. */
type RowHandlers = Pick<
  FileListProps,
  | "onSelect"
  | "onOpen"
  | "onRename"
  | "onCopy"
  | "onCut"
  | "onDelete"
  | "onContextMenu"
  | "onRenameChange"
  | "onRenameCommit"
  | "onRenameCancel"
>;

/**
 * One row, memoised. The list re-renders on every scroll frame (the virtualizer moves its window), and a row
 * is five tooltip-wrapped buttons and an icon: re-rendering the 24 on screen each frame was most of a scroll's
 * cost in a large folder. A row that stays on screen keeps its props (its handlers come through `h`), so only
 * the rows coming into view render.
 */
const FileRow = memo(function FileRow({
  entry,
  index,
  isSelected,
  isRenaming,
  renameValue,
  measureElement,
  downloadUrl,
  handlers: h,
}: {
  entry: FsEntry;
  index: number;
  isSelected: boolean;
  isRenaming: boolean;
  /** The rename field's text; empty for every row but the one being renamed. */
  renameValue: string;
  measureElement: (el: HTMLElement | null) => void;
  /** Where the Download button points; null for a folder, which has none. */
  downloadUrl: string | null;
  handlers: RefObject<RowHandlers>;
}) {
  return (
    <tr
      key={entry.path}
      data-index={index}
      data-entry-path={entry.path}
      ref={measureElement}
      onClick={(e) => {
        // Stop the click from bubbling to the background container's
        // "clear selection" handler — otherwise every row click
        // selects then immediately deselects in the same tick.
        e.stopPropagation();
        h.current.onSelect(entry.path, modeFromEvent(e));
      }}
      onDoubleClick={() => h.current.onOpen(entry)}
      onContextMenu={(e) => {
        const { onContextMenu, onSelect } = h.current;
        if (!onContextMenu) return;
        e.preventDefault();
        // Stop the bubble, exactly as onClick above does. Without it the
        // event reached the list wrapper's background handler, which
        // reopened the menu with `entry: null` — so right-clicking a
        // file showed the empty-space menu (New Folder / Upload /
        // Paste) and its Rename / Copy / Cut / Delete items were
        // unreachable despite being implemented.
        e.stopPropagation();
        if (!isSelected) onSelect(entry.path, "replace");
        onContextMenu(entry, e);
      }}
      className={cn(
        "group/row border-outline-variant/30 cursor-pointer border-b transition-colors",
        isSelected ? "bg-primary-container text-on-primary-container" : "hover:bg-surface-container",
        "apricot:bg-transparent apricot:hover:bg-transparent",
      )}
    >
      <td className={cn("px-2 py-1", cellFill(isSelected))}>{getFileIcon(entry)}</td>
      <td className={cn("px-2 py-1", cellFill(isSelected))}>
        {isRenaming ? (
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => h.current.onRenameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") h.current.onRenameCommit();
              if (e.key === "Escape") h.current.onRenameCancel();
            }}
            onBlur={() => h.current.onRenameCommit()}
            onClick={(e) => e.stopPropagation()}
            className="rounded-control border-primary bg-surface-container-lowest font-content text-on-surface focus-visible:ring-primary text-control w-full border px-1 py-0 outline-none focus-visible:ring-2 focus-visible:ring-inset"
          />
        ) : (
          <span className="select-none">{entry.name}</span>
        )}
      </td>
      <td className={cn("text-on-surface-variant px-2 py-1 text-right", cellFill(isSelected))}>
        {entry.type === "file" ? formatSize(entry.size) : "—"}
      </td>
      <td className={cn("text-on-surface-variant px-2 py-1 text-right", cellFill(isSelected))}>
        {dayjs(entry.modifiedAt).format("MMM D, YYYY")}
      </td>
      <td className={cn("px-2 py-1", cellFill(isSelected))} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 [tr:hover_&]:opacity-100">
          <Tooltip content="Rename">
            <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => h.current.onRename(entry)}>
              <Pencil size={11} />
            </Button>
          </Tooltip>
          <Tooltip content="Copy">
            <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => h.current.onCopy(entry)}>
              <Copy size={11} />
            </Button>
          </Tooltip>
          <Tooltip content="Cut">
            <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => h.current.onCut(entry)}>
              <Scissors size={11} />
            </Button>
          </Tooltip>
          {downloadUrl !== null && (
            <Tooltip content="Download">
              <a
                href={downloadUrl}
                download={entry.name}
                className="rounded-control text-on-surface hover:border-outline-variant hover:bg-surface-container focus-visible:ring-primary inline-flex h-5 w-5 cursor-pointer items-center justify-center border border-transparent outline-none focus-visible:ring-2 focus-visible:ring-inset"
              >
                <Download size={11} />
              </a>
            </Tooltip>
          )}
          <Tooltip content="Delete">
            <Button
              variant="ghost"
              size="sm"
              className="text-error hover:bg-error-container h-5 w-5 p-0"
              onClick={() => h.current.onDelete(entry)}
            >
              <Trash2 size={11} />
            </Button>
          </Tooltip>
        </div>
      </td>
    </tr>
  );
});

/**
 * Apricot's row fill, on the cells: the row itself can't be rounded, so each
 * cell takes the fill and the outer two round the ends.
 */
function cellFill(isSelected: boolean): string {
  return cn(
    "apricot:first:rounded-l-item apricot:last:rounded-r-item",
    isSelected ? "apricot:bg-primary-container" : "apricot:group-hover/row:bg-surface-container",
  );
}

/**
 * A clickable, sortable column header — the same affordance System Monitor's
 * process table already uses, so the two tables behave alike.
 *
 * `aria-sort` goes on the `<th>` (where the spec puts it) while the click target
 * is a real `<button>` inside it, so keyboard users get the sort without the
 * header itself having to fake a control.
 */
function SortHeader({
  column,
  sort,
  onSortChange,
  align = "right",
  width,
}: {
  column: SortKey;
  sort: { key: SortKey; dir: SortDir };
  onSortChange: (key: SortKey) => void;
  align?: "left" | "right";
  width?: string;
}) {
  const active = sort.key === column;
  const Arrow = sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      aria-sort={ariaSort(column, sort)}
      className={cn("px-0 py-0 font-medium", width, align === "left" ? "text-left" : "text-right")}
    >
      <button
        type="button"
        onClick={() => onSortChange(column)}
        className={cn(
          "hover:bg-surface-container flex w-full items-center gap-1 px-2 py-1",
          "focus-visible:ring-primary outline-none focus-visible:ring-2 focus-visible:ring-inset",
          align === "left" ? "justify-start" : "justify-end",
          active && "text-on-surface font-semibold",
        )}
      >
        {SORT_LABELS[column]}
        {/* The arrow is the only indicator of direction, so it is reserved space
            rather than conditional — otherwise every header shifts a few pixels
            when the sort moves, which reads as the layout breaking. */}
        <span className="inline-flex w-3 justify-center">{active && <Arrow size={11} aria-hidden />}</span>
      </button>
    </th>
  );
}
