import { ScrollArea as BaseScrollArea } from "@base-ui/react/scroll-area";
import type { ReactNode, Ref } from "react";
import { cn } from "../cn";

type ScrollAreaProps = {
  children: ReactNode;
  className?: string;
  orientation?: "vertical" | "horizontal" | "both";
  /**
   * Ref to the scrolling viewport element. Needed by consumers that virtualize
   * their content (the virtualizer reads scrollTop/height off this node) so
   * they don't have to reach for the library's internal DOM attributes.
   */
  viewportRef?: Ref<HTMLDivElement>;
};

export function ScrollArea({ children, className, orientation = "vertical", viewportRef }: ScrollAreaProps) {
  return (
    <BaseScrollArea.Root className={cn("overflow-hidden", className)}>
      {/* The viewport takes Tab when its content overflows. */}
      <BaseScrollArea.Viewport ref={viewportRef} className="peer h-full w-full outline-none">
        {/*
          Base UI's content carries an inline min-width: fit-content, so a vertical list grew to
          its widest row, a row's truncate never applied and Tab onto a long row scrolled the
          viewport sideways. A vertical-only area resets it; the others keep it to scroll sideways.
        */}
        <BaseScrollArea.Content className={orientation === "vertical" ? "min-w-0!" : undefined}>
          {children}
        </BaseScrollArea.Content>
      </BaseScrollArea.Viewport>

      {(orientation === "vertical" || orientation === "both") && (
        <BaseScrollArea.Scrollbar
          orientation="vertical"
          className="border-outline-variant bg-surface-container flex w-2 touch-none border-l p-px"
        >
          <BaseScrollArea.Thumb className="bg-outline-variant hover:bg-outline w-full" />
        </BaseScrollArea.Scrollbar>
      )}

      {(orientation === "horizontal" || orientation === "both") && (
        <BaseScrollArea.Scrollbar
          orientation="horizontal"
          className="border-outline-variant bg-surface-container flex h-2 touch-none border-t p-px"
        >
          <BaseScrollArea.Thumb className="bg-outline-variant hover:bg-outline h-full" />
        </BaseScrollArea.Scrollbar>
      )}

      {orientation === "both" && <BaseScrollArea.Corner className="bg-surface-container" />}

      {/*
        The viewport's focus ring, on a layer of its own above the content and
        the scrollbars (2026-11-19). An inset ring on the viewport itself paints
        under its rows, so a row or a header with a fill hides it, and a ring
        outside the root is clipped by whatever panel holds it.
      */}
      <span
        aria-hidden
        className="peer-focus-visible:ring-primary pointer-events-none absolute inset-0 rounded-[inherit] peer-focus-visible:ring-2 peer-focus-visible:ring-inset"
      />
    </BaseScrollArea.Root>
  );
}
