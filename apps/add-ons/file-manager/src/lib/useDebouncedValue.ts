import { useEffect, useState } from 'react'

/**
 * Returns `value`, but only after it has settled for `delayMs` without
 * changing. Used to keep rapid selection changes (e.g. holding an arrow key)
 * from firing a preview fetch per intermediate selection.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(id)
  }, [value, delayMs])

  return debounced
}
