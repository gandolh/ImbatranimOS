import { useEffect, useMemo, useState } from "react";
import type { SystemHandle } from "@imbatranim/ui";
import { readRange } from "../api/readRange";
import type { FsEntry } from "../api/types";
import { readExif } from "./exifDate";
import { groupByDay, modifiedDate, type DayGroup } from "./groupByDay";
import { READ_CONCURRENCY, mapLimit } from "./pool";

/** A photo's embedded preview, ready for an `<img>`. */
export type Preview = { url: string; orientation: number };

export type FolderDates = {
  /** Grouped by modified time while the dates are read, by capture date once every one is in. */
  groups: DayGroup[];
  /** Dates still being read. */
  reading: boolean;
  /** JPEGs whose date has come in, and how many there are to read. */
  done: number;
  total: number;
  /**
   * Each JPEG read so far: its embedded preview (an object URL, alive while the folder is), or null when it has
   * none and the tile shows the file itself. A JPEG not in it has not been read yet.
   */
  previews: ReadonlyMap<string, Preview | null>;
};

const NO_PREVIEWS: ReadonlyMap<string, Preview | null> = new Map();

export const isJpeg = (name: string) => /\.jpe?g$/i.test(name);

/**
 * Works out the day groups of a folder's photos once `enabled`. JPEGs are read for their Exif date and embedded
 * preview (the first bytes only, six at a time, in the order the grid shows them while it waits); every other
 * format, and a JPEG without a date, counts at its modified time. The groups change exactly once: from the
 * modified-time grouping to the final one. Only the progress count and the previews move in between.
 */
export function useFolderDates(
  system: SystemHandle,
  root: string | null,
  files: FsEntry[] | null,
  enabled: boolean,
): FolderDates {
  const [final, setFinal] = useState<{ files: FsEntry[]; groups: DayGroup[] } | null>(null);
  const [progress, setProgress] = useState<{
    files: FsEntry[];
    count: number;
    previews: ReadonlyMap<string, Preview | null>;
  } | null>(null);

  const provisional = useMemo(
    () => groupByDay((files ?? []).map((entry) => ({ entry, date: modifiedDate(entry) }))),
    [files],
  );

  useEffect(() => {
    if (!enabled || !root || !files) return;
    // The provisional grid's order, so the tiles on screen first get their previews first.
    const jpegs = provisional.flatMap((g) => g.items.map((i) => i.entry)).filter((e) => isJpeg(e.name));
    const ctl = new AbortController();
    let cancelled = false;
    let count = 0;
    const previews = new Map<string, Preview | null>();
    void (async () => {
      const dates = new Map<string, Date>();
      await mapLimit(jpegs, READ_CONCURRENCY, async (entry) => {
        const read = await readExif((start, length) =>
          readRange(system.http, root, entry.path, start, length, ctl.signal),
        );
        if (cancelled) return;
        if (read.date) dates.set(entry.path, read.date);
        const thumb = read.thumbnail;
        previews.set(
          entry.path,
          thumb
            ? {
                // A copy: the bytes are a view into the whole read, which the Blob need not keep.
                url: URL.createObjectURL(new Blob([thumb.bytes.slice()], { type: "image/jpeg" })),
                orientation: thumb.orientation,
              }
            : null,
        );
        count += 1;
        setProgress({ files, count, previews: new Map(previews) });
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
      for (const preview of previews.values()) if (preview) URL.revokeObjectURL(preview.url);
    };
  }, [enabled, root, files, provisional, system]);

  const total = files ? files.filter((e) => isJpeg(e.name)).length : 0;
  const finished = !!files && final?.files === files;
  const current = progress?.files === files ? progress : null;
  return {
    groups: finished ? final.groups : provisional,
    reading: enabled && !!files && !finished,
    done: current?.count ?? 0,
    total,
    previews: current?.previews ?? NO_PREVIEWS,
  };
}
