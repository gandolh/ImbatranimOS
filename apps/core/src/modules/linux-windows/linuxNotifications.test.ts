// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWindowStore } from '../../shared/store/windowStore'
import { activateNotification } from '../../shared/components/notifications/activation'
import { useNotificationStore } from '../../shared/store/notificationStore'
import { LinuxNotifications, notifyAppStopped } from './linuxNotifications'

const store = () => useNotificationStore.getState()

let sent: object[]
let bridge: LinuxNotifications

beforeEach(() => {
  bridge?.dispose()
  useNotificationStore.setState({ notifications: [], toasts: [] })
  sent = []
  bridge = new LinuxNotifications((m) => sent.push(m))
})

describe("a Linux app's notifications", () => {
  it("show as OS notifications under the app's name", () => {
    bridge.show({ id: 1, app: 'Firefox', summary: 'Hi', body: 'from a page' })
    expect(store().notifications).toMatchObject([
      { title: 'Firefox: Hi', body: 'from a page', level: 'info' },
    ])
    expect(store().toasts).toHaveLength(1)
    bridge.show({ id: 2, app: '', summary: 'No name', body: '' })
    expect(store().notifications[0]).toMatchObject({ title: 'No name', body: undefined })
  })

  it('replace the one they update, without telling the app it closed', () => {
    bridge.show({ id: 1, app: 'App', summary: 'Downloading', body: '10%' })
    bridge.show({ id: 1, app: 'App', summary: 'Downloading', body: '90%' })
    expect(store().notifications.map((n) => n.body)).toEqual(['90%'])
    expect(sent).toEqual([])
  })

  it('tell the app when the owner closes one, once', () => {
    bridge.show({ id: 7, app: 'App', summary: 'S', body: '' })
    const osId = store().notifications[0].id
    store().dismissToast(osId)
    expect(sent).toEqual([])
    store().remove(osId)
    store().clearAll()
    expect(sent).toEqual([{ type: 'notification_closed', id: 7 }])
  })

  it('go when the app closes them, and that tells nobody', () => {
    bridge.show({ id: 3, app: 'App', summary: 'S', body: '' })
    bridge.close(3)
    bridge.close(3)
    expect(store().notifications).toEqual([])
    expect(sent).toEqual([])
  })

  it("stay quiet about a past session's when a new one starts", () => {
    bridge.show({ id: 1, app: 'App', summary: 'S', body: '' })
    bridge.forget()
    store().clearAll()
    expect(sent).toEqual([])
  })
})

describe('a click on a notification', () => {
  const win = (id: string, appId: string, isVisible = true) => ({ id, appId, isVisible })
  let focusWindow: ReturnType<typeof vi.fn>
  let showWindow: ReturnType<typeof vi.fn>

  beforeEach(() => {
    focusWindow = vi.fn()
    showWindow = vi.fn()
    useWindowStore.setState({ windows: [], focusWindow, showWindow } as never)
  })

  const click = () => activateNotification(store().notifications[0])

  it("runs the default action and raises the app's only window", () => {
    useWindowStore.setState({
      windows: [win('w1', 'linux:firefox', false), win('w2', 'linux:foot')],
    } as never)
    bridge.show({ id: 4, app: 'Firefox', summary: 'Hi', body: '', hasDefault: true })
    expect(store().notifications[0].source).toEqual({ kind: 'linux', id: 4 })
    expect(click()).toBe(true)
    expect(sent).toEqual([{ type: 'notification_action', id: 4, key: 'default' }])
    expect(focusWindow).toHaveBeenCalledWith('w1')
    expect(showWindow).toHaveBeenCalledWith('w1')
    // The app answers by closing it, so the tab says nothing more, and a
    // second click does nothing.
    const item = store().notifications[0]
    store().remove(item.id)
    expect(activateNotification(item)).toBe(true)
    expect(sent).toHaveLength(1)
  })

  it('leaves focus alone with no window or several for the app', () => {
    bridge.show({ id: 1, app: 'Firefox', summary: 'A', body: '', hasDefault: true })
    click()
    expect(focusWindow).not.toHaveBeenCalled()
    useWindowStore.setState({
      windows: [win('w1', 'linux:firefox'), win('w2', 'linux:firefox')],
    } as never)
    bridge.show({ id: 2, app: 'Firefox', summary: 'B', body: '', hasDefault: true })
    click()
    expect(sent).toHaveLength(2)
    expect(focusWindow).not.toHaveBeenCalled()
  })

  it('is not offered for a notification without a default action', () => {
    bridge.show({ id: 1, app: 'App', summary: 'S', body: '' })
    expect(store().notifications[0].source).toBeUndefined()
    expect(click()).toBe(false)
    expect(sent).toEqual([])
  })

  it("does nothing for an earlier session's notification", () => {
    bridge.show({ id: 1, app: 'App', summary: 'S', body: '', hasDefault: true })
    bridge.forget()
    expect(click()).toBe(true)
    expect(sent).toEqual([])
  })
})

describe('an app stopped for memory', () => {
  it('leaves one warning naming it', () => {
    notifyAppStopped('Firefox')
    expect(store().notifications).toMatchObject([
      {
        title: 'Firefox was stopped',
        body: 'The machine ran out of memory. Your other apps and the desktop are still running.',
        level: 'warning',
      },
    ])
  })
})
