import { required } from "../../shared/lib/required";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Select, desktopSessionId, useConfirm } from "@imbatranim/ui";
import { KEYBOARD_LAYOUTS, useLinuxAppsPrefs, type KeyboardLayoutId } from "../linux-windows/keyboardLayout";
import { api } from "../../lib/axios";
import { reloadLinuxLaunchers } from "../linux-windows/launchers";
import { UPDATE_ACTIONS } from "./updates";

type Status = {
  available: boolean;
  index: "ready" | "building" | "missing" | "mismatch" | "failed";
  release: string | null;
  pinCommit: string | null;
  indexCommit: string | null;
};
type Result = { attr: string; pname: string; version: string; description: string; unfree: boolean };
type Installed = { name: string; attr: string; version: string };
type Job = {
  id: number;
  action: "install" | "remove" | "free-space" | "check" | "update" | "upgrade" | "go-back";
  target: string;
  state: "running" | "done" | "failed";
  log: string;
  error: string | null;
};

const SEARCH_DEBOUNCE_MS = 300;

function errorMessage(err: unknown): string {
  const data = (err as { response?: { data?: { message?: unknown } } }).response?.data;
  return typeof data?.message === "string" ? data.message : "The request failed";
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  return `${Math.round(bytes / 1e3)} kB`;
}

function jobTitle(job: Job): string {
  const what =
    job.action === "install"
      ? `Installing ${job.target}`
      : job.action === "remove"
        ? `Removing ${job.target}`
        : "Freeing space";
  if (job.state === "running") return `${what}…`;
  if (job.state === "done") return `${what}: done`;
  return `${what}: failed${job.error ? ` (${job.error})` : ""}`;
}

/**
 * Settings → Linux apps: find a program in the machine's package list,
 * install or remove it, and see what the installed ones take on disk.
 * Installed apps appear in Start by themselves.
 */
