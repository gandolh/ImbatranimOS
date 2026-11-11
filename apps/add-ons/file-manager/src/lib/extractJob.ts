import type { SystemHttp } from "@imbatranim/ui";
import { fetchJob, startExtractJob } from "../api/archiveApi";
import type { ExtractResult } from "../types";

/** How often a running extraction is polled: live enough to feel it, cheap enough to leave on. */
export const POLL_MS = 400;

export type ExtractRequest = {
  root: string;
  path: string;
  dest?: string;
  /** Archive entry names; absent means the whole archive. */
  entries?: string[];
};

/**
 * Run one extraction as a polled job and resolve with its result.
 *
 * A plain function, not a hook: the loop must keep going after the Files
 * window that started it is closed, so the caller can still raise the
 * notification. A failed job rejects with the backend's message.
 */
export async function runExtractJob(
  http: SystemHttp,
  req: ExtractRequest,
  onProgress: (percent: number) => void,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<ExtractResult> {
  const { id } = await startExtractJob(http, req.root, req.path, req.dest, req.entries);
  for (;;) {
    await wait(POLL_MS);
    const job = await fetchJob(http, id);
    onProgress(job.percent);
    if (job.state === "running") continue;
    if (job.state === "failed" || !job.result) throw new Error(job.error ?? "Extraction failed");
    return job.result;
  }
}
