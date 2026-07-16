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

export function Select({ label, placeholder = 'Select…', options, className, ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <BaseSelect.Label className="font-ui text-[11px] font-semibold tracking-wider text-on-surface-variant uppercase">
          {label}
        </BaseSelect.Label>
      )}
      <BaseSelect.Root {...props}>
        <BaseSelect.Trigger
          className={cn(
            'flex w-full items-center justify-between border border-outline-variant bg-surface-container-low px-2 py-1',
            'font-ui text-[12px] text-on-surface',
            'shadow-[inset_-1px_-1px_0_#747780,inset_1px_1px_0_#ffffff]',
            'cursor-pointer outline-none',
            'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
            className
          )}
        >
          <BaseSelect.Value placeholder={placeholder} />
          <BaseSelect.Icon className="ml-2 text-on-surface-variant">▾</BaseSelect.Icon>
        </BaseSelect.Trigger>

        <BaseSelect.Portal>
          <BaseSelect.Positioner sideOffset={1}>
            <BaseSelect.Popup
              className={cn(
                'z-50 min-w-[8rem] border border-outline-variant bg-surface-container-lowest',
                'shadow-[2px_2px_0_#c3c6d0]',
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
                      'font-ui text-[12px] text-on-surface',
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
