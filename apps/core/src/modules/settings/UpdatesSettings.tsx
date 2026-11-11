import { required } from "../../shared/lib/required";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CircleCheck, Download, RefreshCw } from "lucide-react";
import { Button, desktopSessionId, useConfirm } from "@imbatranim/ui";
import { api } from "../../lib/axios";
import { reloadLinuxLaunchers } from "../linux-windows/launchers";
import { UPDATE_ACTIONS, buildName, releaseName, type PinView } from "./updates";

type Offer = PinView & {
  changes: { name: string; from: string; to: string }[];
  missing: string[];
  rebuilt: number;
};
type Updates = {
  available: boolean;
  current: (PinView & { fromImage: boolean }) | null;
  previous: PinView | null;
  checkedAt: number | null;
  update: Offer | null;
  upgrade: Offer | null;
};
type Job = {
  id: number;
  action: string;
  target: string;
  state: "running" | "done" | "failed";
  phase: string | null;
  log: string;
  error: string | null;
};

function errorMessage(err: unknown): string {
  const data = (err as { response?: { data?: { message?: unknown } } }).response?.data;
  return typeof data?.message === "string" ? data.message : "The request failed";
}

function checkedText(at: number | null): string {
  if (!at) return "Not checked yet";
  const when = new Date(at);
  const today = new Date().toDateString() === when.toDateString();
  return `Last checked ${
    today
      ? `today at ${when.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`
      : when.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
  }`;
}

function jobTitle(job: Job): string {
  if (job.state === "failed") {
    const what =
      job.action === "check"
        ? "Checking for updates"
        : job.action === "go-back"
          ? "Going back"
          : job.action === "upgrade"
            ? "The upgrade"
            : "The update";
    return `${what} failed${job.error ? `: ${job.error}` : ""}`;
  }
  if (job.state === "done")
    return job.action === "check"
      ? "Checked for updates"
      : job.action === "go-back"
        ? `Back on ${job.target}`
        : `Now on ${job.target}`;
  return job.phase ?? "Working…";
}

function OfferCard({
  title,
  offer,
  action,
  disabled,
  onTake,
}: {
  title: string;
  offer: Offer;
  action: string;
  disabled: boolean;
  onTake: () => void;
}) {
  return (
    <div
      className="rounded-control border-outline-variant bg-surface-container-low border p-4"
      data-linux-offer={offer.snapshot}
    >
      <div className="flex items-start gap-3">
        <Download size={18} strokeWidth={1.75} className="text-primary mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-on-surface text-[13px] font-semibold">{title}</p>
          <p className="text-on-surface-variant text-[12px]">
            {releaseName(offer.release)}, {buildName(offer)}
          </p>
        </div>
        <Button variant="primary" size="sm" disabled={disabled} onClick={onTake}>
          {action}
        </Button>
      </div>
      {offer.changes.length > 0 ? (
        <ul className="mt-3 space-y-1 pl-[30px]">
          {offer.changes.map((c) => (
            <li key={c.name} className="flex items-center gap-2 text-[12px]" data-linux-change={c.name}>
              <span className="text-on-surface font-medium">{c.name}</span>
              <span className="text-on-surface-variant tabular-nums">{c.from || "?"}</span>
              <ArrowRight size={12} className="text-on-surface-variant" aria-label="to" />
              <span className="text-on-surface tabular-nums">{c.to}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-on-surface-variant mt-3 pl-[30px] text-[12px]">No installed app changes version.</p>
      )}
      {(offer.rebuilt > 0 || offer.missing.length > 0) && (
        <p className="text-on-surface-variant mt-2 pl-[30px] text-[11px]">
          {offer.rebuilt > 0 &&
            `${offer.rebuilt} other app${offer.rebuilt === 1 ? "" : "s"} rebuilt with fixes at the same version. `}
          {offer.missing.length > 0 &&
            `Not in the new list, so ${offer.missing.length === 1 ? "it stays" : "they stay"} as ${offer.missing.length === 1 ? "it is" : "they are"}: ${offer.missing.join(", ")}.`}
        </p>
      )}
    </div>
  );
}

/**
 * Settings → Updates: the release Linux apps install from, a check against
 * NixOS's channels, fixes on this release and a newer release offered
 * separately, and Go back to the release before. Everything moves together:
 * the pin and every installed app.
 */
export function UpdatesSettings() {
  const qc = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLPreElement>(null);

  const updates = useQuery({
    queryKey: ["linux-apps", "updates"],
    queryFn: async () => (await api.get<Updates>("/linux-apps/updates")).data,
  });
  const job = useQuery({
    queryKey: ["linux-apps", "job"],
    queryFn: async () => (await api.get<{ job: Job | null }>("/linux-apps/job")).data.job,
    enabled: !!updates.data?.available,
    refetchInterval: (q) => (q.state.data?.state === "running" ? 1000 : false),
  });
  const running = job.data?.state === "running";
  const ours = !!job.data && UPDATE_ACTIONS.has(job.data.action);

  // When one of ours ends: the offers change, and after a move so do the
  // installed list, the package list, Start's entries and the disk.
  const lastJob = useRef<{ id: number; state: string } | null>(null);
  useEffect(() => {
    const j = job.data;
    if (!j) return;
    const prev = lastJob.current;
    lastJob.current = { id: j.id, state: j.state };
    if (j.state === "running" || !prev || prev.id !== j.id || prev.state !== "running") return;
    void qc.invalidateQueries({ queryKey: ["linux-apps", "updates"] });
    if (j.action !== "check" && UPDATE_ACTIONS.has(j.action)) {
      void qc.invalidateQueries({ queryKey: ["linux-apps", "status"] });
      void qc.invalidateQueries({ queryKey: ["linux-apps", "search"] });
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
      await api.post(path, body);
      await qc.invalidateQueries({ queryKey: ["linux-apps", "job"] });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const take = async (kind: "update" | "upgrade", offer: Offer) => {
    const ok = await confirm({
      title: kind === "update" ? "Update Linux apps?" : `Upgrade to ${releaseName(offer.release)}?`,
      message: `Every installed Linux app is rebuilt on ${releaseName(offer.release)}, ${buildName(offer)}. That downloads them again and can take a while. Apps that are open keep running their old build until you close and reopen them. You can go back afterwards.`,
      confirmLabel: kind === "update" ? "Update" : "Upgrade",
    });
    if (ok)
      await start("/linux-apps/updates/move", {
        kind,
        commit: offer.commit,
        session: desktopSessionId(),
      });
  };

  const goBack = async (prev: PinView) => {
    const ok = await confirm({
      title: `Go back to ${releaseName(prev.release)}, ${buildName(prev)}?`,
      message:
        "Your Linux apps return to how they were on that release, including what you installed or removed since. Apps that are open keep running until you close and reopen them.",
      confirmLabel: "Go back",
    });
    if (ok) await start("/linux-apps/updates/go-back", { session: desktopSessionId() });
  };

  if (updates.isLoading) return <p className="text-on-surface-variant text-[12px]">Loading…</p>;
  const data = updates.data;
  if (!data?.available || !data.current) {
    return (
      <p className="text-on-surface-variant text-[12px]">
        Linux apps aren&apos;t available on this machine, so there is nothing to update.
      </p>
    );
  }
  const current = data.current;
  const offers = !!(data.update || data.upgrade);
  const checking = running && job.data?.action === "check";
  const moving = running && ours && !checking;

  return (
    <div className="space-y-4" data-linux-updates="">
      {confirmDialog}
      <p className="text-on-surface-variant text-[12px] leading-relaxed">
        Updates for your Linux apps, from Nix&apos;s packages. Every installed app moves with the release. The desktop
        itself updates with a new image.
      </p>

      {/* The machine's state, Windows Update style. */}
      <div className="rounded-control border-outline-variant bg-surface-container-low flex items-center gap-4 border p-4">
        {running && ours ? (
          <RefreshCw size={28} strokeWidth={1.5} className="text-primary shrink-0 animate-spin" />
        ) : offers ? (
          <Download size={28} strokeWidth={1.5} className="text-primary shrink-0" />
        ) : (
          <CircleCheck size={28} strokeWidth={1.5} className="text-primary shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-on-surface text-[14px] font-semibold" data-linux-updates-state="">
            {checking
              ? "Checking for updates…"
              : moving
                ? "Updating your Linux apps…"
                : offers
                  ? "Updates are available"
                  : data.checkedAt
                    ? "You're up to date"
                    : "Check for updates to see what is new"}
          </p>
          <p className="text-on-surface-variant text-[12px]" data-linux-current={current.snapshot}>
            {releaseName(current.release)}, {buildName(current)}
            {current.fromImage ? ", as the image set it" : ""}
          </p>
          <p className="text-on-surface-variant text-[11px]">{checkedText(data.checkedAt)}</p>
        </div>
        <Button disabled={running} onClick={() => void start("/linux-apps/updates/check", {})} className="shrink-0">
          Check for updates
        </Button>
      </div>

      {data.update && (
        <OfferCard
          title={`Fixes for ${releaseName(data.update.release)}`}
          offer={data.update}
          action="Update"
          disabled={running}
          onTake={() => void take("update", required(data.update, "the update"))}
        />
      )}
      {data.upgrade && (
        <OfferCard
          title={`Upgrade to ${releaseName(data.upgrade.release)}`}
          offer={data.upgrade}
          action="Upgrade"
          disabled={running}
          onTake={() => void take("upgrade", required(data.upgrade, "the upgrade"))}
        />
      )}

      {error && <p className="text-error text-[12px]">{error}</p>}

      {job.data && ours && (
        <div>
          <p
            className={`mb-2 text-[12px] font-medium ${job.data.state === "failed" ? "text-error" : "text-on-surface"}`}
            data-linux-update-job={job.data.state}
          >
            {jobTitle(job.data)}
          </p>
          {job.data.action !== "check" && (
            <pre
              ref={logRef}
              className="border-outline-variant bg-surface-container-lowest text-on-surface-variant rounded-control max-h-[180px] overflow-auto border p-2 font-mono text-[11px] whitespace-pre-wrap"
            >
              {job.data.log}
            </pre>
          )}
        </div>
      )}

      <p className="text-on-surface-variant text-[11px]">
        Linux apps that are open keep running their old build until you close and reopen them.
      </p>

      {data.previous && (
        <div className="flex items-center gap-3" data-linux-previous={data.previous.snapshot}>
          <p className="text-on-surface flex-1 text-[12px]">
            The release before, {releaseName(data.previous.release)}, {buildName(data.previous)}, is still on disk with
            its apps.
          </p>
          <Button size="sm" disabled={running} onClick={() => void goBack(required(data.previous, "the previous pin"))}>
            Go back
          </Button>
        </div>
      )}
    </div>
  );
}
