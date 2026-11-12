import { useMemo, useState } from "react";
import { Button, Checkbox, Dialog, Radio, RadioGroup, cn, useSystem } from "@imbatranim/ui";
import { marketplaceGap, marketplaceIntent, marketplaceTarget } from "../lib/marketplaceOpeners";

/**
 * "Open with…" — the chooser, and the place a default gets set.
 *
 * It serves two arrivals, and they want different lists:
 *
 * - **the context menu**, where the user is overriding a working default, so the
 *   apps that claim this type come first and the rest are behind "Show all";
 * - **a double-click on something nothing claims**, where the claimants list is
 *   empty and the honest thing is to show everything immediately.
 *
 * Installed Linux apps that claim the type come after the OS's own apps, marked
 * as Linux apps; for a type only they claim (an `.odt`), a double-click opens
 * this dialog with them first.
 *
 * "Always use this" writes a dotfile, so the choice follows the
 * account rather than the browser — and it is keyed by *extension*, not by file:
 * per-file overrides are state nobody can find again later.
 */
export function OpenWithDialog({
  fileName,
  onPick,
  onClose,
}: {
  fileName: string;
  onPick: (appId: string) => void;
  onClose: () => void;
}) {
  const { associations, openApp } = useSystem().intents;
  const claimants = useMemo(() => associations.candidatesFor(fileName), [associations, fileName]);
  const everything = useMemo(() => associations.allCandidates(), [associations]);
  const [showAll, setShowAll] = useState(claimants.length === 0);
  const [remember, setRemember] = useState(false);
  const [picked, setPicked] = useState<string>(claimants[0]?.appId ?? "");

  const key = associations.keyFor(fileName);
  const target = marketplaceTarget(key);
  const options = showAll ? everything : claimants.length > 0 ? claimants : everything;

  function confirm() {
    if (picked === "") return;
    if (remember) associations.setDefault(key, picked);
    onPick(picked);
    onClose();
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Open with"
      description={fileName}
      disablePointerDismissal
    >
      <div className="flex flex-col gap-2">
        {claimants.length === 0 && (
          <p className="text-on-surface-variant text-control">
            {/* An office file with Office not installed says where to get it
                rather than steering it into the text editor. */}
            {target ? (
              <>
                No installed app opens .{key} files.{" "}
                <button
                  onClick={() => {
                    openApp("settings", marketplaceIntent(target.descriptorId));
                    onClose();
                  }}
                  className="text-primary focus-visible:ring-primary underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-inset"
                >
                  {target.name} in Settings → Marketplace
                </button>{" "}
                does.
              </>
            ) : (
              (marketplaceGap(key) ?? "No app claims this file type. Pick one — the text editor opens most things.")
            )}
          </p>
        )}

        <RadioGroup
          aria-label="Open with"
          value={picked}
          onValueChange={setPicked}
          className="border-outline-variant rounded-control apricot:py-1 max-h-56 overflow-auto border px-(--k-list-inset)"
        >
          {options.map((candidate) => (
            <Radio
              key={candidate.appId}
              value={candidate.appId}
              className={({ checked }) =>
                cn(
                  "focus-visible:ring-primary border-outline-variant/50 rounded-item apricot:border-transparent text-control flex w-full items-center gap-2 border-b px-2 py-1.5 text-left last:border-b-0 focus-visible:ring-2 focus-visible:ring-inset",
                  checked ? "bg-primary-container text-on-primary-container" : "hover:bg-surface-container-high",
                )
              }
            >
              {candidate.name}
              {candidate.linux && <span className="text-tiny opacity-70">Linux app</span>}
              {claimants.some((c) => c.appId === candidate.appId) && showAll && (
                <span className="text-tiny ml-auto opacity-70">handles this type</span>
              )}
            </Radio>
          ))}
        </RadioGroup>

        {claimants.length > 0 && !showAll && (
          <button
            onClick={() => setShowAll(true)}
            className="text-on-surface-variant hover:text-on-surface focus-visible:ring-primary text-label self-start underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-inset"
          >
            Show all apps
          </button>
        )}

        {/* Core's Checkbox is its own <label>; wrapping it in another would nest
            two labels for one control. */}
        <Checkbox
          label={`Always use this for ${key.startsWith(".") ? key : `.${key}`} files`}
          checked={remember}
          onCheckedChange={(next) => setRemember(next)}
        />

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="default" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" disabled={picked === ""} onClick={confirm}>
            Open
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
