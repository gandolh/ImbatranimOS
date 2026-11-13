import { required } from "../../shared/lib/required";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Checkbox, SHARED_KIT_VERSION, cn, useConfirm } from "@imbatranim/ui";
import { api } from "../../lib/axios";
import { openApp } from "../../shared/intents/openApp";
import { useWindowStore } from "../../shared/store/windowStore";
import {
  descriptorIdOf,
  loadMarketplace,
  marketplaceIcon,
  rebuildFixesKit,
  useBuiltInClashes,
  type MarketplaceApp,
} from "../../shared/registry/marketplace";
import { ConsentCard, InstallFromUrl, SourceBadge } from "./InstallFromUrl";
import { apiMessage, sourceLine, trustBadge, type Inspection } from "./urlApps";

type Problem = Awaited<ReturnType<typeof loadMarketplace>>["problems"][number];

const JOB_LABEL: Record<NonNullable<MarketplaceApp["job"]>["state"], string> = {
  queued: "Waiting for another install…",
  fetching: "Downloading the source…",
  building: "Building…",
  failed: "Install failed",
};

function errorMessage(err: unknown): string {
  const data = (err as { response?: { data?: { message?: unknown } } }).response?.data;
  return typeof data?.message === "string" ? data.message : "The request failed";
}

/**
 * One row of the pane: a URL app, or a catalog descriptor with its apps
 *. The apps of one descriptor share its install, job, server and
 * log, so the row reads them from the first.
 */
type Row = {
  descriptorId: string;
  /** The row's heading: the descriptor's name. */
  name: string;
  apps: MarketplaceApp[];
  /** More than the one app a version 1 descriptor is: the apps are listed under the heading. */
  suite: boolean;
};

function rowsOf(apps: MarketplaceApp[]): Row[] {
  const rows: Row[] = [];
  const byDescriptor = new Map<string, Row>();
  for (const app of apps) {
    const descriptorId = descriptorIdOf(app);
    const existing = byDescriptor.get(descriptorId);
    if (existing) {
      existing.apps.push(app);
      existing.suite = true;
      continue;
    }
    const row: Row = {
      descriptorId,
      name: app.descriptorName ?? app.name,
      apps: [app],
      suite: app.id !== descriptorId,
    };
    rows.push(row);
    byDescriptor.set(descriptorId, row);
  }
  return rows;
}

/**
 * Settings → Marketplace: the apps the OS repo's catalog
 * describes, and installing, updating and removing them. Installing clones
 * the app's repository at the commit the catalog pins and builds it here, so
 * it takes a while; the list polls until it is done.
 *
 * One row per descriptor: a suite's apps are installed, updated
 * and removed together, so its row carries those buttons once and lists its
 * apps under the heading, each with its own Open. Enabling and disabling an
 * app stays per app, in Settings → Apps.
 */
