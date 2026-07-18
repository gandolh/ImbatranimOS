import { useState } from 'react'
import { Clock4, Timer as TimerIcon, AlarmClock, Hourglass } from 'lucide-react'
import { cn } from '@imbatranim/core'
import { ClockTab } from './tabs/ClockTab'
import { Stopwatch } from './tabs/Stopwatch'
import { Timer } from './tabs/Timer'
import { Alarms } from './tabs/Alarms'
import { useClockNotifications } from './useClockNotifications'

type Tab = 'clock' | 'stopwatch' | 'timer' | 'alarms'

const TAB_LABEL: Record<Tab, string> = {
  clock: 'Clock',
  stopwatch: 'Stopwatch',
  timer: 'Timer',
  alarms: 'Alarms',
}

function TabIcon({ tab, active }: { tab: Tab; active: boolean }) {
  const size = 12
  const className = active ? 'text-on-primary' : 'text-on-surface-variant'
  switch (tab) {
    case 'clock':
      return <Clock4 size={size} className={className} />
    case 'stopwatch':
      return <Hourglass size={size} className={className} />
    case 'timer':
      return <TimerIcon size={size} className={className} />
    case 'alarms':
      return <AlarmClock size={size} className={className} />
  }
}

// Window contract: ComponentType<{ windowId: string }>. Single-instance app —
// windowId is unused (no per-window state to key on).
export function Clock({ windowId: _windowId }: { windowId: string }) {
  const [tab, setTab] = useState<Tab>('clock')

  // Mounted at the root so alarms/timers keep firing across tab switches —
  // cleared automatically on unmount (window close).
  useClockNotifications()

  const tabs: Tab[] = ['clock', 'stopwatch', 'timer', 'alarms']

  return (
    <div className="bg-surface-container-lowest flex h-full flex-col select-none">
      <div className="border-outline-variant bg-surface-container-low flex items-center gap-0.5 border-b px-1 py-1">
        {tabs.map((t) => {
          const active = tab === t
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                'font-ui flex items-center gap-1.5 border px-2.5 py-1 text-[11px] font-semibold tracking-wider uppercase transition-colors',
                active
                  ? 'border-primary bg-primary text-on-primary'
                  : 'text-on-surface-variant hover:border-outline-variant hover:text-on-surface border-transparent'
              )}
            >
              <TabIcon tab={t} active={active} />
              {TAB_LABEL[t]}
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-auto">
        {tab === 'clock' && <ClockTab />}
        {tab === 'stopwatch' && <Stopwatch />}
        {tab === 'timer' && <Timer />}
        {tab === 'alarms' && <Alarms />}
      </div>
    </div>
  )
}
