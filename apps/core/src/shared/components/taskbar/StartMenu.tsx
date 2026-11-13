import { useEffect, useMemo, useRef, useState } from "react";
import { ContextMenu } from "@imbatranim/ui";
import { motion, useReducedMotion } from "framer-motion";
import { History, Lock, LogOut, Search, Trash2 } from "lucide-react";
import { cn } from "../../../lib/cn";
import { useEnabledApps } from "../../registry/enabledApps";
import type { AppConfig } from "../../registry/registry";
import { activateItem, searchAllSources, type CommandItem } from "../../commands/CommandSourcesRegistry";
import { rankApps } from "../../commands/coreSources";
import { useStartPinsStore } from "../../store/startPinsStore";
import { Logo } from "../brand/Logo";
import { useAuthStore } from "../../../modules/auth/store/authStore";
import { clearLayout, useWindowStore } from "../../store/windowStore";
import { localSignOut } from "../../../modules/auth/api/authApi";
import { clearRecentFiles, useRecentFilesQuery } from "../../../lib/recentFiles";
import { openApp } from "../../intents/openApp";
import { launchLinuxApp, linuxLauncherActions } from "../../../modules/linux-windows/launchers";

const NAV = "[data-start-nav]";

/** A touch screen: Start must not raise the phone's keyboard on its own. */
function isTouchDevice(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
}

function letterOf(name: string): string {
  const c = name.trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : "#";
}

/**
 * An entry: a soft fill on hover and a 2 px strong ring on keyboard focus
 * (2026-11-13), so the focused entry shows at 3:1 on every pane.
 */
const entryClass = cn(
  "group rounded-item text-left outline-none",
  "hover:bg-surface-container-high",
  "focus-visible:ring-primary focus-visible:bg-surface-container-high focus-visible:ring-2 focus-visible:ring-inset",
);

/** A list row's tile: the glyph in the strong accent on a raised square. */
const ROW_TILE =
  "rounded-item bg-surface-bright text-primary flex h-[28px] w-[28px] shrink-0 items-center justify-center shadow-(--k-shadow-tile)";

/** A group's label: sentence case, 11 px at weight 600 (12 on a touch screen). */
const GROUP_LABEL = "text-on-surface-variant text-label font-semibold";

/** A session button in the foot band: bordered at 3:1, sized to its words. */
const ACT = cn(
  "rounded-control bg-surface-container-lowest border-outline text-on-surface text-control flex h-[34px] shrink-0 items-center gap-2 border px-[12px] font-semibold whitespace-nowrap outline-none",
  "hover:bg-surface-container-high focus-visible:ring-primary focus-visible:ring-2",
  "max-[600px]:h-[48px] max-[600px]:text-subhead",
);

type StartMenuProps = {
  onClose: () => void;
  onOpenApp: (appId: string) => void;
  anchorRef: React.RefObject<HTMLElement | null>;
};