export function MarketplaceSettings({
  focusRow = null,
}: {
  /** A row to scroll to and highlight; a new `n` asks again for the same `id`. */
  focusRow?: { id: string; n: number } | null;
} = {}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["marketplace"],
    // Also syncs the desktop's registry, so a finished install shows in Start.
    queryFn: loadMarketplace,
    refetchInterval: (q) => (q.state.data?.apps.some((a) => a.job && a.job.state !== "failed") ? 2000 : false),
  });
  const listing = query.data ?? null;
  const [actionError, setActionError] = useState<string | null>(null);
  const error = actionError ?? (query.error ? errorMessage(query.error) : null);
  const [log, setLog] = useState<{ id: string; text: string } | null>(null);
  const { confirm, confirmDialog } = useConfirm();
  const clashes = useBuiltInClashes();

  const [update, setUpdate] = useState<{ id: string; inspection: Inspection } | null>(null);
  /** The URL app whose stored URL now resolves to a different app. */
  const [moved, setMoved] = useState<string | null>(null);
  const [rowNote, setRowNote] = useState<{ id: string; text: string } | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const note = (id: string, text: string) => {
    setRowNote({ id, text });
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setRowNote(null), 4000);
  };

  const checkForUpdate = async (app: MarketplaceApp) => {
    if (!app.source) return;
    setError(null);
    setMoved((id) => (id === app.id ? null : id));
    note(app.id, "Checking…");
    try {
      const { data } = await api.post<Inspection>("/marketplace/url/inspect", {
        url: app.source.url,
      });
      const discard = () =>
        void Promise.resolve(api.delete(`/marketplace/url/pending/${data.pending}`)).catch(() => {});
      if (data.id !== descriptorIdOf(app)) {
        // The stored URL now resolves to another folder or app (its id is
        // derived from the source). A consent card in this row would read as
        // an update to this app while installing something else beside it.
        discard();
        setRowNote(null);
        setMoved(app.id);
      } else if (data.source.commit === app.source.commit) {
        discard();
        note(app.id, "Up to date.");
      } else {
        setRowNote(null);
        setUpdate({ id: app.id, inspection: data });
      }
    } catch (err) {
      setRowNote(null);
      setError(apiMessage(err, "Couldn't reach that repository."));
    }
  };

  const [highlight, setHighlight] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const loaded = !!listing;
  useEffect(() => {
    if (!focusRow || !loaded) return;
    // An id not in the catalog finds no row, and nothing happens.
    const el = rowRefs.current.get(focusRow.id);
    if (!el) return;
    el.scrollIntoView?.({ block: "center", behavior: "smooth" });
    setHighlight(focusRow.id);
    const timer = setTimeout(() => setHighlight(null), 2500);
    return () => clearTimeout(timer);
  }, [focusRow, loaded]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["marketplace"] });
  const setError = setActionError;

  const install = async (row: Row) => {
    try {
      await api.post(`/marketplace/apps/${row.descriptorId}/install`);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
    await refresh();
  };

  /** The uninstall prompt's "Also remove its data", read once the prompt is answered. */
  const removeData = useRef(false);

  const uninstall = async (row: Row) => {
    const names = row.apps.map((a) => a.name).join(", ");
    removeData.current = false;
    const ok = await confirm({
      title: `Uninstall ${row.name}?`,
      message: (
        <>
          {row.suite
            ? `Its apps (${names}) go with it: the downloaded source and build are deleted, and their windows close.`
            : "Its downloaded source and build are deleted, and its window closes."}{" "}
          {row.suite
            ? "Their caches go too. Their settings and data stay for a reinstall unless you tick the box; files they saved elsewhere stay either way."
            : "Its cache goes too. Its settings and data stay for a reinstall unless you tick the box; files it saved elsewhere stay either way."}
          <span className="mt-3 block">
            <Checkbox
              label="Also remove its data"
              onCheckedChange={(checked) => {
                removeData.current = checked === true;
              }}
            />
          </span>
        </>
      ),
      confirmLabel: "Uninstall",
      destructive: true,
    });
    if (!ok) return;
    const ids = new Set(row.apps.map((a) => a.id));
    const { windows, closeWindow } = useWindowStore.getState();
    for (const w of windows) if (ids.has(w.appId)) closeWindow(w.id);
    try {
      await api.delete(`/marketplace/apps/${row.descriptorId}${removeData.current ? "?removeData=1" : ""}`);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
    if (log?.id === row.descriptorId) setLog(null);
    await refresh();
  };

  // An installed app whose stored record is damaged is not in the list, only
  // in `problems`; uninstalling it is the way out (the backend's own advice).
  const uninstallBroken = async (appId: string) => {
    const ok = await confirm({
      title: "Uninstall this app?",
      message: "Its record on this machine is damaged. Its files are deleted and its windows close.",
      confirmLabel: "Uninstall",
      destructive: true,
    });
    if (!ok) return;
    const { windows, closeWindow } = useWindowStore.getState();
    for (const w of windows) if (w.appId === appId) closeWindow(w.id);
    try {
      await api.delete(`/marketplace/apps/${appId}`);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
    await refresh();
  };

  // A prebuilt app from a URL, installed before this OS stopped running that
  // kind: it can't open, so Uninstall is all there is.
  const uninstallRetired = async (p: Problem) => {
    removeData.current = false;
    const ok = await confirm({
      title: `Uninstall ${required(p.retired, "the retired app").name}?`,
      message: (
        <>
          This OS no longer runs prebuilt apps from a URL. Its downloaded files are deleted. Its settings and data stay
          unless you tick the box.
          <span className="mt-3 block">
            <Checkbox
              label="Also remove its data"
              onCheckedChange={(checked) => {
                removeData.current = checked === true;
              }}
            />
          </span>
        </>
      ),
      confirmLabel: "Uninstall",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/marketplace/apps/${p.appId}${removeData.current ? "?removeData=1" : ""}`);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
    await refresh();
  };

  const showLog = async (descriptorId: string) => {
    if (log?.id === descriptorId) return setLog(null);
    try {
      const { data } = await api.get<string>(`/marketplace/apps/${descriptorId}/log`, {
        responseType: "text",
      });
      setLog({ id: descriptorId, text: data || "Nothing logged yet." });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  if (!listing) {
    return <p className="text-on-surface-variant text-control">{error ?? "Loading the catalog…"}</p>;
  }

  const retiredApps = listing.problems.filter((p) => p.appId && p.retired);
  const brokenApps = listing.problems.filter((p) => p.appId && !p.retired);
  const catalogProblems = listing.problems.filter((p) => !p.appId);

  return (
    <div>
      <InstallFromUrl onInstalled={() => void refresh()} />
      <p className="text-on-surface-variant text-control mb-5">
        Apps from other repositories, built on this machine from the exact commit the catalog names. An install
        downloads the source and runs its build, which can take minutes.
      </p>
      {error && <p className="text-error text-control mb-3">{error}</p>}
      {listing.apps.length === 0 && (
        <p className="text-on-surface-variant text-control">
          The catalog is empty. Apps are added to it in the OS repository, under <code>marketplace/</code>.
        </p>
      )}
      <div className="grid gap-2">
        {rowsOf(listing.apps).map((row) => {
          // The apps of a descriptor share its install, job and server.
          const app = row.apps[0];
          // An app from a URL: a catalog app's row, plus where it came from
          // and who vouched for its commit.
          const nativeUrl = !!app.source;
          const badge = nativeUrl && app.trust ? trustBadge(app.trust) : null;
          // Only a verified app updates as the verified list moves.
          const checksForUpdates = nativeUrl && badge?.label !== "Verified";
          const Icon = marketplaceIcon(row.suite ? "package" : app.icon);
          const installed = app.installed;
          const missing = row.apps.some((a) => a.installed?.missing);
          const working = app.job && app.job.state !== "failed";
          const outdated = installed && installed.ref !== app.ref;
          // A kit app built for another shared kit will not open here.
          const mismatched = row.apps.find(
            (a) => typeof a.sharedKit === "number" && a.sharedKit !== SHARED_KIT_VERSION,
          );
          const kitMismatch = mismatched?.sharedKit;
          // At the same ref, with the build present, Update and Reinstall do
          // not show; if the catalog now names this desktop's kit, the same
          // install rebuilds it for this kit.
          const rebuild =
            !!installed && !missing && !outdated && !!mismatched && rebuildFixesKit(mismatched, SHARED_KIT_VERSION);
          const clashing = (a: MarketplaceApp) => clashes.includes(a.id);
          const canOpen = (a: MarketplaceApp) => !!a.installed && !a.installed.missing && !working && !clashing(a);
          let state: string;
          if (working) state = JOB_LABEL[required(app.job, "the job").state];
          else if (app.job?.state === "failed") state = `${JOB_LABEL.failed}: ${app.job.reason ?? ""}`;
          else if (rebuild)
            state = `Built for shared kit ${kitMismatch}; a rebuild for kit ${SHARED_KIT_VERSION} is available`;
          else if (kitMismatch !== undefined)
            state = `Needs an update: built for shared kit ${kitMismatch}, this desktop has ${SHARED_KIT_VERSION}`;
          else if (!installed) state = "Not installed";
          else if (missing) state = "Its build is missing (restored from a backup?)";
          else if (outdated) state = "An update is available";
          else state = `Installed · ${installed.ref.slice(0, 7)}`;
          if (app.server.state === "crashed") state = `Server stopped: ${app.server.reason}`;
          return (
            <div
              key={row.descriptorId}
              data-descriptor-id={row.descriptorId}
              ref={(el) => {
                if (el) rowRefs.current.set(row.descriptorId, el);
                else rowRefs.current.delete(row.descriptorId);
              }}
              // min-w-0: a grid item is as wide as its content by default, and
              // a long job reason would widen every row past the window.
              className={cn(
                "rounded-control bg-surface-container-low min-w-0 border px-3 py-2.5 transition-colors",
                highlight === row.descriptorId ? "border-primary ring-primary ring-2" : "border-outline-variant",
              )}
            >
              <div className="flex items-center gap-3">
                <span className="rounded-control border-outline-variant bg-surface-container-lowest text-on-surface flex h-7 w-7 shrink-0 items-center justify-center border">
                  <Icon size={15} strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-ui text-on-surface text-body block truncate font-medium">
                    {row.name}
                    {nativeUrl && (
                      <span className="text-on-surface-variant text-label ml-2 font-semibold">From a URL</span>
                    )}
                    {badge && <SourceBadge warn={badge.warn}>{badge.label}</SourceBadge>}
                    {row.suite && (
                      <span className="text-on-surface-variant text-label ml-2 font-semibold">
                        {row.apps.length === 1 ? "1 app" : `${row.apps.length} apps`}
                      </span>
                    )}
                    {app.type === "service" && (
                      <span className="text-on-surface-variant text-label ml-2 font-semibold">With server</span>
                    )}
                  </span>
                  <span className="text-on-surface-variant text-label block truncate" title={state} aria-live="polite">
                    {rowNote?.id === app.id ? rowNote.text : state}
                  </span>
                  {nativeUrl && (
                    <span className="text-on-surface-variant text-label block truncate">
                      {sourceLine(required(app.source, "the source"))}
                    </span>
                  )}
                </span>
                <div className="flex shrink-0 gap-1.5">
                  {!row.suite && canOpen(app) && (
                    <Button size="sm" variant="primary" onClick={() => openApp(app.id)}>
                      Open
                    </Button>
                  )}
                  {!working && (!installed || missing || outdated) && (
                    <Button size="sm" variant={installed ? "default" : "primary"} onClick={() => void install(row)}>
                      {!installed ? "Install" : missing ? "Reinstall" : "Update"}
                    </Button>
                  )}
                  {!working && rebuild && (
                    <Button size="sm" onClick={() => void install(row)}>
                      Rebuild
                    </Button>
                  )}
                  {/* A verified app updates as the verified list moves;
                        any other looks for a new commit, which asks for
                        your trust unless that commit is verified. */}
                  {checksForUpdates && installed && !working && (
                    <Button size="sm" onClick={() => void checkForUpdate(app)}>
                      Check for update
                    </Button>
                  )}
                  {(installed || app.job?.state === "failed") && (
                    <Button size="sm" variant="ghost" onClick={() => void showLog(row.descriptorId)}>
                      Log
                    </Button>
                  )}
                  {(installed || app.job?.state === "failed") && !working && (
                    <Button size="sm" variant="ghost" onClick={() => void uninstall(row)}>
                      {installed ? "Uninstall" : "Clear"}
                    </Button>
                  )}
                </div>
              </div>
              {moved === app.id && (
                <p className="text-on-surface text-label mt-2" role="status">
                  This URL now points to a different app. Install it from the field above if you want it.
                </p>
              )}
              {update?.id === app.id && (
                <ConsentCard
                  inspection={update.inspection}
                  onCancel={() => setUpdate(null)}
                  onInstalled={() => {
                    setUpdate(null);
                    note(app.id, "Updated.");
                    void refresh();
                  }}
                />
              )}
              {row.suite ? (
                <ul className="border-outline-variant mt-2 grid border-t pt-1" aria-label={`${row.name}'s apps`}>
                  {row.apps.map((a) => {
                    const AppIcon = marketplaceIcon(a.icon);
                    return (
                      <li key={a.id} className="flex min-h-7 min-w-0 items-center gap-2 py-0.5">
                        <AppIcon size={12} strokeWidth={1.75} className="text-on-surface-variant shrink-0" />
                        <span className="font-ui text-on-surface text-control shrink-0 font-medium">{a.name}</span>
                        <span
                          className="text-on-surface-variant text-label min-w-0 flex-1 truncate"
                          role={clashing(a) ? "status" : undefined}
                        >
                          {clashing(a)
                            ? `A built-in app already has the id ${a.id}, so the built-in opens instead.`
                            : a.description}
                        </span>
                        {canOpen(a) && (
                          <Button size="sm" variant="ghost" aria-label={`Open ${a.name}`} onClick={() => openApp(a.id)}>
                            Open
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <>
                  {clashing(app) && (
                    <p className="text-on-surface text-label mt-2" role="status">
                      A built-in app already has the id <code>{app.id}</code>, so the built-in opens instead.
                    </p>
                  )}
                  {app.description && <p className="text-on-surface-variant text-label mt-2">{app.description}</p>}
                </>
              )}
              {log?.id === row.descriptorId && (
                <pre className="rounded-control border-outline-variant bg-surface-container-lowest text-on-surface custom-scrollbar text-label mt-2 max-h-60 overflow-auto border p-2 whitespace-pre-wrap select-text">
                  {log.text}
                </pre>
              )}
            </div>
          );
        })}
        {retiredApps.map((p) => {
          const Icon = marketplaceIcon("package");
          return (
            <div
              key={p.file}
              data-descriptor-id={p.appId}
              className="rounded-control border-outline-variant bg-surface-container-low min-w-0 border px-3 py-2.5"
            >
              <div className="flex items-center gap-3">
                <span className="rounded-control border-outline-variant bg-surface-container-lowest text-on-surface-variant flex h-7 w-7 shrink-0 items-center justify-center border">
                  <Icon size={15} strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-ui text-on-surface text-body block truncate font-medium">
                    {required(p.retired, "the retired app").name}
                    <span className="text-on-surface-variant text-label ml-2 font-semibold">From a URL</span>
                    <SourceBadge warn>No longer supported</SourceBadge>
                  </span>
                  <span className="text-on-surface-variant text-label block truncate">
                    A prebuilt app, which this OS no longer runs. Uninstall it.
                  </span>
                  {p.retired?.source && (
                    <span className="text-on-surface-variant text-label block truncate">
                      {sourceLine(p.retired.source)}
                    </span>
                  )}
                </span>
                <div className="flex shrink-0 gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => void uninstallRetired(p)}>
                    Uninstall
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {brokenApps.length > 0 && (
        <div className="mt-4">
          <p className="text-on-surface-variant text-label mb-1 font-semibold">Installed apps that could not be read</p>
          <ul className="text-label grid gap-1">
            {brokenApps.map((p) => (
              <li key={p.file} className="text-on-surface-variant flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  <code>{p.file}</code>: {p.problem}
                </span>
                <Button size="sm" variant="ghost" onClick={() => void uninstallBroken(required(p.appId, "the app id"))}>
                  Uninstall
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {catalogProblems.length > 0 && (
        <div className="mt-4">
          <p className="text-on-surface-variant text-label mb-1 font-semibold">
            Catalog entries that could not be read
          </p>
          <ul className="text-on-surface-variant text-label list-disc pl-5">
            {catalogProblems.map((p) => (
              <li key={p.file}>
                <code>{p.file}</code>: {p.problem}
              </li>
            ))}
          </ul>
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
