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
          className="flex w-2 touch-none border-l border-outline-variant bg-surface-container p-px"
        >
          <BaseScrollArea.Thumb className="w-full bg-outline-variant hover:bg-outline" />
        </BaseScrollArea.Scrollbar>
      )}

      {(orientation === 'horizontal' || orientation === 'both') && (
        <BaseScrollArea.Scrollbar
          orientation="horizontal"
          className="flex h-2 touch-none border-t border-outline-variant bg-surface-container p-px"
        >
          <BaseScrollArea.Thumb className="h-full bg-outline-variant hover:bg-outline" />
        </BaseScrollArea.Scrollbar>
      )}

      {orientation === 'both' && (
        <BaseScrollArea.Corner className="bg-surface-container" />
      )}
    </BaseScrollArea.Root>
  )
}
