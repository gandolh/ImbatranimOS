/**
 * Runs `fn` on each item, at most `limit` at a time, and settles each one as `Promise.allSettled` does, in the
 * items' order. Started all at once, a Select All and Delete of 2,000 files had Chromium refuse 298 to 417 of its
 * requests (`net::ERR_INSUFFICIENT_RESOURCES`), which the File Manager reported as files it could not delete
 * (2026-11-24).
 */
export async function settleEach<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = [];
  // One iterator shared by the workers: each takes the next item when its last one settles.
  const queue = items.entries();
  const worker = async () => {
    for (const [i, item] of queue) {
      try {
        out[i] = { status: "fulfilled", value: await fn(item) };
      } catch (reason: unknown) {
        out[i] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
