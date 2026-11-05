// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
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
