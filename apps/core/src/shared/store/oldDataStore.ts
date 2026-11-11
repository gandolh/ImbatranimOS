import { create } from "zustand";
import { api } from "../../lib/axios";
import { requestPick } from "../../system/filePortal";

/**
 * The older data the data moves set aside (an app had written its own files
 * since, so the old rows were kept under another name), as the backend's
 * `/system/old-data` reports it.
 */
export type OldDataStatus = {
  apps: { appId: string; name: string }[];
  sets: { folder: string; appId: string; tables: Record<string, string> }[];
  /** Whether to ask at sign-in: some of it is neither downloaded nor cleaned out. */
  notice: boolean;
};

/** The sign-in notice: asking, or saved and offering the clean-out. */
export type OldDataStep = "closed" | "ask" | "saved";

type OldDataStore = {
  status: OldDataStatus | null;
  step: OldDataStep;
  /** Where the archive was saved, for the notice's second step. */
  savedTo: string | null;
};

export const useOldDataStore = create<OldDataStore>(() => ({
  status: null,
  step: "closed",
  savedTo: null,
}));

/** Read what is set aside now; null when the backend can't say. */
export async function loadOldData(): Promise<OldDataStatus | null> {
  try {
    const { data } = await api.get<OldDataStatus>("/system/old-data");
    useOldDataStore.setState({ status: data });
    return data;
  } catch {
    return null;
  }
}

/**
 * At every sign-in: ask when there is older data the owner hasn't picked a
 * way out for. Closing the notice picks nothing, so it asks again next time.
 */
export async function checkOldDataAtSignIn(): Promise<void> {
  const status = await loadOldData();
  if (status?.notice) useOldDataStore.setState({ step: "ask", savedTo: null });
}

export function closeOldDataNotice(): void {
  useOldDataStore.setState({ step: "closed" });
}

/** "Todo", "Todo and Bookmarks", "Todo, Bookmarks and Git GUI". */
export function oldDataApps(status: OldDataStatus | null): string {
  const names = status?.apps.map((a) => a.name) ?? [];
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** `imbatranim-old-data-2026-11-09.tar.gz`, by the local date. */
export function oldDataFileName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `imbatranim-old-data-${day}.tar.gz`;
}

/**
 * Ask where to save the archive through the OS's Save dialog, then have the
 * backend write it there. Null when the dialog was cancelled. A download is
 * the owner's pick: the backend stops the notice from asking again.
 */
export async function downloadOldData(): Promise<string | null> {
  const choice = await requestPick({
    mode: "save",
    title: "Save the older data",
    extensions: ["gz"],
    suggestedName: oldDataFileName(),
  });
  if (!choice) return null;
  const { data } = await api.post<{ path: string; files: number }>("/system/old-data/download", {
    root: choice.root,
    path: choice.path,
  });
  useOldDataStore.setState({ savedTo: data.path });
  await loadOldData();
  return data.path;
}

/** The confirmation every clean-out asks first, in the notice and in Settings. */
export const CLEAN_OUT_CONFIRM = {
  title: "Clean out older data",
  message: "This deletes the older data for good.",
  confirmLabel: "Clean out",
  destructive: true,
} as const;

/** Drop every set-aside table. The caller has confirmed first. */
export async function cleanOutOldData(): Promise<void> {
  await api.delete("/system/old-data");
  await loadOldData();
}

/** The backend's message for a failed call, else a plain one. */
export function oldDataError(err: unknown): string {
  const data = (err as { response?: { data?: { message?: unknown } } }).response?.data;
  return typeof data?.message === "string" ? data.message : "The request failed";
}
