import { useCallback, useRef, useState } from "react";
import { AlertTriangle, FolderOpen, Loader2, Search, X } from "lucide-react";
import { cn, useSystem } from "@imbatranim/ui";
import { EMPTY_RESULT, runFindInFiles, type FindResult } from "../lib/findInFiles";

type SearchPanelProps = {
  root: string;
  /** Open a file at a line — the editor's one loader. */
  onOpenAt: (path: string, line: number) => void;
  /** Esc, or the close button: hide the panel and return focus to Monaco. */
  onClose: () => void;
  /** Choose a folder to search under; resolves to a root-relative path or null. */
  onPickScope: () => Promise<string | null>;
  inputRef: React.RefObject<HTMLInputElement | null>;
};

/**
 * Find in files — a bottom panel, not a dialog.
 *
 * A dialog would end the search-edit-search loop every time you clicked a
 * result; the left rail belongs to the folder tree; and Monaco owns
 * the centre. The bottom is what is left, and it is where every editor puts
 * this anyway.
 *
 * Search runs on Enter, never per keystroke: this is the *content* grep, a
 * real filesystem walk reading up to 256 KB per file under a 3s budget. The
 * file manager's box makes the same split for the same reason.
 */
export function SearchPanel({ root, onOpenAt, onClose, onPickScope, inputRef }: SearchPanelProps) {
  const system = useSystem();
  const [query, setQuery] = useState("");
  /**
   * The folder searched, picked in the OS's folder chooser: the pick is what
   * gives the editor the folder. Null until one is picked; a search asks for
   * one first, since the editor holds only the files it was given.
   */
  const [scope, setScope] = useState<string | null>(null);
  const [result, setResult] = useState<FindResult>(EMPTY_RESULT);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The query the rows on screen actually answer. */
  const [answered, setAnswered] = useState<string | null>(null);
  // Monotonic run id: a slow "need" must never land on top of "needle".
  const runRef = useRef(0);

  const run = useCallback(
    async (q: string, sc: string) => {
      const trimmed = q.trim();
      if (trimmed.length === 0) {
        runRef.current++;
        setResult(EMPTY_RESULT);
        setAnswered(null);
        setError(null);
        return;
      }
      const id = ++runRef.current;
      setRunning(true);
      setError(null);
      try {
        const next = await runFindInFiles(system.http, {
          root,
          query: trimmed,
          scope: sc,
        });
        if (id !== runRef.current) return;
        setResult(next);
        setAnswered(trimmed);
      } catch {
        if (id !== runRef.current) return;
        setResult(EMPTY_RESULT);
        setAnswered(trimmed);
        setError("Search failed.");
      } finally {
        if (id === runRef.current) setRunning(false);
      }
    },
    [system, root],
  );

  const scopeLabel = scope === null ? "a folder…" : `/${scope}`;

  /** Pick the folder to search, then search it. */
  const pickAndRun = useCallback(
    (q: string) => {
      void onPickScope().then((picked) => {
        if (picked === null) return;
        setScope(picked);
        // Re-run against the new scope so the chip and the rows agree —
        // a scope that does not change the results it labels is a lie.
        if (q.trim()) void run(q, picked);
      });
    },
    [onPickScope, run],
  );

  return (
    <div className="border-outline-variant bg-surface-container-low flex h-56 shrink-0 flex-col border-t">
      {/* Query row */}
      <div className="border-outline-variant flex items-center gap-2 border-b px-2 py-1">
        <div className="rounded-control border-outline-variant bg-surface-container-lowest flex flex-1 items-center gap-1 border px-1.5">
          {running ? (
            <Loader2 size={12} className="text-primary shrink-0 animate-spin" />
          ) : (
            <Search size={12} className="text-on-surface-variant shrink-0" />
          )}
          <input
            ref={inputRef}
            value={query}
            aria-label="Find in files"
            placeholder="Find in files — press Enter"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (scope === null && query.trim()) pickAndRun(query);
                else void run(query, scope ?? "");
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }
            }}
            className="font-content text-on-surface placeholder:text-on-surface-variant focus-visible:ring-primary text-control w-full bg-transparent py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-inset"
          />
        </div>

        <button
          type="button"
          onClick={() => pickAndRun(query)}
          title="Limit the search to a folder"
          className="rounded-control border-outline-variant text-on-surface-variant hover:text-on-surface font-ui focus-visible:ring-primary text-label flex shrink-0 items-center gap-1 border px-1.5 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-inset"
        >
          <FolderOpen size={11} />
          in {scopeLabel}
        </button>

        <div className="bg-outline-variant mx-1 h-4 w-px" />
        <button
          type="button"
          aria-label="Close find in files"
          onClick={onClose}
          className="text-on-surface-variant hover:text-on-surface focus-visible:ring-primary shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-inset"
        >
          <X size={12} />
        </button>
      </div>

      {/* Summary + truncation honesty */}
      <div className="border-outline-variant flex items-center gap-2 border-b px-2 py-0.5">
        <span className="font-ui text-on-surface-variant text-label">
          {running
            ? "Searching…"
            : answered === null
              ? "Type a search and press Enter."
              : `${result.matchCount} match${result.matchCount === 1 ? "" : "es"} in ${result.groups.length} file${result.groups.length === 1 ? "" : "s"} for “${answered}”`}
        </span>
        {result.truncated && !running && (
          <span className="font-ui text-tertiary text-label flex items-center gap-1">
            <AlertTriangle size={11} />
            Stopped early — narrow the search or pick a folder.
          </span>
        )}
      </div>

      {/* Results */}
      <div className="min-h-0 flex-1 overflow-auto">
        {error && <div className="font-ui text-error text-control px-2 py-2">{error}</div>}
        {!error && !running && answered !== null && result.groups.length === 0 && (
          <div className="font-ui text-on-surface-variant text-control px-2 py-2">
            No matches for “{answered}” in /{scope ?? ""}.
          </div>
        )}
        {result.groups.map((group) => (
          <div key={group.path}>
            <button
              type="button"
              onClick={() => onOpenAt(group.path, group.matches[0]?.line ?? 1)}
              className="hover:bg-surface-container focus-visible:ring-primary flex w-full items-center gap-2 px-2 py-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset"
            >
              <span className="font-content text-on-surface text-control truncate font-semibold">{group.name}</span>
              {group.dir && <span className="font-ui text-on-surface-variant text-label truncate">/{group.dir}</span>}
              <span className="font-ui text-on-surface-variant text-label ml-auto shrink-0">
                {group.nameOnly ? "filename match" : group.matches.length}
              </span>
            </button>
            {group.matches.map((m) => (
              <button
                key={`${group.path}:${m.line}`}
                type="button"
                onClick={() => onOpenAt(group.path, m.line)}
                className={cn(
                  "focus-visible:ring-primary hover:bg-surface-container flex w-full items-baseline gap-2 py-0.5 pr-2 pl-6 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset",
                )}
              >
                <span className="text-on-surface-variant text-label w-10 shrink-0 text-right font-mono">{m.line}</span>
                <span className="text-on-surface text-label truncate font-mono">{m.text}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
