import { AppWindow } from 'lucide-react'
import { desktopSessionId } from '@imbatranim/ui'
import { api } from '../../lib/axios'
import { apiUrl } from '../marketplace/apiUrl'
import { APP_REGISTRY, type AppConfig } from '../../shared/registry/registry'
import { noteRegistryChanged } from '../../shared/registry/marketplace'
import { notify } from '../../shared/store/notificationStore'
import { LINUX_APP_PREFIX } from './kind'

/**
 * Start's Linux entries: one per `.desktop` file the user's installed Linux
 * apps ship, read by the backend. They are spliced into `APP_REGISTRY`, as
 * marketplace apps are, so Start, the palette, pinning and Settings → Apps
 * treat them like any app; opening one launches the program instead of
 * opening a window. Its windows arrive as Linux windows, whose app id is
 * the same `linux:<id>`, so they find this entry's icon.
 */

export type LinuxLauncher = { id: string; name: string; comment: string; hasIcon: boolean }

let launcherIds = new Set<string>()

export function isLinuxLauncher(appId: string): boolean {
  return launcherIds.has(appId)
}

function iconUrl(id: string): string {
  return apiUrl(`linux-apps/launchers/${encodeURIComponent(id)}/icon`).href
}

function toAppConfig(l: LinuxLauncher): AppConfig {
  const url = iconUrl(l.id)
  const Icon: AppConfig['icon'] = ({ size = 18, className }) =>
    l.hasIcon ? (
      <img src={url} width={size} height={size} alt="" className={className} draggable={false} />
    ) : (
      <AppWindow size={size} className={className} />
    )
  return {
    id: LINUX_APP_PREFIX + l.id,
    name: l.name,
    description: l.comment || 'A Linux app',
    meta: ['Linux app'],
    icon: Icon,
    // Never rendered: opening a launcher starts the program.
    component: () => null,
    multiInstance: true,
    defaultSize: { width: 800, height: 600 },
    minSize: { width: 120, height: 80 },
  }
}

/** Replace Start's Linux entries with what the profile holds now. */
export function syncLinuxLaunchers(launchers: LinuxLauncher[]): void {
  for (let i = APP_REGISTRY.length - 1; i >= 0; i--) {
    if (launcherIds.has(APP_REGISTRY[i].id)) APP_REGISTRY.splice(i, 1)
  }
  const taken = new Set(APP_REGISTRY.map((a) => a.id))
  const next = new Set<string>()
  for (const l of launchers) {
    const app = toAppConfig(l)
    if (taken.has(app.id)) continue
    APP_REGISTRY.push(app)
    next.add(app.id)
  }
  launcherIds = next
  noteRegistryChanged()
}

/** Read the launchers again: at sign-in, and after an install or removal. */
export async function reloadLinuxLaunchers(): Promise<void> {
  try {
    const { data } = await api.get<LinuxLauncher[]>('/linux-apps/launchers')
    syncLinuxLaunchers(Array.isArray(data) ? data : [])
  } catch {
    // No Linux apps on this machine, or not reachable now: Start keeps what it had.
  }
}

/** Start a launcher's program in this tab's session. */
export async function launchLinuxApp(appId: string): Promise<void> {
  const id = appId.slice(LINUX_APP_PREFIX.length)
  const name = APP_REGISTRY.find((a) => a.id === appId)?.name ?? id
  try {
    await api.post(`/linux-apps/launchers/${encodeURIComponent(id)}/launch`, {
      session: desktopSessionId(),
    })
  } catch (err) {
    const data = (err as { response?: { data?: { message?: unknown } } }).response?.data
    notify({
      title: `${name} didn't start`,
      body: typeof data?.message === 'string' ? data.message : 'The request failed.',
      level: 'error',
    })
  }
}
