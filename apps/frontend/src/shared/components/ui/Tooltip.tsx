import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip'
import { type ReactNode } from 'react'
import { cn } from '../../../lib/cn'

type TooltipProps = {
  content: ReactNode
  children: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
}

export function Tooltip({ content, children, side = 'top' }: TooltipProps) {
  return (
    <BaseTooltip.Provider delay={400}>
      <BaseTooltip.Root>
        <BaseTooltip.Trigger>{children}</BaseTooltip.Trigger>
        <BaseTooltip.Portal>
          <BaseTooltip.Positioner side={side} sideOffset={4}>
            <BaseTooltip.Popup
              className={cn(
                'border border-outline-variant bg-inverse-surface px-2 py-1',
                'font-ui text-[11px] text-inverse-on-surface',
                'shadow-[1px_1px_0_#747780]'
              )}
            >
              {content}
            </BaseTooltip.Popup>
          </BaseTooltip.Positioner>
        </BaseTooltip.Portal>
      </BaseTooltip.Root>
    </BaseTooltip.Provider>
  )
}
