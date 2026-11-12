import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import type { ComponentProps, KeyboardEvent, ReactNode } from "react";
import { cn } from "../cn";
import type { DialogChangeDetails } from "./Dialog";

type PaletteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean, details: DialogChangeDetails) => void;
  /** The dialog's name for a screen reader. It is not drawn: the content brings its own header. */
  label: string;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  /** Where focus goes on open: a ref to the search field. */
  initialFocus?: ComponentProps<typeof BaseDialog.Popup>["initialFocus"];
  children: ReactNode;
  className?: string;
};

/**
 * A key-driven overlay near the top of the screen: the command palette's
 * frame. A light scrim, no title bar and no body padding; the children are the
 * whole panel. Esc that a control inside already used does not close it.
 */
export function PaletteDialog({
  open,
  onOpenChange,
  label,
  onKeyDown,
  initialFocus,
  children,
  className,
}: PaletteDialogProps) {
  return (
    <BaseDialog.Root
      open={open}
      onOpenChange={(next, details) => {
        if (!next && details.reason === "escape-key" && details.event.defaultPrevented) return;
        onOpenChange(next, details);
      }}
    >
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="bg-inverse-surface/20 z-palette-scrim fixed inset-0" />
        <BaseDialog.Popup
          initialFocus={initialFocus}
          aria-label={label}
          onKeyDown={onKeyDown}
          className={cn(
            "z-palette fixed top-[20%] left-1/2 -translate-x-1/2",
            "w-[600px] max-w-[calc(100vw-32px)]",
            "border-outline bg-surface-container-lowest rounded-window overflow-hidden border-2",
            "font-ui outline-none",
            className,
          )}
        >
          {children}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
