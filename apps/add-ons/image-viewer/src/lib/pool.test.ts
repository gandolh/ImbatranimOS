import { describe, expect, it } from "vitest";
import { mapLimit } from "./pool";

describe("mapLimit", () => {
  it("never runs more than the limit at once and keeps result order", async () => {
    let running = 0;
    let peak = 0;
    const out = await mapLimit(
      Array.from({ length: 20 }, (_, i) => i),
      6,
      async (n) => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 5 - (n % 5)));
        running--;
        return n * 2;
      },
    );
    expect(peak).toBe(6);
    expect(out).toEqual(Array.from({ length: 20 }, (_, i) => i * 2));
  });
  it("handles an empty list", async () => {
    expect(await mapLimit([], 6, async () => 1)).toEqual([]);
  });
});
