import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox'
import { type ComponentProps } from 'react'
import { cn } from '../../../lib/cn'

type CheckboxProps = ComponentProps<typeof BaseCheckbox.Root> & {
  label?: string
}

export function Checkbox({ label, className, id, ...props }: CheckboxProps) {
  return (
    <label className="flex cursor-pointer items-center gap-2 font-content text-[13px] text-on-surface select-none">
      <BaseCheckbox.Root
        id={id}
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center border border-outline-variant bg-surface-container-lowest',
          'shadow-[inset_1px_1px_0_#c3c6d0,inset_-1px_-1px_0_#ffffff]',
          'outline-none',
          'data-[checked]:border-primary data-[checked]:bg-primary',
          'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
          className
        )}
        {...props}
      >
        <BaseCheckbox.Indicator className="flex items-center justify-center text-on-primary">
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
          </svg>
        </BaseCheckbox.Indicator>
      </BaseCheckbox.Root>
      {label && <span>{label}</span>}
    </label>
  )
}
