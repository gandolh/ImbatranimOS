import { AlertDialog } from "@base-ui/react/alert-dialog";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../cn";
import { Button } from "./Button";

export type ConfirmOptions = {
  title: string;
  /**
   * `ReactNode`, not `string`: the File Manager's delete confirmation names the
   * target in bold, and forcing it to a plain string to reuse this dialog would
   * have made the shared component *worse* than the bespoke one it replaced.
   */
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type ConfirmDialogProps = ConfirmOptions & {
  open: boolean;
  /**
   * Return a promise and the dialog stays open, ignoring Esc, the X and the
   * Cancel button, until it settles: the action is running.
   */
  onConfirm: () => void | Promise<unknown>;
  onCancel: () => void;
  /** The confirm button's label while the action runs. */
  pendingLabel?: string;
};

/**
 * A themed confirm dialog on Base UI's AlertDialog. Controlled: the parent owns
 * `open` and is notified via `onConfirm` / `onCancel`. Dismissing (Escape, the
 * close button) counts as a cancel; an outside press does nothing, as an alert
 * should not vanish by accident. Cancel has the focus. While an async
 * `onConfirm` runs it cannot be dismissed and the button shows `pendingLabel`.
 * Prefer the {@link useConfirm} hook for the common imperative
 * `await confirm(...)` flow.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  pendingLabel = "Working…",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const run = () => {
    if (pending) return;
    const result = onConfirm();
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setPending(true);
      void (result as Promise<unknown>).then(
        () => setPending(false),
        () => setPending(false),
      );
    }
  };

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onCancel();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="bg-scrim z-scrim fixed inset-0" />
        <AlertDialog.Popup
          initialFocus={cancelRef}
          className={cn(
            "z-dialog fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
            "border-outline-variant bg-surface-container-low rounded-window min-w-[320px] overflow-hidden border",
            "shadow-(--k-shadow-dialog)",
            "outline-none",
          )}
        >
          <div className="border-outline-variant bg-surface-container flex items-center justify-between border-b py-[6px] pr-[6px] pl-[12px]">
            <AlertDialog.Title className="font-ui text-on-surface text-body font-semibold">{title}</AlertDialog.Title>
            <AlertDialog.Close
              aria-label="Close"
              disabled={pending}
              className="font-ui text-on-surface-variant hover:bg-error-container hover:text-on-error-container rounded-item text-body focus-visible:ring-primary focus-visible:bg-surface-container-lowest flex h-[24px] w-[24px] cursor-pointer items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-inset"
            >
              ×
            </AlertDialog.Close>
          </div>
          <div className="font-content text-on-surface text-body p-3">
            <AlertDialog.Description render={<div />} className="text-on-surface mb-4">
              {message}
            </AlertDialog.Description>
            <div className="flex justify-end gap-2">
              <Button ref={cancelRef} variant="default" size="sm" disabled={pending} onClick={onCancel}>
                {cancelLabel}
              </Button>
              <Button variant={destructive ? "destructive" : "primary"} size="sm" disabled={pending} onClick={run}>
                {pending ? pendingLabel : confirmLabel}
              </Button>
            </div>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

type ConfirmState = ConfirmOptions & { open: boolean };

/**
 * Imperative confirm dialog. Call `confirm(opts)` to open the themed dialog and
 * `await` the user's choice: it resolves `true` on confirm, `false` on
 * cancel/dismiss. Render `confirmDialog` somewhere in your tree.
 *
 * ```tsx
 * const { confirm, confirmDialog } = useConfirm()
 * const ok = await confirm({ title: 'Delete', message: 'Sure?', destructive: true })
 * // ...somewhere in JSX: {confirmDialog}
 * ```
 *
 * Self-contained — no global provider required.
 */
// Co-located with its component by design; the hook is not a Fast Refresh
// boundary, so exporting it alongside <ConfirmDialog> is safe.
// eslint-disable-next-line react-refresh/only-export-components
export function useConfirm(): {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  confirmDialog: ReactNode;
} {
  const [state, setState] = useState<ConfirmState>({
    open: false,
    title: "",
    message: "",
  });
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      // A re-entrant call while a dialog is still pending settles the prior
      // promise as false so its awaiter never hangs.
      resolverRef.current?.(false);
      resolverRef.current = resolve;
      setState({ ...opts, open: true });
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setState((prev) => ({ ...prev, open: false }));
  }, []);

  // If the host unmounts with a confirm still pending, settle it false rather
  // than leaving the awaiter hung forever.
  useEffect(() => {
    return () => {
      resolverRef.current?.(false);
      resolverRef.current = null;
    };
  }, []);

  const confirmDialog: ReactNode = (
    <ConfirmDialog
      open={state.open}
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      destructive={state.destructive}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  );

  return { confirm, confirmDialog };
}
