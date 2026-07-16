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
    'shadow-[inset_-1px_-1px_0_#747780,inset_1px_1px_0_#ffffff] ' +
    'hover:bg-[#f4f1ee] active:shadow-[inset_1px_1px_0_#747780,inset_-1px_-1px_0_#ffffff] active:translate-x-px active:translate-y-px',
  primary:
    'bg-primary border-primary text-on-primary ' +
    'shadow-[inset_-1px_-1px_0_#264774,inset_1px_1px_0_#7b9acc] ' +
    'hover:brightness-105 active:shadow-[inset_1px_1px_0_#264774,inset_-1px_-1px_0_#7b9acc] active:translate-x-px active:translate-y-px',
  ghost:
    'bg-transparent border-transparent text-on-surface hover:bg-surface-container hover:border-outline-variant',
  destructive:
    'bg-surface-container-low border-error text-error ' +
    'shadow-[inset_-1px_-1px_0_#747780,inset_1px_1px_0_#ffffff] ' +
    'hover:bg-error-container active:translate-x-px active:translate-y-px',
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
