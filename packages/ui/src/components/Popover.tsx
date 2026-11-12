import { Popover as BasePopover } from "@base-ui/react/popover";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { cn } from "../cn";

type PopupProps = ComponentProps<typeof BasePopover.Popup>;

type PopoverProps = {
  /** The element that opens it, such as `<button …>icon</button>`. It is rendered through `render`, so it is the one button. */
  trigger: ReactElement;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  /** Where focus goes on open: a ref, or false for none. The default is the popup's first tabbable. */
  initialFocus?: PopupProps["initialFocus"];
  /** The popup's accessible name, when its content does not give one. */
  label?: string;
  className?: string;
};

/**
 * A popover: a small panel anchored to its trigger, portalled, drawn above the
 * windows (`z-popover`). Esc and an outside press close it.
 */
export function Popover({
  trigger,
  children,
  open,
  onOpenChange,
  side = "top",
  align = "end",
  sideOffset = 6,
  initialFocus,
  label,
  className,
}: PopoverProps) {
  return (
    <BasePopover.Root open={open} onOpenChange={onOpenChange}>
      <BasePopover.Trigger render={trigger} />
      <BasePopover.Portal>
        <BasePopover.Positioner side={side} align={align} sideOffset={sideOffset} className="z-popover">
          <BasePopover.Popup
            initialFocus={initialFocus}
            aria-label={label}
            className={cn(
              "border-outline-variant bg-surface-container-low rounded-menu overflow-hidden border shadow-(--k-shadow-tray)",
              "outline-none",
              className,
            )}
          >
            {children}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}
