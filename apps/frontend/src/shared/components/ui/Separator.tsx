import { Separator as BaseSeparator } from '@base-ui/react/separator'
import { type ComponentProps } from 'react'
import { cn } from '../../../lib/cn'

type SeparatorProps = ComponentProps<typeof BaseSeparator>

export function Separator({ orientation = 'horizontal', className, ...props }: SeparatorProps) {
  return (
    <BaseSeparator
      orientation={orientation}
      className={cn(
        'bg-outline-variant',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className
      )}
      {...props}
    />
  )
}
