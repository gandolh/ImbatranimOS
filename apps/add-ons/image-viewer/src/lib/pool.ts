/** How many photo dates are read at once. */
export const READ_CONCURRENCY = 6;

/**
 * Runs `task` over `items` with at most `limit` in flight, keeping the order of
 * the results. A task that throws rejects the whole run: give tasks that can
 * fail their own catch.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await task(items[i] as T, i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}
