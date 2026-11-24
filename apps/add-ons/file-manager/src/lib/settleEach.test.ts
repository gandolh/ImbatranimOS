import { describe, expect, it } from "vitest";
import { settleEach } from "./settleEach";

describe("settleEach", () => {
  it("settles every item in order, never more than the limit at once", async () => {
    let running = 0;
    let most = 0;
    const results = await settleEach([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running++;
      most = Math.max(most, running);
      // Later items finish first, so the order of the results is the items', not the finishing order.
      await new Promise((r) => setTimeout(r, 10 - n));
      running--;
      if (n === 4) throw new Error("four");
      return n * 10;
    });
    expect(most).toBe(3);
    expect(results.map((r) => (r.status === "fulfilled" ? r.value : (r.reason as Error).message))).toEqual([
      10,
      20,
      30,
      "four",
      50,
      60,
      70,
    ]);
  });

  it("returns nothing for no items", async () => {
    expect(await settleEach([], 4, async () => 1)).toEqual([]);
  });
});
