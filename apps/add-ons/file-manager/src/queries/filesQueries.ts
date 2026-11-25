import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSystem } from "@imbatranim/ui";
import {
  copyEntry,
  createDirectory,
  deleteEntry,
  listTrash,
  restoreFromTrash,
  deleteFromTrash,
  emptyTrash,
  listDirectory,
  moveEntry,
  readContent,
  searchFiles,
  uploadFile,
  writeContent,
} from "../api/filesApi";
import { listArchive } from "../api/archiveApi";
import { settleEach } from "../lib/settleEach";

export function fsListKey(root: string, path: string) {
  return ["fs-list", root, path] as const;
}

/** The directory portion of a path — '' for a top-level entry. */
function dirOf(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? "" : p.slice(0, i);
}

export function useDirectoryQuery(root: string, path: string) {
  const { http } = useSystem();
  return useQuery({
    queryKey: fsListKey(root, path),
    queryFn: () => listDirectory(http, root, path),
  });
}

/** An archive's contents, read once and kept: the listing changes only if the file does. */
export function useArchiveListingQuery(root: string, path: string | null) {
  const { http } = useSystem();
  return useQuery({
    queryKey: ["archive-list", root, path] as const,
    queryFn: () => listArchive(http, root, path as string),
    enabled: path !== null,
    staleTime: 60_000,
  });
}

export function fsPreviewContentKey(root: string, path: string) {
  return ["fs-preview-content", root, path] as const;
}

/**
 * Text/code preview content. Keyed per-path so switching the selection never
 * shows another file's content — react-query just resolves the previous
 * in-flight request into its own (now-inactive) cache entry instead of
 * overwriting what's on screen.
 */
export function usePreviewContentQuery(root: string, path: string | null, enabled: boolean) {
  const { http } = useSystem();
  return useQuery({
    queryKey: fsPreviewContentKey(root, path ?? ""),
    queryFn: () => readContent(http, root, path as string),
    enabled: enabled && path !== null,
    staleTime: 30_000,
  });
}

export function fsSearchKey(root: string, path: string, query: string, content: boolean) {
  return ["fs-search", root, path, query, content] as const;
}

/**
 * A scoped search, as a keyed query rather than a hand-rolled fetch.
 *
 * The key IS the out-of-order guard — the same reason `usePreviewContentQuery`
 * is keyed per path. A slow response for "rep" resolves into its own inactive
 * cache entry instead of overwriting the results for "report", so there is no
 * request-id bookkeeping to get wrong.
 *
 * `placeholderData: keepPreviousData` keeps the last answer on screen while the
 * next one loads, so typing does not strobe the pane empty between keystrokes.
 * Callers must therefore render the "Searching…" affordance from `isFetching`,
 * and must show which query the visible rows actually answer.
 */
export function useSearchQuery(root: string, path: string, query: string, content: boolean, enabled: boolean) {
  const { http } = useSystem();
  return useQuery({
    queryKey: fsSearchKey(root, path, query, content),
    queryFn: () => searchFiles(http, root, query, { path, content }),
    enabled: enabled && query.length > 0,
    placeholderData: keepPreviousData,
    // A search is a snapshot of the tree, not a subscription to it. Short
    // enough that re-running the same search after an edit re-walks, long
    // enough that Backspace-then-retype does not.
    staleTime: 5_000,
  });
}

export function useCreateDirectoryMutation(root: string, path: string) {
  const { http } = useSystem();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (folderName: string) => {
      const fullPath = path ? `${path}/${folderName}` : folderName;
      return createDirectory(http, root, fullPath);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: fsListKey(root, path) });
    },
  });
}

export function useDeleteEntryMutation(root: string, currentPath: string) {
  const { http } = useSystem();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, toTrash }: { path: string; toTrash: boolean }) => deleteEntry(http, root, path, toTrash),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: fsListKey(root, currentPath) });
      void qc.invalidateQueries({ queryKey: ["trash"] });
    },
  });
}

export const trashKey = ["trash"] as const;

