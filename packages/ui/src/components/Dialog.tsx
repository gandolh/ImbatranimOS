import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { isValidElement, useRef, type ReactNode } from "react";
import { cn } from "../cn";

/** Why a dialog asked to open or close, and the event behind it (Base UI's own details). */
export type DialogChangeDetails = BaseDialog.Root.ChangeEventDetails;

type DialogProps = {
  open?: boolean;
  /** `details.reason` says why: "escape-key", "outside-press", "close-press", "trigger-press". */
  onOpenChange?: (open: boolean, details: DialogChangeDetails) => void;
  trigger?: ReactNode;
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  /**
   * Set it on a dialog that holds a form: an outside press then does not close
   * it, so nothing typed is thrown away. It still closes with Cancel, the X or Esc.
   */
  disablePointerDismissal?: boolean;
};

/** Where focus goes when no `[data-autofocus]` element exists: the first field, then the first button, in the body. */
const FIELD = "input:not(:disabled), select:not(:disabled), textarea:not(:disabled)";
const BUTTON = "button:not(:disabled)";

/**
 * A modal dialog. Esc that a control inside already used (`defaultPrevented`)
 * does not close it. Focus lands on the first `[data-autofocus]` inside, else
 * the body's first field, else its first button, never the X.
 */
export function Dialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  className,
  disablePointerDismissal,
}: DialogProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  return (
    <BaseDialog.Root
      open={open}
      onOpenChange={(next, details) => {
        // The Escape guard: Base UI's Esc listener doesn't look at defaultPrevented.
        if (!next && details.reason === "escape-key" && details.event.defaultPrevented) return;
        onOpenChange?.(next, details);
      }}
      disablePointerDismissal={disablePointerDismissal}
    >
      {trigger &&
        (isValidElement(trigger) ? (
          <BaseDialog.Trigger render={trigger} />
        ) : (
          <BaseDialog.Trigger>{trigger}</BaseDialog.Trigger>
        ))}
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="bg-scrim z-scrim fixed inset-0" />
        <BaseDialog.Popup
          ref={popupRef}
          initialFocus={() =>
            popupRef.current?.querySelector<HTMLElement>("[data-autofocus]") ??
            bodyRef.current?.querySelector<HTMLElement>(FIELD) ??
            bodyRef.current?.querySelector<HTMLElement>(BUTTON) ??
            true
          }
          className={cn(
            "z-dialog fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
            "border-outline-variant bg-surface-container-lowest rounded-window min-w-[320px] overflow-hidden border",
            "shadow-(--k-shadow-dialog)",
            "outline-none",
            className,
          )}
        >
          {title && (
            <div className="border-outline-variant bg-surface-container-high flex items-center justify-between border-b px-3 py-1.5">
              <BaseDialog.Title className="font-ui text-on-surface text-body font-semibold">{title}</BaseDialog.Title>
              <BaseDialog.Close
                aria-label="Close"
                className="border-outline-variant bg-surface-container-low font-ui text-on-surface hover:bg-error hover:text-on-error rounded-control text-control flex h-5 w-5 cursor-pointer items-center justify-center border"
              >
                ×
              </BaseDialog.Close>
            </div>
          )}
          <div ref={bodyRef} className="font-content text-on-surface text-body p-3">
            {description && (
              <BaseDialog.Description className="text-on-surface-variant mb-3">{description}</BaseDialog.Description>
            )}
            {children}
          </div>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
