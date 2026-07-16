import { Input as BaseInput } from '@base-ui/react/input'
import { type ComponentProps } from 'react'
import { cn } from '../../../lib/cn'

type InputProps = ComponentProps<typeof BaseInput> & {
  label?: string
}

export function Input({ label, className, id, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label
          htmlFor={id}
          className="font-ui text-[11px] font-semibold tracking-wider text-on-surface-variant uppercase"
        >
          {label}
        </label>
      )}
      <BaseInput
        id={id}
        className={cn(
          'w-full border border-outline-variant bg-surface-container-lowest px-2 py-1',
          'font-content text-[13px] text-on-surface',
          'shadow-[inset_1px_1px_0_#c3c6d0,inset_-1px_-1px_0_#ffffff]',
          'outline-none',
          'placeholder:text-on-surface-variant',
          'data-[focused]:border-primary data-[focused]:shadow-[inset_1px_1px_0_#405f8e,inset_-1px_-1px_0_#ffffff]',
          'data-[invalid]:border-error',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        {...props}
      />
    </div>
  )
}
