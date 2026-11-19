import { describe, expect, it } from "vitest";
import type { FsEntry } from "../api/types";
import { dayKey, groupByDay, modifiedDate, type DatedEntry } from "./groupByDay";

function photo(name: string, date: Date): DatedEntry {
  const entry: FsEntry = { name, path: `p/${name}`, type: "file", size: 1, modifiedAt: date.toISOString() };
  return { entry, date };
}
const at = (y: number, mo: number, d: number, h = 12, mi = 0, s = 0) => new Date(y, mo - 1, d, h, mi, s);

describe("groupByDay", () => {
  it("is empty for an empty folder", () => {
    expect(groupByDay([])).toEqual([]);
  });

  it("groups a mixed folder into days, newest day first and newest photo first", () => {
    const groups = groupByDay([
      photo("a.jpg", at(2023, 12, 31, 9)),
      photo("b.jpg", at(2024, 3, 9, 8)),
      photo("c.jpg", at(2024, 3, 9, 18)),
      photo("d.png", at(2024, 3, 10, 1)),
      photo("e.jpg", at(2024, 3, 9, 13)),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["2024-03-10", "2024-03-09", "2023-12-31"]);
    expect(groups.map((g) => g.items.map((i) => i.entry.name))).toEqual([
      ["d.png"],
      ["c.jpg", "e.jpg", "b.jpg"],
      ["a.jpg"],
    ]);
    expect(groups[1]!.day).toEqual(at(2024, 3, 9, 0));
  });

  it("splits at local midnight: 23:59:59 and 00:00:00 are different days", () => {
    const groups = groupByDay([
      photo("late.jpg", at(2024, 3, 9, 23, 59, 59)),
      photo("early.jpg", at(2024, 3, 10, 0, 0, 0)),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["2024-03-10", "2024-03-09"]);
  });

  it("keeps equal times in name order", () => {
    const t = at(2024, 3, 9, 10);
    const groups = groupByDay([photo("c.jpg", t), photo("a.jpg", t), photo("b.jpg", t)]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.items.map((i) => i.entry.name)).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
  });

  it("does not change its input", () => {
    const input = [photo("b.jpg", at(2024, 1, 1)), photo("a.jpg", at(2024, 1, 2))];
    groupByDay(input);
    expect(input.map((i) => i.entry.name)).toEqual(["b.jpg", "a.jpg"]);
  });
});

describe("dayKey and modifiedDate", () => {
  it("pads the key", () => {
    expect(dayKey(at(2024, 1, 5))).toBe("2024-01-05");
  });
  it("reads the modified stamp, and falls back to the epoch for junk", () => {
    expect(modifiedDate(photo("a.jpg", at(2024, 1, 5)).entry)).toEqual(at(2024, 1, 5));
    expect(modifiedDate({ ...photo("a.jpg", at(2024, 1, 5)).entry, modifiedAt: "nope" }).getTime()).toBe(0);
  });
});
