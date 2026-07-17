import { ScrollArea as BaseScrollArea } from '@base-ui/react/scroll-area'
import { type ReactNode } from 'react'
import { cn } from '../../../lib/cn'

type ScrollAreaProps = {
  children: ReactNode
  className?: string
  orientation?: 'vertical' | 'horizontal' | 'both'
}

export function ScrollArea({ children, className, orientation = 'vertical' }: ScrollAreaProps) {
  return (
    <BaseScrollArea.Root className={cn('overflow-hidden', className)}>
      <BaseScrollArea.Viewport className="h-full w-full">
        <BaseScrollArea.Content>{children}</BaseScrollArea.Content>
      </BaseScrollArea.Viewport>

      {(orientation === 'vertical' || orientation === 'both') && (
        <BaseScrollArea.Scrollbar
          orientation="vertical"
          className="border-outline-variant bg-surface-container flex w-2 touch-none border-l p-px"
        >
          <BaseScrollArea.Thumb className="bg-outline-variant hover:bg-outline w-full" />
        </BaseScrollArea.Scrollbar>
      )}

      {(orientation === 'horizontal' || orientation === 'both') && (
        <BaseScrollArea.Scrollbar
          orientation="horizontal"
          className="border-outline-variant bg-surface-container flex h-2 touch-none border-t p-px"
        >
          <BaseScrollArea.Thumb className="bg-outline-variant hover:bg-outline h-full" />
        </BaseScrollArea.Scrollbar>
      )}

      {orientation === 'both' && <BaseScrollArea.Corner className="bg-surface-container" />}
    </BaseScrollArea.Root>
  )
}
