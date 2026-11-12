import { useEffect, useState } from "react";
import { Button, useConfirm } from "@imbatranim/ui";
import {
  CLEAN_OUT_CONFIRM,
  cleanOutOldData,
  downloadOldData,
  loadOldData,
  oldDataApps,
  oldDataError,
  useOldDataStore,
} from "../../shared/store/oldDataStore";

/**
 * Settings → Storage: older data the data moves set aside, while any is left.
 * Once the sign-in notice stops asking (the owner downloaded it), this is
 * where the clean-out stays reachable.
 */
export function OldDataSettings() {
  const status = useOldDataStore((s) => s.status);
  const { confirm, confirmDialog } = useConfirm();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadOldData();
  }, []);

  if (!status || status.sets.length === 0) return confirmDialog;

  const run = async (work: () => Promise<string | null>) => {
    setBusy(true);
    setMessage(null);
    try {
      setMessage(await work());
    } catch (err) {
      setMessage(oldDataError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-control border-outline-variant mt-3 flex flex-col gap-2 border p-3">
      <p className="font-ui text-on-surface text-control">
        Older data is set aside for {oldDataApps(status)}: what the apps had before they moved into their own folders,
        which they no longer read.
      </p>
      {message && (
        <p role="status" className="font-ui text-on-surface-variant text-label">
          {message}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="default"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const path = await downloadOldData();
              return path ? `Saved to ${path}.` : null;
            })
          }
        >
          Download…
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              if (!(await confirm(CLEAN_OUT_CONFIRM))) return null;
              await cleanOutOldData();
              return null;
            })
          }
        >
          Clean out older data
        </Button>
      </div>
      {confirmDialog}
    </div>
  );
}