export function LinuxAppsSettings() {
  const qc = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setTerm(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const status = useQuery({
    queryKey: ["linux-apps", "status"],
    queryFn: async () => (await api.get<Status>("/linux-apps")).data,
    refetchInterval: (q) => (q.state.data?.index === "building" ? 2000 : false),
  });
  const ready = status.data?.index === "ready";

  const results = useQuery({
    queryKey: ["linux-apps", "search", term],
    queryFn: async () => (await api.get<Result[]>("/linux-apps/search", { params: { q: term } })).data,
    enabled: ready && term.length > 0,
  });

  const installed = useQuery({
    queryKey: ["linux-apps", "installed"],
    queryFn: async () => (await api.get<Installed[]>("/linux-apps/installed")).data,
    enabled: !!status.data?.available,
  });

  const job = useQuery({
    queryKey: ["linux-apps", "job"],
    queryFn: async () => (await api.get<{ job: Job | null }>("/linux-apps/job")).data.job,
    enabled: !!status.data?.available,
    refetchInterval: (q) => (q.state.data?.state === "running" ? 1000 : false),
  });
  const running = job.data?.state === "running";

  const store = useQuery({
    queryKey: ["linux-apps", "store"],
    queryFn: async () => (await api.get<{ bytes: number | null }>("/linux-apps/store")).data.bytes,
    enabled: !!status.data?.available,
  });

  // When a job ends: the installed list, Start's entries and the size change.
  const lastJob = useRef<{ id: number; state: string } | null>(null);
  useEffect(() => {
    const j = job.data;
    if (!j) return;
    const prev = lastJob.current;
    lastJob.current = { id: j.id, state: j.state };
    if (j.state !== "running" && prev && prev.id === j.id && prev.state === "running") {
      void qc.invalidateQueries({ queryKey: ["linux-apps", "installed"] });
      void qc.invalidateQueries({ queryKey: ["linux-apps", "store"] });
      void reloadLinuxLaunchers();
    }
  }, [job.data, qc]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [job.data?.log]);

  const start = async (path: string, body: object) => {
    setError(null);
    try {
      await api.post(path, { ...body, session: desktopSessionId() });
      await qc.invalidateQueries({ queryKey: ["linux-apps", "job"] });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const remove = async (app: Installed) => {
    const ok = await confirm({
      title: `Remove ${app.name}?`,
      message:
        "It leaves Start and its files leave your apps. What it saved in your home folder stays. Free space afterwards to reclaim the disk.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (ok) await start("/linux-apps/remove", { name: app.name });
  };

  const freeSpace = async () => {
    const ok = await confirm({
      title: "Free space?",
      message:
        "This deletes old versions of your Linux apps, the release Updates keeps for Go back, and anything no app uses. You can no longer go back to an earlier version afterwards.",
      confirmLabel: "Free space",
      destructive: true,
    });
    if (ok) await start("/linux-apps/free-space", {});
  };

  const keyboardLayout = useLinuxAppsPrefs((p) => p.keyboardLayout);
  const setKeyboardLayout = useLinuxAppsPrefs((p) => p.setKeyboardLayout);

  if (status.isLoading) {
    return <p className="text-on-surface-variant text-control">Loading…</p>;
  }
  if (!status.data?.available) {
    return <p className="text-on-surface-variant text-control">Linux apps aren&apos;t available on this machine.</p>;
  }

  const installedNames = new Set((installed.data ?? []).map((a) => a.attr));

  return (
    <div className="space-y-6" data-linux-apps-pane="">
      {confirmDialog}
      <p className="text-on-surface-variant text-control leading-relaxed">
        Programs for Linux, from the {status.data.release ?? "pinned"} release of Nix&apos;s packages. Installed
        programs appear in Start; command-line tools work in the Terminal.
      </p>

      {status.data.index === "mismatch" && (
        <p className="border-error text-error rounded-control text-control border px-3 py-2">
          The package list doesn&apos;t match the release this machine installs from, so installing is off. Rebuild the
          image to fix it.
        </p>
      )}
      {status.data.index === "failed" && (
        <p className="border-error text-error rounded-control text-control border px-3 py-2">
          The package list could not be read.
        </p>
      )}

      {/* Search */}
      <div>
        <div className="max-w-[420px]">
          <Input
            aria-label="Search Linux apps"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={status.data.index === "building" ? "Preparing the package list…" : "Search, e.g. firefox"}
            disabled={!ready}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        {ready && term && (
          <ul className="border-outline-variant rounded-control apricot:divide-transparent apricot:py-1 mt-3 max-h-[320px] divide-y overflow-y-auto border px-(--k-list-inset)">
            {results.isFetching && !results.data && (
              <li className="text-on-surface-variant rounded-item text-control px-3 py-2">Searching…</li>
            )}
            {results.data?.length === 0 && (
              <li className="text-on-surface-variant rounded-item text-control px-3 py-2">Nothing found.</li>
            )}
            {results.data?.map((r) => (
              <li key={r.attr} className="rounded-item flex items-start gap-3 px-3 py-2" data-linux-result={r.attr}>
                <div className="min-w-0 flex-1">
                  <div className="text-body flex items-center gap-2">
                    <span className="text-on-surface font-medium">{r.pname || r.attr}</span>
                    <span className="text-on-surface-variant">{r.version}</span>
                    {r.unfree && (
                      <span
                        className="border-outline text-on-surface-variant rounded-small text-tiny border px-1 uppercase"
                        title="Its license isn't free software"
                      >
                        Unfree
                      </span>
                    )}
                  </div>
                  <div className="text-on-surface-variant text-control truncate">{r.description}</div>
                  <div className="text-on-surface-variant text-label font-mono">{r.attr}</div>
                </div>
                {installedNames.has(r.attr) ? (
                  <span className="text-on-surface-variant text-control pt-1">Installed</span>
                ) : (
                  <Button
                    size="sm"
                    disabled={running}
                    onClick={() => void start("/linux-apps/install", { attr: r.attr })}
                  >
                    Install
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="text-error text-control">{error}</p>}

      {/* The current or last job; an update's is shown under Updates. */}
      {running && UPDATE_ACTIONS.has(required(job.data, "the job").action) && (
        <p className="text-on-surface-variant text-control" data-linux-job="update">
          {required(job.data, "the job").action === "check"
            ? "Checking for updates. Installs and removals wait a moment."
            : "Linux apps are being updated (see Updates below). Installs and removals wait until it finishes."}
        </p>
      )}
      {job.data && !UPDATE_ACTIONS.has(job.data.action) && (
        <div>
          <p className="text-on-surface text-control mb-2 font-medium" data-linux-job={job.data.state}>
            {jobTitle(job.data)}
          </p>
          <pre
            ref={logRef}
            className="border-outline-variant bg-surface-container-lowest text-on-surface-variant rounded-control text-label max-h-[180px] overflow-auto border p-2 font-mono whitespace-pre-wrap"
          >
            {job.data.log}
          </pre>
        </div>
      )}

      {/* Installed */}
      <div>
        <p className="text-on-surface-variant text-label mb-2 font-semibold tracking-widest uppercase">Installed</p>
        {installed.data?.length ? (
          <ul className="border-outline-variant rounded-control apricot:divide-transparent apricot:py-1 divide-y border px-(--k-list-inset)">
            {installed.data.map((a) => (
              <li key={a.name} className="rounded-item flex items-center gap-3 px-3 py-2" data-linux-installed={a.name}>
                <span className="text-on-surface text-body flex-1">
                  {a.name} <span className="text-on-surface-variant">{a.version}</span>
                </span>
                <Button size="sm" disabled={running} onClick={() => void remove(a)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-on-surface-variant text-control">No Linux apps installed yet.</p>
        )}
      </div>

      {/* Keyboard layout */}
      <div className="max-w-[260px]" data-linux-keyboard-layout="">
        <Select
          label="Keyboard layout"
          value={keyboardLayout}
          onValueChange={(id) => setKeyboardLayout(id as KeyboardLayoutId)}
          options={KEYBOARD_LAYOUTS.map((l) => ({ value: l.id, label: l.label }))}
        />
        <p className="text-on-surface-variant text-label mt-1">
          What Linux apps type. Running apps switch at once; the desktop&apos;s own apps use your browser&apos;s layout.
        </p>
      </div>

      {/* Disk */}
      <div className="flex items-center gap-3">
        <p className="text-on-surface text-control flex-1" data-linux-store="">
          {store.data == null
            ? "Measuring what Linux apps take on disk…"
            : `Linux apps take ${formatBytes(store.data)} on disk.`}
        </p>
        <Button size="sm" disabled={running} onClick={() => void freeSpace()}>
          Free space
        </Button>
      </div>
    </div>
  );
}
