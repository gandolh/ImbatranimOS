import { useMemo } from "react";
import type { FsEntry } from "../types";
import { filterHidden, sortEntries, type SortDir, type SortKey } from "../lib/fileSort";

/**
 * A folder's entries as the window shows them: hidden ones left out unless shown, then sorted, plus the
 * selected ones in that order. Memoised, because the list's virtualizer re-renders the File Manager on every
 * scroll frame, and filtering and sorting a 20,000-entry folder each time cost tens of milliseconds a frame.
 */
export function useOrderedEntries(
  entries: FsEntry[],
  showHidden: boolean,
  sortKey: SortKey,
  sortDir: SortDir,
  selected: ReadonlySet<string>,
): { visibleEntries: FsEntry[]; orderedEntries: FsEntry[]; selectedEntries: FsEntry[] } {
  const visibleEntries = useMemo(() => filterHidden(entries, showHidden), [entries, showHidden]);
  const orderedEntries = useMemo(
    () => sortEntries(visibleEntries, sortKey, sortDir),
    [visibleEntries, sortKey, sortDir],
  );
  const selectedEntries = useMemo(() => orderedEntries.filter((e) => selected.has(e.path)), [orderedEntries, selected]);
  return { visibleEntries, orderedEntries, selectedEntries };
}