export function StartMenu({ onClose, onOpenApp, anchorRef }: StartMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const still = useReducedMotion() === true;
  const lock = useAuthStore((s) => s.lock);
  const resetToLoggedOut = useAuthStore((s) => s.resetToLoggedOut);
  const enabledApps = useEnabledApps();
  const pins = useStartPinsStore((s) => s.pins);
  const pinApp = useStartPinsStore((s) => s.pin);
  const unpinApp = useStartPinsStore((s) => s.unpin);
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ for: string; items: CommandItem[] }>({
    for: "",
    items: [],
  });
  const searching = query.trim() !== "";
  const pinned = useMemo(
    () => pins.map((id) => enabledApps.find((a) => a.id === id)).filter((a): a is AppConfig => a !== undefined),
    [pins, enabledApps],
  );
  const atoz = useMemo(() => {
    const sorted = [...enabledApps].sort((a, b) => a.name.localeCompare(b.name));
    const groups: { letter: string; apps: AppConfig[] }[] = [];
    for (const app of sorted) {
      const letter = letterOf(app.name);
      const last = groups[groups.length - 1];
      if (last?.letter === letter) last.apps.push(app);
      else groups.push({ letter, apps: [app] });
    }
    // Names that start with a symbol or digit sit under # at the end.
    return [...groups.filter((g) => g.letter !== "#"), ...groups.filter((g) => g.letter === "#")];
  }, [enabledApps]);
  // Entries for disabled apps are filtered at render (no app to show an icon
  // for, and openApp would refuse them anyway). Six is a glance, not a list.
  const { data: recentFiles } = useRecentFilesQuery();
  const recent = (recentFiles ?? []).slice(0, 6);
  // An entry's own menu: a Linux app's desktop actions (Firefox's New Window).
  const [entryMenu, setEntryMenu] = useState<{ appId: string; x: number; y: number } | null>(null);

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      // An entry's menu draws outside Start (in a portal) and handles its own
      // dismissal; a press in it must not close Start under it.
      if (entryMenu) return;
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !entryMenu) onClose();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, anchorRef, entryMenu]);

  // Move focus into the menu on open and restore it to the trigger on close, so
  // the menu is operable and the keyboard user is not stranded when it dismisses.
  useEffect(() => {
    const trigger = anchorRef.current;
    // A physical keyboard types straight into the search; a touch device waits
    // for a tap so the phone's keyboard does not cover Start.
    if (isTouchDevice()) menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    else searchRef.current?.focus();
    return () => trigger?.focus();
  }, [anchorRef]);

  // Search the palette's sources; a newer query supersedes an older answer.
  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    let stale = false;
    const t = setTimeout(() => {
      void searchAllSources(q).then((items) => {
        if (!stale) setResults({ for: query, items: rankApps(items, q).slice(0, 12) });
      });
    }, 80);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [query]);

  function openResult(item: CommandItem) {
    if (item.group === "Apps") onOpenApp(item.id.replace(/^app:/, ""));
    else activateItem(item);
    onClose();
  }

  async function openTopResult() {
    const q = query.trim();
    if (!q) return;
    const items = results.for === query ? results.items : rankApps(await searchAllSources(q), q).slice(0, 12);
    if (items[0]) openResult(items[0]);
  }

  // Roving focus across the search field and every entry, in the order they
  // are drawn (search, results, grid, list, recent, session). Arrow keys wrap;
  // Home/End jump, except inside the search field where they move the caret.
  function handleMenuKeyDown(e: React.KeyboardEvent) {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>(NAV) ?? []);
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    const inSearch = document.activeElement === searchRef.current;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[current < 0 ? 0 : (current + 1) % items.length].focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length].focus();
    } else if (e.key === "Home" && !inSearch) {
      e.preventDefault();
      items[0].focus();
    } else if (e.key === "End" && !inSearch) {
      e.preventDefault();
      items[items.length - 1].focus();
    }
  }

  // Every entry has a menu: Open, pin or unpin, then a Linux app's own actions.
  function openEntryMenu(e: React.MouseEvent, appId: string) {
    e.preventDefault();
    setEntryMenu({ appId, x: e.clientX, y: e.clientY });
  }

  // Lock: cover the screen. The session stays valid and the desktop stays
  // mounted beneath the overlay — shells and buffers survive.
  function handleLock() {
    lock();
    onClose();
  }

  /**
   * End the session and come back to the sign-in screen.
   *
   * The local teardown happens first, and the order matters: whatever this tab
   * is holding (open windows, the saved layout) should not be waiting when
   * somebody signs back in. That is the deliberate contrast with the screen
   * cover.
   */
  function handleLogout() {
    onClose();
    useWindowStore.setState({ windows: [] });
    clearLayout();
    resetToLoggedOut();
    void localSignOut().finally(() => window.location.reload());
  }

  const recentRows = recent.flatMap((f) => {
    const app = enabledApps.find((a) => a.id === f.appId);
    if (!app) return [];
    const Icon = app.icon;
    return [
      <button
        key={`${f.root}:${f.path}`}
        role="menuitem"
        data-start-nav
        data-start-recent=""
        onClick={() => {
          openApp(f.appId, { openPath: f.path, root: f.root });
          onClose();
        }}
        className={cn(
          entryClass,
          "border-outline-variant flex w-full flex-[1_0_48px] items-center gap-2 rounded-none border-b px-[8px] last:border-b-0",
          "max-[600px]:min-h-[44px] max-[600px]:flex-none max-[600px]:px-[4px]",
        )}
      >
        <span className={ROW_TILE}>
          <Icon size={16} strokeWidth={1.75} />
        </span>
        {/* The path beside the name where both fit on a phone, under it where
            not; neither is ever cut. */}
        <span className="flex min-w-0 flex-1 flex-col max-[600px]:flex-row max-[600px]:flex-wrap max-[600px]:items-baseline max-[600px]:justify-between max-[600px]:gap-x-3">
          <span className="text-on-surface text-control max-[600px]:text-subhead font-semibold break-words">
            {f.path.split("/").pop() ?? f.path}
          </span>
          <span className="text-on-surface-variant text-label break-all max-[600px]:text-right">{f.path}</span>
        </span>
      </button>,
    ];
  });

  return (
    <motion.div
      ref={menuRef}
      initial={still ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: still ? 0 : 0.12, ease: "easeOut" }}
      role="menu"
      aria-label="Start menu"
      onKeyDown={handleMenuKeyDown}
      className={cn(
        // Two panes, 704 px wide, as tall as the screen allows above the
        // taskbar (2026-11-13); a full-screen sheet above it on a phone.
        "z-start fixed bottom-[52px] left-2 flex h-[min(740px,calc(100svh-60px))] w-[704px] max-w-[calc(100vw-16px)] flex-col",
        "rounded-menu border-outline-variant bg-surface-container-low overflow-hidden border shadow-(--k-shadow-menu)",
        "max-[600px]:inset-x-0 max-[600px]:top-[10px] max-[600px]:bottom-[56px] max-[600px]:h-auto max-[600px]:w-auto max-[600px]:max-w-none",
        "max-[600px]:rounded-t-[18px] max-[600px]:rounded-b-none max-[600px]:border-x-0 max-[600px]:border-b-0",
      )}
    >
      {/* Search, on top: every way of finding things starts here. */}
      <div className="border-outline-variant bg-surface-container-low shrink-0 border-b px-[16px] py-[8px] max-[600px]:px-[12px]">
        <label className="text-on-surface-variant relative block h-[40px] max-[600px]:h-[48px]">
          <Search
            size={18}
            strokeWidth={1.75}
            className="pointer-events-none absolute top-1/2 left-[12px] -translate-y-1/2 max-[600px]:left-[14px]"
          />
          <input
            ref={searchRef}
            data-start-nav
            type="search"
            role="searchbox"
            aria-label="Search apps and files"
            placeholder="Search apps and files"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void openTopResult();
              }
            }}
            className={cn(
              "rounded-control border-outline bg-surface-container-lowest text-on-surface text-body placeholder:text-on-surface-variant block h-full w-full border pr-[12px] pl-[40px] outline-none",
              "focus:ring-primary focus:border-primary focus:ring-2",
              "pointer-coarse:text-index max-[600px]:pl-[44px]",
            )}
          />
        </label>
      </div>

      {searching ? (
        <div role="group" aria-label="Search results" className="min-h-0 flex-1 overflow-y-auto px-[8px] py-[8px]">
          {results.for !== query ? null : results.items.length === 0 ? (
            <div className="flex flex-col items-start gap-1 px-[16px] py-[28px]">
              <b className="text-on-surface text-body font-semibold">Nothing found</b>
            </div>
          ) : (
            results.items.map((item) => {
              const app =
                item.group === "Apps" ? enabledApps.find((a) => a.id === item.id.replace(/^app:/, "")) : undefined;
              const Icon = app?.icon;
              return (
                <button
                  key={item.id}
                  role="menuitem"
                  data-start-nav
                  data-start-result={item.id}
                  onClick={() => openResult(item)}
                  className={cn(entryClass, "flex w-full items-start gap-2 p-[8px]")}
                >
                  <span className={ROW_TILE}>{Icon && <Icon size={16} strokeWidth={1.75} />}</span>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-on-surface text-control font-semibold">{item.label}</span>
                    <span className="text-on-surface-variant text-label break-words">
                      {item.subtitle ?? item.group}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] max-[600px]:flex max-[600px]:flex-col max-[600px]:overflow-y-auto">
          {/* Pinned and Recent, on the panel's own surface. First in the
              document, so the keyboard and a phone's sheet reach them first;
              the right-hand column at desktop widths. */}
          <div className="bg-surface-container-low col-start-2 row-start-1 flex min-h-0 flex-col overflow-y-auto px-[20px] py-[16px] max-[600px]:flex-none max-[600px]:overflow-visible max-[600px]:px-[16px] max-[600px]:pt-[12px] max-[600px]:pb-[8px]">
            {pinned.length > 0 && (
              <div role="group" aria-label="Pinned">
                <h2 className={GROUP_LABEL}>Pinned</h2>
                <div className="mt-[12px] mb-[20px] grid grid-cols-3 gap-x-1 gap-y-2 max-[600px]:mt-[4px] max-[600px]:mb-[8px] max-[600px]:gap-y-[2px]">
                  {pinned.map((app) => {
                    const Icon = app.icon;
                    return (
                      <button
                        key={app.id}
                        role="menuitem"
                        data-start-nav
                        data-start-entry={app.id}
                        data-start-pinned=""
                        onClick={() => {
                          onOpenApp(app.id);
                          onClose();
                        }}
                        onContextMenu={(e) => openEntryMenu(e, app.id)}
                        className={cn(
                          entryClass,
                          "rounded-control flex flex-col items-center gap-2 px-1 py-[4px] text-center max-[600px]:gap-1",
                        )}
                      >
                        <span className="rounded-tile bg-surface-bright text-primary flex h-[52px] w-[52px] items-center justify-center shadow-(--k-shadow-tile) max-[600px]:h-[48px] max-[600px]:w-[48px]">
                          <Icon size={22} strokeWidth={1.75} />
                        </span>
                        <span className="text-on-surface text-control pointer-coarse:text-label w-full break-words">
                          {app.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recent files: hidden entirely while the list is empty. Its rows
                share the rest of the pane's height, so no band is left empty. */}
            {recentRows.length > 0 && (
              <div role="group" aria-label="Recent" className="flex flex-[1_0_auto] flex-col max-[600px]:flex-none">
                <div className="mb-[4px] flex min-h-[32px] items-center justify-between max-[600px]:min-h-[36px]">
                  <span className={cn(GROUP_LABEL, "flex items-center gap-2")}>
                    <History size={14} strokeWidth={1.75} />
                    Recent
                  </span>
                  <button
                    type="button"
                    aria-label="Clear recent files"
                    title="Clear recent files"
                    onClick={() => void clearRecentFiles()}
                    className="rounded-control text-on-surface-variant hover:bg-surface-container-high focus-visible:ring-primary -mr-[8px] flex h-[32px] w-[32px] items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-inset max-[600px]:h-[48px] max-[600px]:w-[48px]"
                  >
                    <Trash2 size={16} strokeWidth={1.75} />
                  </button>
                </div>
                <div className="border-outline-variant flex flex-[1_0_auto] flex-col border-t max-[600px]:flex-none">
                  {recentRows}
                </div>
              </div>
            )}
          </div>

          {/* Every app A to Z, on the tinted pane, with whole descriptions. The
              letter heads stick while their group scrolls; the list fades at
              its foot and keeps its scrollbar, so it shows that it goes on. */}
          <div className="border-outline-variant bg-surface-container relative col-start-1 row-start-1 flex min-h-0 border-r max-[600px]:flex-none max-[600px]:border-t max-[600px]:border-r-0">
            <div
              className={cn(
                "min-w-0 flex-1 overflow-y-auto pb-[4px]",
                "[mask-image:linear-gradient(to_bottom,black_calc(100%-30px),transparent)]",
                "max-[600px]:overflow-visible max-[600px]:[mask-image:none] max-[600px]:pb-[12px]",
              )}
            >
              {atoz.map(({ letter, apps }) => (
                <section key={letter} role="group" aria-label={letter}>
                  <h3
                    aria-hidden
                    className="font-display text-index text-primary bg-surface-container sticky top-0 pt-[4px] pr-[16px] pl-[24px] font-bold max-[600px]:pt-[8px]"
                  >
                    {letter}
                  </h3>
                  {apps.map((app) => {
                    const Icon = app.icon;
                    return (
                      <button
                        key={app.id}
                        role="menuitem"
                        data-start-nav
                        data-start-entry={app.id}
                        data-start-list=""
                        onClick={() => {
                          onOpenApp(app.id);
                          onClose();
                        }}
                        onContextMenu={(e) => openEntryMenu(e, app.id)}
                        className={cn(
                          entryClass,
                          "mx-[8px] flex w-[calc(100%-16px)] items-start gap-2 p-[8px] max-[600px]:min-h-[48px]",
                        )}
                      >
                        <span className={cn(ROW_TILE, "mt-px")}>
                          <Icon size={16} strokeWidth={1.75} />
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="text-on-surface text-control max-[600px]:text-subhead font-semibold">
                            {app.name}
                          </span>
                          <span className="text-on-surface-variant text-label break-words">{app.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </section>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* The foot band: the account, then the two session buttons. */}
      <div className="border-outline-variant bg-surface-container flex h-[52px] shrink-0 items-center gap-2 border-t px-[16px] max-[600px]:h-auto max-[600px]:px-[12px] max-[600px]:pt-[8px] max-[600px]:pb-[12px]">
        <div role="group" aria-label="ImbatranimOS, signed in" className="flex min-w-0 flex-1 items-center gap-2">
          <span className="rounded-tile border-outline-variant bg-surface-container-lowest flex h-[32px] w-[32px] shrink-0 items-center justify-center border">
            <Logo size={18} className="text-on-surface" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="font-display text-on-surface text-lead font-bold max-[600px]:hidden">
              Imbatranim<span className="text-primary">OS</span>
            </span>
            <span className="text-on-surface-variant text-label">Signed in</span>
          </span>
        </div>
        <button role="menuitem" data-start-nav onClick={handleLock} className={ACT}>
          <Lock size={16} strokeWidth={1.75} className="text-on-surface-variant" />
          {/* "Cover", not "Lock": uncovering does not re-prove the password,
              so this hides the screen without protecting it. Calling it Lock
              would be a claim the app cannot honour (see `SessionScreens.tsx`). */}
          Cover screen
        </button>
        <button
          role="menuitem"
          data-start-nav
          onClick={handleLogout}
          className={cn(ACT, "group/off hover:bg-error-container hover:text-on-error-container hover:border-error")}
        >
          <LogOut
            size={16}
            strokeWidth={1.75}
            className="text-on-surface-variant group-hover/off:text-on-error-container"
          />
          Log off
        </button>
      </div>
      {entryMenu && (
        <ContextMenu
          x={entryMenu.x}
          y={entryMenu.y}
          label={`Actions for ${enabledApps.find((a) => a.id === entryMenu.appId)?.name ?? "app"}`}
          onClose={() => setEntryMenu(null)}
          items={[
            {
              label: "Open",
              onSelect: () => {
                onOpenApp(entryMenu.appId);
                onClose();
              },
            },
            pins.includes(entryMenu.appId)
              ? { label: "Unpin", onSelect: () => unpinApp(entryMenu.appId) }
              : { label: "Pin to Start", onSelect: () => pinApp(entryMenu.appId) },
            ...(linuxLauncherActions(entryMenu.appId).length > 0 ? [{ type: "separator" as const }] : []),
            ...linuxLauncherActions(entryMenu.appId).map((a) => ({
              label: a.name,
              onSelect: () => {
                void launchLinuxApp(entryMenu.appId, a.id);
                onClose();
              },
            })),
          ]}
        />
      )}
    </motion.div>
  );
}
