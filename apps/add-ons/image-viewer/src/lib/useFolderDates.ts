import { useEffect, useMemo, useState } from "react";
import type { SystemHandle } from "@imbatranim/ui";
import { readRange } from "../api/readRange";
import type { FsEntry } from "../api/types";
import { readExifDate } from "./exifDate";
import { groupByDay, modifiedDate, type DayGroup } from "./groupByDay";
import { READ_CONCURRENCY, mapLimit } from "./pool";

export type FolderDates = {
  /** Grouped by modified time while the dates are read, by capture date once every one is in. */
  groups: DayGroup[];
  /** Dates still being read. */
  reading: boolean;
  /** JPEGs whose date has come in, and how many there are to read. */
  done: number;
  total: number;
};

const isJpeg = (e: FsEntry) => /\.jpe?g$/i.test(e.name);

/**
 * Works out the day groups of a folder's photos once `enabled`. JPEGs are read
 * for their Exif date (the first bytes only, six at a time); every other
 * format, and a JPEG without a date, counts at its modified time. The groups
 * change exactly once: from the modified-time grouping to the final one. Only
 * the progress count moves in between.
 */
export function useFolderDates(
  system: SystemHandle,
  root: string | null,
  files: FsEntry[] | null,
  enabled: boolean,
): FolderDates {
  const [final, setFinal] = useState<{ files: FsEntry[]; groups: DayGroup[] } | null>(null);
  const [progress, setProgress] = useState<{ files: FsEntry[]; count: number } | null>(null);

  const provisional = useMemo(
    () => groupByDay((files ?? []).map((entry) => ({ entry, date: modifiedDate(entry) }))),
    [files],
  );

  useEffect(() => {
    if (!enabled || !root || !files) return;
    const jpegs = files.filter(isJpeg);
    const ctl = new AbortController();
    let cancelled = false;
    let count = 0;
    void (async () => {
      const dates = new Map<string, Date>();
      await mapLimit(jpegs, READ_CONCURRENCY, async (entry) => {
        const date = await readExifDate((start, length) =>
          readRange(system.http, root, entry.path, start, length, ctl.signal),
        );
        if (cancelled) return;
        if (date) dates.set(entry.path, date);
        count += 1;
        setProgress({ files, count });
      });
      if (cancelled) return;
      setFinal({
        files,
        groups: groupByDay(files.map((entry) => ({ entry, date: dates.get(entry.path) ?? modifiedDate(entry) }))),
      });
    })();
    return () => {
      cancelled = true;
      ctl.abort();
    };
  }, [enabled, root, files, system]);

  const total = files ? files.filter(isJpeg).length : 0;
  const finished = !!files && final?.files === files;
  return {
    groups: finished ? final.groups : provisional,
    reading: enabled && !!files && !finished,
    done: progress?.files === files ? progress.count : 0,
    total,
  };
}
