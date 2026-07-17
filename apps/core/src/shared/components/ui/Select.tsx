import { Select as BaseSelect } from '@base-ui/react/select'
import { type ComponentProps } from 'react'
import { cn } from '../../../lib/cn'

type SelectRootProps = ComponentProps<typeof BaseSelect.Root>

type SelectOption = {
  value: string
  label: string
}

type SelectProps = Omit<SelectRootProps, 'className'> & {
  label?: string
  placeholder?: string
  options: SelectOption[]
  className?: string
}

export function Select({
  label,
  placeholder = 'Select…',
  options,
  className,
  ...props
}: SelectProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <BaseSelect.Label className="font-ui text-on-surface-variant text-[11px] font-semibold tracking-wider uppercase">
          {label}
        </BaseSelect.Label>
      )}
      <BaseSelect.Root {...props}>
        <BaseSelect.Trigger
          className={cn(
            'border-outline-variant bg-surface-container-low flex w-full items-center justify-between border px-2.5 py-1.5',
            'font-ui text-on-surface text-[12px]',
            'hover:bg-surface-container-high cursor-pointer transition-colors outline-none',
            'focus-visible:ring-primary focus-visible:ring-2 focus-visible:ring-inset',
            'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
            className
          )}
        >
          <BaseSelect.Value placeholder={placeholder} />
          <BaseSelect.Icon className="text-on-surface-variant ml-2">▾</BaseSelect.Icon>
        </BaseSelect.Trigger>

        <BaseSelect.Portal>
          <BaseSelect.Positioner sideOffset={1}>
            <BaseSelect.Popup
              className={cn(
                'border-outline-variant bg-surface-container-lowest z-50 min-w-[8rem] border',
                'shadow-[0_10px_28px_rgba(0,0,0,0.4)]',
                'py-0.5 outline-none'
              )}
            >
              <BaseSelect.List>
                {options.map((opt) => (
                  <BaseSelect.Item
                    key={opt.value}
                    value={opt.value}
                    className={cn(
                      'flex cursor-pointer items-center px-2 py-1',
                      'font-ui text-on-surface text-[12px]',
                      'outline-none',
                      'data-[highlighted]:bg-primary-container data-[highlighted]:text-on-primary-container',
                      'data-[selected]:bg-primary-container data-[selected]:text-on-primary-container'
                    )}
                  >
                    <BaseSelect.ItemText>{opt.label}</BaseSelect.ItemText>
                  </BaseSelect.Item>
                ))}
              </BaseSelect.List>
            </BaseSelect.Popup>
          </BaseSelect.Positioner>
        </BaseSelect.Portal>
      </BaseSelect.Root>
    </div>
  )
}
