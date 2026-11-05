import { useNotificationStore } from '../../shared/store/notificationStore'

/**
 * A Linux app's notifications, arriving over the session's bus
 * (org.freedesktop.Notifications, answered by the backend), shown as
 * ordinary OS notifications. Closing one in the OS (removing it from the
 * notification centre) tells the app; the app closing one takes it off.
 */

export type LinuxNotification = { id: number; app: string; summary: string; body: string }

type Send = (message: object) => void

export class LinuxNotifications {
  /** The bus's id → the OS notification showing it. */
  private readonly shown = new Map<number, string>()
  /** OS notifications taken down by the app, whose removal tells nobody. */
  private readonly quiet = new Set<string>()
  private readonly send: Send
  private readonly unsubscribe: () => void

  constructor(send: Send) {
    this.send = send
    this.unsubscribe = useNotificationStore.subscribe((state) =>
      this.noticeRemovals(state.notifications)
    )
  }

  /** Show one, or replace the one it updates. */
  show(n: LinuxNotification): void {
    const previous = this.shown.get(n.id)
    if (previous) this.takeDown(previous)
    const summary = n.summary.trim()
    const app = n.app.trim()
    const title = app && summary ? `${app}: ${summary}` : summary || app || 'Linux app'
    const osId = useNotificationStore.getState().notify({
      title,
      body: n.body.trim() || undefined,
      level: 'info',
    })
    this.shown.set(n.id, osId)
  }

  /** The app closed it. */
  close(id: number): void {
    const osId = this.shown.get(id)
    if (!osId) return
    this.shown.delete(id)
    this.takeDown(osId)
  }

  /** A new session: the old one's notifications can't be told anything. */
  forget(): void {
    this.shown.clear()
    this.quiet.clear()
  }

  dispose(): void {
    this.unsubscribe()
  }

  private takeDown(osId: string): void {
    this.quiet.add(osId)
    useNotificationStore.getState().remove(osId)
  }

  private noticeRemovals(notifications: readonly { id: string }[]): void {
    if (this.shown.size === 0 && this.quiet.size === 0) return
    const present = new Set(notifications.map((n) => n.id))
    for (const [busId, osId] of this.shown) {
      if (present.has(osId)) continue
      this.shown.delete(busId)
      if (!this.quiet.delete(osId)) this.send({ type: 'notification_closed', id: busId })
    }
    for (const osId of this.quiet) if (!present.has(osId)) this.quiet.delete(osId)
  }
}

/**
 * The kernel killed a Linux app because the machine ran out of memory (the
 * container's cap on the VPS): its windows have closed, and this says why.
 */
export function notifyAppStopped(app: string): void {
  useNotificationStore.getState().notify({
    title: `${app.trim() || 'A Linux app'} was stopped`,
    body: 'The machine ran out of memory. Your other apps and the desktop are still running.',
    level: 'warning',
  })
}