export function useTrashQuery(enabled: boolean) {
  const { http } = useSystem();
  return useQuery({ queryKey: trashKey, queryFn: () => listTrash(http), enabled });
}

export function useRestoreTrashMutation(root: string, currentPath: string) {
  const { http } = useSystem();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => restoreFromTrash(http, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: trashKey });
      void qc.invalidateQueries({ queryKey: fsListKey(root, currentPath) });
    },
  });
}

export function useDeleteFromTrashMutation() {
  const { http } = useSystem();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteFromTrash(http, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: trashKey }),
  });
}

export function useEmptyTrashMutation() {
  const { http } = useSystem();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => emptyTrash(http),
    onSuccess: () => qc.invalidateQueries({ queryKey: trashKey }),
  });
}

export function useMoveEntryMutation(root: string, currentPath: string) {
  const { http } = useSystem();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) => moveEntry(http, root, from, to),
    onSuccess: (_data, { from, to }) => {
      // A move touches TWO directories: the source loses the entry and the
      // destination gains it. Invalidating only the current dir left the SOURCE
      // listing stale for its whole cache lifetime after a cut/paste across dirs
      // (M3), so invalidate both endpoints' dirs as well.
      void qc.invalidateQueries({ queryKey: fsListKey(root, currentPath) });
      void qc.invalidateQueries({ queryKey: fsListKey(root, dirOf(from)) });
      void qc.invalidateQueries({ queryKey: fsListKey(root, dirOf(to)) });
    },
  });
}

export function useWriteContentMutation(root: string, currentPath: string) {
  const { http } = useSystem();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, content }: { path: string; content: string }) => writeContent(http, root, path, content),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: fsListKey(root, currentPath) });
    },
  });
}

/*
 * A batch (a drop of many files, Delete or Paste on a selection) is one mutation: every item on its own request, a
 * few at a time, each one's outcome reported, and the folders listed once when all have settled. One invalidation per
 * item listed a 20,000-file folder 200 times for a 200-file drop: 26 s and 28 s of the backend's CPU (2026-11-24).
 */

/** Requests a batch keeps in flight: the connections Chromium opens to one host over HTTP/1.1. */
const BATCH_AT_ONCE = 6;

export function useUploadFilesMutation(root: string, currentPath: string) {
  const { http } = useSystem();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: { path: string; file: File }[]) =>
      settleEach(items, BATCH_AT_ONCE, ({ path, file }) => uploadFile(http, root, path, file)),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: fsListKey(root, currentPath) });
    },
  });
}

export function useDeleteEntriesMutation(root: string, currentPath: string) {
  const { http } = useSystem();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ paths, toTrash }: { paths: string[]; toTrash: boolean }) =>
      settleEach(paths, BATCH_AT_ONCE, (p) => deleteEntry(http, root, p, toTrash)),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: fsListKey(root, currentPath) });
      void qc.invalidateQueries({ queryKey: trashKey });
    },
  });
}

export function useCopyEntriesMutation(root: string, currentPath: string) {
  const { http } = useSystem();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (moves: { from: string; to: string }[]) =>
      settleEach(moves, BATCH_AT_ONCE, ({ from, to }) => copyEntry(http, root, from, to)),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: fsListKey(root, currentPath) });
    },
  });
}

export function useMoveEntriesMutation(root: string, currentPath: string) {
  const { http } = useSystem();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (moves: { from: string; to: string }[]) =>
      settleEach(moves, BATCH_AT_ONCE, ({ from, to }) => moveEntry(http, root, from, to)),
    onSettled: (_data, _error, moves) => {
      // Both ends of every move, as a single move does, each folder once.
      const dirs = new Set([currentPath, ...moves.flatMap(({ from, to }) => [dirOf(from), dirOf(to)])]);
      for (const dir of dirs) void qc.invalidateQueries({ queryKey: fsListKey(root, dir) });
    },
  });
}

export function useUploadFileMutation(root: string, currentPath: string) {
  const { http } = useSystem();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, file }: { path: string; file: File }) => uploadFile(http, root, path, file),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: fsListKey(root, currentPath) });
    },
  });
}
