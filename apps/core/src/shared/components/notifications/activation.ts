import type { NotificationItem } from '../../store/notificationStore'

/**
 * What a click on a notification does when it isn't "open the raising app".
 * A notification's `source` names who made it; the module that owns that
 * kind registers a handler here, so the store keeps plain data and the
 * toast and the panel row need no knowledge of the kinds.
 */

type Activation = (item: NotificationItem) => void

const handlers = new Map<string, Activation>()

/** Register the handler for one kind of source; returns how to take it off. */
export function registerNotificationActivation(kind: string, fn: Activation): () => void {
  handlers.set(kind, fn)
  return () => {
    if (handlers.get(kind) === fn) handlers.delete(kind)
  }
}

/** Run the handler for this item's source; false when it has none (or no handler). */
export function activateNotification(item: NotificationItem): boolean {
  const handler = item.source ? handlers.get(item.source.kind) : undefined
  if (!handler) return false
  handler(item)
  return true
}
