/** What the tray draws from /api/system/stats (system.service.ts). */
export type TrayReadings = {
  /** CPU and memory for the text; null when the answer doesn't carry them. */
  load: { cpuPercent: number; memUsedBytes: number; memTotalBytes: number } | null;
  /** The volume's fullness for the disk warning; null when it's missing. */
  diskPercent: number | null;
};

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const field = (v: unknown, key: string): unknown =>
  typeof v === "object" && v !== null ? (v as Record<string, unknown>)[key] : undefined;

/**
 * Reads the stats answer without trusting its shape. Anything that isn't the
 * backend's stats object (an HTML page from a wrong API base, an empty object,
 * a half answer) reads as nothing, and the tray draws without it: reading
 * `stats.cpu.percent` off such a body once threw and took the desktop down.
 */
export function readTrayStats(body: unknown): TrayReadings {
  const cpuPercent = field(field(body, "cpu"), "percent");
  const memory = field(body, "memory");
  const memUsedBytes = field(memory, "usedBytes");
  const memTotalBytes = field(memory, "totalBytes");
  const diskPercent = field(field(body, "disk"), "percent");
  return {
    load:
      isNumber(cpuPercent) && isNumber(memUsedBytes) && isNumber(memTotalBytes)
        ? { cpuPercent, memUsedBytes, memTotalBytes }
        : null,
    diskPercent: isNumber(diskPercent) ? diskPercent : null,
  };
}
