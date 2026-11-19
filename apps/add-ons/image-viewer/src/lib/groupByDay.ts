import type { FsEntry } from "../api/types";

/** A photo and the moment it counts as taken (Exif date, else the modified time). */
export type DatedEntry = { entry: FsEntry; date: Date };

/** One local calendar day of photos, newest first. */
export type DayGroup = {
  /** `YYYY-MM-DD` in local time: stable, sortable, usable as a React key. */
  key: string;
  /** Local midnight of the day, for formatting the heading. */
  day: Date;
  items: DatedEntry[];
};

/** `YYYY-MM-DD` of a Date in local time. */
export function dayKey(date: Date): string {
  const y = String(date.getFullYear()).padStart(4, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The entry's modified time as a Date; an unreadable stamp is the epoch, so it sorts last. */
export function modifiedDate(entry: FsEntry): Date {
  const t = Date.parse(entry.modifiedAt);
  return new Date(Number.isNaN(t) ? 0 : t);
}

/**
 * Day groups, newest day first; photos within a day newest first, equal times
 * in name order. Days are local calendar days.
 */
export function groupByDay(items: readonly DatedEntry[]): DayGroup[] {
  const sorted = [...items].sort(
    (a, b) => b.date.getTime() - a.date.getTime() || a.entry.name.localeCompare(b.entry.name),
  );
  const groups: DayGroup[] = [];
  for (const item of sorted) {
    const key = dayKey(item.date);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else {
      groups.push({
        key,
        day: new Date(item.date.getFullYear(), item.date.getMonth(), item.date.getDate()),
        items: [item],
      });
    }
  }
  return groups;
}
