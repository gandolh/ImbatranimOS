import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import {
  isValidElement,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "../cn";

type TooltipProps = {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
};

/** How long the pointer rests on a trigger before its tooltip opens. */
const OPEN_DELAY_MS = 400;

type TriggerProps = {
  onPointerEnter?: (event: PointerEvent<HTMLElement>) => void;
  onPointerLeave?: (event: PointerEvent<HTMLElement>) => void;
  onPointerDown?: (event: PointerEvent<HTMLElement>) => void;
  onFocus?: (event: FocusEvent<HTMLElement>) => void;
  onBlur?: (event: FocusEvent<HTMLElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
};

/**
 * A tooltip for `children`, shown after a mouse rests on it for 400 ms or while it has keyboard focus, and hidden
 * when the pointer leaves, the child is pressed, focus moves on, or Escape is pressed.
 *
 * The child stays the element it is, where it is: the tooltip only adds its handlers. Base UI's tooltip, with its
 * floating-ui context, mounts while the tooltip is open, anchored to the child. A list renders a row's tooltips
 * on every scroll frame that brings the row in, and most are never hovered: with Base UI's trigger around every
 * child, the tooltips were a third of the File Manager's main thread a wheel step in a 20,000-file folder
 * (2026-11-24). Mounting Base UI's trigger only when asked for would remount the child, and a radio in a group
 * then loses its place in the Tab order.
 */
export function Tooltip({ content, children, side = "top" }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLElement | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const cancel = () => window.clearTimeout(timer.current);
  useEffect(() => cancel, []);

  // Not an element: Base UI's trigger wraps it in a focusable button, as it always has.
  if (!isValidElement(children)) {
    return (
      <BaseTooltip.Provider delay={OPEN_DELAY_MS}>
        <BaseTooltip.Root>
          <BaseTooltip.Trigger>{children}</BaseTooltip.Trigger>
          <Popup side={side}>{content}</Popup>
        </BaseTooltip.Root>
      </BaseTooltip.Provider>
    );
  }

  const child = children as ReactElement<TriggerProps>;
  const own = child.props;
  const close = () => {
    cancel();
    setOpen(false);
  };
  // The child, as it was (its own props and ref), with the tooltip's handlers over its own; the tooltip finds the
  // element through the events that open it.
  const Trigger = child.type;
  const handlers = {
    onPointerEnter: (event: PointerEvent<HTMLElement>) => {
      own.onPointerEnter?.(event);
      // A touch's emulated hover opens nothing, as with Base UI's trigger.
      if (event.pointerType !== "mouse") return;
      anchor.current = event.currentTarget;
      cancel();
      timer.current = window.setTimeout(() => setOpen(true), OPEN_DELAY_MS);
    },
    onPointerLeave: (event: PointerEvent<HTMLElement>) => {
      own.onPointerLeave?.(event);
      close();
    },
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      own.onPointerDown?.(event);
      close();
    },
    onFocus: (event: FocusEvent<HTMLElement>) => {
      own.onFocus?.(event);
      anchor.current = event.currentTarget;
      if (focusVisible(event.currentTarget)) setOpen(true);
    },
    onBlur: (event: FocusEvent<HTMLElement>) => {
      own.onBlur?.(event);
      close();
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      own.onKeyDown?.(event);
      if (event.key === "Escape") close();
    },
  };

  return (
    <>
      <Trigger {...own} {...handlers} />
      {open && (
        <BaseTooltip.Root open onOpenChange={(next) => (next ? undefined : close())}>
          <Popup side={side} anchor={anchor}>
            {content}
          </Popup>
        </BaseTooltip.Root>
      )}
    </>
  );
}

/** Keyboard focus, not a click's: Base UI's tooltips open for focus-visible only. */
function focusVisible(el: HTMLElement): boolean {
  try {
    return el.matches(":focus-visible");
  } catch {
    // A DOM without the selector (a test's).
    return true;
  }
}

function Popup({
  side,
  anchor,
  children,
}: {
  side: TooltipProps["side"];
  anchor?: { current: HTMLElement | null };
  children: ReactNode;
}) {
  return (
    <BaseTooltip.Portal>
      {/* Above the window band and above dialogs (a tooltip can sit over a dialog). */}
      <BaseTooltip.Positioner side={side} sideOffset={4} anchor={anchor} className="z-tooltip">
        <BaseTooltip.Popup
          className={cn(
            "border-outline-variant bg-inverse-surface rounded-control border px-2 py-1",
            "font-ui text-inverse-on-surface text-label",
            "shadow-(--k-shadow-tooltip)",
          )}
        >
          {children}
        </BaseTooltip.Popup>
      </BaseTooltip.Positioner>
    </BaseTooltip.Portal>
  );
}
