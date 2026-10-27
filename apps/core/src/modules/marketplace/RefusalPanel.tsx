import { Ban, Settings } from 'lucide-react'
import { Button } from '@imbatranim/ui'
import { openApp } from '../../shared/intents/openApp'

/**
 * What a window shows instead of a marketplace app that cannot run on this
 * desktop (brief 175): built for another shared kit, or for a newer system
 * protocol. Nothing broke, so it is not the crash fallback: no "stopped
 * working", no toast, no client-error log. The sentence from `refusals.ts` is
 * the body, word for word.
 *
 * The button opens Settings, where the Marketplace section can install the
 * build this desktop needs. Settings has no deep link to a section or a row,
 * so it opens at the top.
 */
export function RefusalPanel({ appName, reason }: { appName: string; reason: string }) {
  return (
    <div
      data-refusal=""
      className="bg-surface text-on-surface flex h-full flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <Ban size={26} strokeWidth={1.75} className="text-on-surface-variant" />
      <div>
        <p className="text-[13px] font-semibold">{`Can't open ${appName}`}</p>
        <p className="text-on-surface-variant mt-1 max-w-sm text-[12px]">{reason}</p>
      </div>
      <Button
        variant="primary"
        size="sm"
        className="gap-1"
        onClick={(e) => {
          // Not to the window root: its click raises this window again, over
          // the Settings window just brought up.
          e.stopPropagation()
          openApp('settings')
        }}
      >
        <Settings size={12} strokeWidth={2} />
        Open Settings
      </Button>
    </div>
  )
}
