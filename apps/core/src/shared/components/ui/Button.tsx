import { Button as BaseButton } from '@base-ui/react/button'
import { type ComponentProps } from 'react'
import { cn } from '../../../lib/cn'

type Variant = 'default' | 'primary' | 'ghost' | 'destructive'
type Size = 'sm' | 'md'

type ButtonProps = Omit<ComponentProps<typeof BaseButton>, 'variant' | 'size'> & {
  variant?: Variant
  size?: Size
}

const variantClasses: Record<Variant, string> = {
  default:
    'bg-surface-container-low border-outline-variant text-on-surface ' +
    'hover:bg-surface-container-high active:bg-surface-container ' +
    'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
  primary:
    'bg-primary border-primary text-on-primary ' +
    'hover:brightness-110 active:brightness-95 ' +
    'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-surface',
  ghost:
    'bg-transparent border-transparent text-on-surface hover:bg-surface-container hover:border-outline-variant',
  destructive:
    'bg-transparent border-error text-error ' +
    'hover:bg-error hover:text-on-error active:brightness-95 ' +
    'focus-visible:ring-2 focus-visible:ring-error focus-visible:ring-inset',
}

const sizeClasses: Record<Size, string> = {
  sm: 'px-2 py-1 text-[11px]',
  md: 'px-3 py-1.5 text-[12px]',
}

export function Button({ variant = 'default', size = 'md', className, ...props }: ButtonProps) {
  return (
    <BaseButton
      className={cn(
        'inline-flex cursor-pointer items-center gap-1.5 border font-ui font-medium',
        'select-none outline-none transition-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    />
  )
}
