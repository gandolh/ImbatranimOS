// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

const post = vi.fn(() => Promise.resolve({ data: { pid: 1 } }))
vi.mock('../../lib/axios', () => ({ api: { post, get: vi.fn() } }))

const { syncLinuxLaunchers, isLinuxLauncher } = await import('./launchers')
const { APP_REGISTRY } = await import('../../shared/registry/registry')
const { openApp } = await import('../../shared/intents/openApp')
const { useWindowStore } = await import('../../shared/store/windowStore')

describe("Start's Linux entries", () => {
  afterEach(() => {
    syncLinuxLaunchers([])
    post.mockClear()
  })

  it('join the app registry under linux:<id>, and leave it again', () => {
    const before = APP_REGISTRY.length
    syncLinuxLaunchers([{ id: 'firefox', name: 'Firefox', comment: 'Web browser', hasIcon: true }])
    expect(APP_REGISTRY.length).toBe(before + 1)
    expect(APP_REGISTRY.find((a) => a.id === 'linux:firefox')).toMatchObject({ name: 'Firefox' })
    expect(isLinuxLauncher('linux:firefox')).toBe(true)
    syncLinuxLaunchers([])
    expect(APP_REGISTRY.length).toBe(before)
    expect(isLinuxLauncher('linux:firefox')).toBe(false)
  })

  it("start the program in this tab's session instead of opening a window", () => {
    syncLinuxLaunchers([{ id: 'gimp', name: 'GIMP', comment: '', hasIcon: false }])
    const windows = useWindowStore.getState().windows.length
    expect(openApp('linux:gimp')).toBe('')
    expect(useWindowStore.getState().windows.length).toBe(windows)
    expect(post).toHaveBeenCalledWith(
      '/linux-apps/launchers/gimp/launch',
      expect.objectContaining({ session: expect.any(String) })
    )
  })
})
