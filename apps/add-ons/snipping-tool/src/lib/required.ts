/**
 * Returns `value`, or throws when it is missing. The checked form of a `!` where a missing value is a bug and not a
 * case to handle: it fails loudly at the line that broke, and the compiler sees the narrowed type after it.
 */
export function required<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`${what} is missing`);
  return value;
}
