import { useEffect, useRef, useState, useCallback } from "react";
import { PaletteDialog } from "@imbatranim/ui";
import { Search } from "lucide-react";
import { cn } from "../../lib/cn";
import { searchAllSources, activateItem, type CommandItem } from "../commands/CommandSourcesRegistry";
import "../commands/coreSources";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function CommandPalette({ open, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<CommandItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic id for the in-flight search. A slow earlier query must not overwrite
  // a newer one when it finally resolves out of order.
  const reqIdRef = useRef(0);
  // Only keyboard navigation should auto-scroll the active row into view.
  // Mouse hover also moves the selection (onMouseEnter below), and if that
  // scrolled too, wheel-scrolling — which drags the pointer across rows —
  // would yank the list back to the hovered item and cancel the user's scroll.
  const keyboardNavRef = useRef(false);

  // Reset query + selection when the palette opens — state adjustment during
  // render instead of an effect (react.dev/you-might-not-need-an-effect)
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setQuery("");
      setSelectedIndex(0);
    }
  }

  // Focus input when palette opens
  useEffect(() => {
    if (!open) return;
    // small delay so the Dialog portal has painted
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  // Search whenever query changes
  useEffect(() => {
    if (!open) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => void run(), 80);
    async function run() {
      const reqId = ++reqIdRef.current;
      setLoading(true);
      try {
        const results = await searchAllSources(query);
        // Ignore a result that a newer query has already superseded.
        if (reqId !== reqIdRef.current) return;
        setItems(results);
        setSelectedIndex(0);
      } finally {
        if (reqId === reqIdRef.current) setLoading(false);
      }
    }

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        keyboardNavRef.current = true;
        setSelectedIndex((i) => Math.min(i + 1, items.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        keyboardNavRef.current = true;
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (items[selectedIndex]) {
          activateItem(items[selectedIndex]);
          onClose();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [items, selectedIndex, onClose],
  );

  // Scroll the selected row into view, but ONLY when the selection was moved
  // by the keyboard — never on mouse-hover selection, or wheel-scrolling would
  // fight itself. Query the actual selected option: the <ul>'s direct children
  // are per-group <li> wrappers, not the individual rows, so indexing children
  // by selectedIndex would scroll the wrong element.
  useEffect(() => {
    if (!keyboardNavRef.current) return;
    keyboardNavRef.current = false;
    const el = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // Group items by group label
  const grouped = items.reduce<Record<string, CommandItem[]>>((acc, item) => {
    (acc[item.group] ??= []).push(item);
    return acc;
  }, {});

  return (
    <PaletteDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      label="Command palette"
      onKeyDown={handleKeyDown}
    >
      {/* Search input row */}
      <div className="border-outline-variant bg-surface-container-low flex items-center gap-2 border-b-2 px-3 py-2">
        <Search size={14} className="text-on-surface-variant shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search apps, files, bookmarks…"
          className={cn(
            "focus-visible:ring-primary flex-1 bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-inset",
            "text-on-surface font-ui text-body",
            "placeholder:text-on-surface-variant",
          )}
          autoComplete="off"
          spellCheck={false}
        />
        <kbd className="rounded-small border-outline-variant bg-surface-container text-on-surface-variant font-ui text-label border px-1 py-0.5">
          ESC
        </kbd>
      </div>

      {/* Results */}
      <div className="max-h-[360px] overflow-y-auto">
        {loading && items.length === 0 && (
          <div className="text-on-surface-variant font-ui text-control px-3 py-4 text-center">Searching…</div>
        )}

        {!loading && items.length === 0 && (
          <div className="text-on-surface-variant font-ui text-control px-3 py-4 text-center">
            {query ? "No results." : "Type to search."}
          </div>
        )}

        {items.length > 0 && (
          <ul ref={listRef} role="listbox" aria-label="Command palette results">
            {Object.entries(grouped).map(([group, groupItems]) => {
              const groupStartIndex = items.indexOf(groupItems[0]);
              return (
                <li key={group} role="presentation">
                  {/* Group header */}
                  <div className="border-outline-variant bg-surface-container text-on-surface-variant font-ui text-tiny border-b px-3 py-1 font-semibold tracking-widest uppercase">
                    {group}
                  </div>
                  {/* Group items */}
                  {groupItems.map((item, localIdx) => {
                    const globalIdx = groupStartIndex + localIdx;
                    const isSelected = globalIdx === selectedIndex;
                    return (
                      <div
                        key={item.id}
                        role="option"
                        aria-selected={isSelected}
                        className={cn(
                          "rounded-item mx-(--k-list-inset) flex cursor-pointer flex-col gap-0.5 px-3 py-2",
                          "border-outline-variant/40 apricot:border-transparent border-b",
                          isSelected
                            ? "bg-primary-container text-on-primary-container"
                            : "text-on-surface hover:bg-surface-container-low",
                        )}
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                        onClick={() => {
                          activateItem(item);
                          onClose();
                        }}
                      >
                        <span className="font-ui text-body leading-none font-medium">{item.label}</span>
                        {item.subtitle && (
                          <span
                            className={cn(
                              "font-ui text-label leading-none",
                              isSelected ? "text-on-primary-container/70" : "text-on-surface-variant",
                            )}
                          >
                            {item.subtitle}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PaletteDialog>
  );
}
