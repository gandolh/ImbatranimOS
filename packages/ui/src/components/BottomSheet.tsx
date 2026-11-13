import { Drawer } from "@base-ui/react/drawer";
import type { ReactElement, ReactNode, RefObject } from "react";
import { cn } from "../cn";

type BottomSheetProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Names the sheet: its heading, and the dialog's accessible name. */
  title: string;
  /** The element that opens it, such as a bar's labelled button. It is rendered through `render`, so it is the one button. */
  trigger?: ReactElement;
  /**
   * What the sheet rises from the bottom of: the app's own root element, which
   * fills its window (`relative` and `overflow-hidden`). A window ends at the
   * taskbar, so the sheet sits above it. Without one the sheet rises from the
   * screen's bottom edge, in front of the taskbar.
   */
  container?: HTMLElement | null | RefObject<HTMLElement | null>;
  children: ReactNode;
  className?: string;
};

/**
 * A bottom sheet (2026-11-13): a panel that rises from the bottom edge with
 * 18 px top corners on surface-container-low, the menu shadow, a title and a
 * close button. A swipe down, a tap outside, the close button or Esc closes
 * it. For the groups a phone's bottom bar opens (imbatranim-apps' Insert,
 * Slide, Text and Shape, PDF's Pages and Annotate).
 */
export function BottomSheet({ open, onOpenChange, title, trigger, container, children, className }: BottomSheetProps) {
  // Inside a container the layers are placed against it; on the screen, fixed.
  const place = container === undefined ? "fixed" : "absolute";
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} swipeDirection="down">
      {trigger && <Drawer.Trigger render={trigger} />}
      <Drawer.Portal container={container}>
        <Drawer.Backdrop
          className={cn(
            place,
            "bg-scrim inset-0 opacity-[calc(1-var(--drawer-swipe-progress,0))]",
            container === undefined ? "z-start" : "z-scrim",
            "data-ending-style:opacity-0 data-starting-style:opacity-0 data-swiping:duration-0",
            "motion-safe:transition-opacity motion-safe:duration-300",
          )}
        />
        <Drawer.Viewport
          className={cn(place, "inset-0 flex items-end", container === undefined ? "z-start" : "z-dialog")}
        >
          <Drawer.Popup
            className={cn(
              "border-outline-variant bg-surface-container-low text-on-surface font-ui flex max-h-[85%] w-full flex-col overflow-hidden rounded-t-[18px] border border-b-0 shadow-(--k-shadow-menu) outline-none",
              "[transform:translateY(var(--drawer-swipe-movement-y,0px))] data-swiping:select-none",
              "data-ending-style:[transform:translateY(100%)] data-starting-style:[transform:translateY(100%)]",
              "motion-safe:transition-transform motion-safe:duration-300",
              className,
            )}
          >
            <div aria-hidden className="bg-outline-variant rounded-small mx-auto mt-[8px] h-[4px] w-[40px] shrink-0" />
            <div className="flex shrink-0 items-center justify-between gap-2 py-[4px] pr-[4px] pl-[16px]">
              <Drawer.Title className="text-on-surface text-body font-semibold">{title}</Drawer.Title>
              <Drawer.Close
                aria-label="Close"
                className="text-on-surface-variant hover:bg-surface-container-high rounded-control focus-visible:ring-primary text-index flex h-[44px] w-[44px] cursor-pointer items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-inset"
              >
                ×
              </Drawer.Close>
            </div>
            <Drawer.Content className="text-body min-h-0 flex-1 overflow-y-auto px-[16px] pb-[16px]">
              {children}
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
