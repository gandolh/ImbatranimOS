import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { type ReactNode } from 'react'
import { cn } from '../../../lib/cn'

type DialogProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: ReactNode
  title?: string
  description?: string
  children: ReactNode
  className?: string
}

export function Dialog({ open, onOpenChange, trigger, title, description, children, className }: DialogProps) {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <BaseDialog.Trigger>{trigger}</BaseDialog.Trigger>}
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 bg-inverse-surface/30" />
        <BaseDialog.Popup
          className={cn(
            'fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
            'min-w-[320px] border border-outline-variant bg-surface-container-lowest',
            'shadow-[4px_4px_0_#c3c6d0]',
            'outline-none',
            className
          )}
        >
          {title && (
            <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-high px-3 py-1.5">
              <BaseDialog.Title className="font-ui text-[13px] font-semibold text-on-surface">
                {title}
              </BaseDialog.Title>
              <BaseDialog.Close className="flex h-4 w-4 cursor-pointer items-center justify-center border border-outline-variant bg-surface-container-low font-ui text-[11px] text-on-surface hover:bg-[#f4f1ee]">
                ×
              </BaseDialog.Close>
            </div>
          )}
          <div className="p-3 font-content text-[13px] text-on-surface">
            {description && (
              <BaseDialog.Description className="mb-3 text-on-surface-variant">
                {description}
              </BaseDialog.Description>
            )}
            {children}
          </div>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}
