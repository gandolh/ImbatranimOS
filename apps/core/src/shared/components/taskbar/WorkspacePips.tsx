import { useState } from "react";
import { ContextMenu } from "@imbatranim/ui";
import { WORKSPACE_IDS, useWindowStore, workspaceOccupancy, type WorkspaceId } from "../../store/windowStore";
import { cn } from "../../../lib/cn";

/** A workspace's name, with what it holds. */
function workspaceLabel(id: WorkspaceId, count: number): string {
  return count === 0 ? `Workspace ${id}, empty` : `Workspace ${id}, ${count} window${count === 1 ? "" : "s"}`;
}

/**
 * Four workspace pips, beside the Tray.
 *
 * **Empty workspaces stay visible.** Hiding them until they hold something would
 * make the whole feature undiscoverable to anyone who does not already know it
 * exists — which is everyone, the first time.
 *
 * The occupancy dot is the other half of that: a pip that looks identical
 * whether or not it holds windows makes "where did my editor go?" a matter of
 * clicking through all four.
 *
 * On a phone (2026-11-13) the four fold into one button: the current number
 * over four dots, the current one in the accent, so it reads as one of four;
 * it opens the four as a menu.
 */
export function WorkspacePips() {
  const windows = useWindowStore((s) => s.windows);
  const activeWorkspace = useWindowStore((s) => s.activeWorkspace);
  const setActiveWorkspace = useWindowStore((s) => s.setActiveWorkspace);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);

  const occupancy = workspaceOccupancy(windows);

  return (
    <>
      <div
        className="border-outline-variant apricot:border-l-0 flex shrink-0 items-center gap-1 border-l px-2 max-[600px]:hidden"
        role="group"
        aria-label="Workspaces"
      >
        {WORKSPACE_IDS.map((id: WorkspaceId) => {
          const active = id === activeWorkspace;
          const count = occupancy[id];
          return (
            <button
              key={id}
              onClick={() => setActiveWorkspace(id)}
              aria-pressed={active}
              aria-label={workspaceLabel(id, count)}
              title={`Workspace ${id} (Ctrl+Alt+${id})`}
              className={cn(
                "focus-visible:ring-primary rounded-item text-label relative flex h-[24px] w-[24px] items-center justify-center border font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-inset",
                active
                  ? "border-primary bg-primary-container text-on-primary-container"
                  : "border-outline text-on-surface-variant hover:bg-surface-container-high",
              )}
            >
              {id}
              {count > 0 && !active && (
                <span className="bg-primary rounded-small absolute right-[2px] bottom-[2px] h-[3px] w-[3px]" />
              )}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        aria-haspopup="menu"
        aria-label={`Workspace ${activeWorkspace} of ${WORKSPACE_IDS.length}`}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setMenuAt({ x: r.left, y: r.top });
        }}
        className="focus-visible:ring-primary relative mx-[2px] hidden h-[48px] w-[48px] shrink-0 items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-inset max-[600px]:flex max-[380px]:w-[44px]"
      >
        <span aria-hidden className="border-primary bg-primary-container rounded-control absolute inset-[7px] border" />
        <span className="text-on-primary-container text-subhead relative -mt-[4px] font-semibold tabular-nums">
          {activeWorkspace}
        </span>
        <span aria-hidden className="absolute inset-x-0 bottom-[15px] flex justify-center gap-1">
          {WORKSPACE_IDS.map((id) => (
            <i
              key={id}
              className={cn(
                "rounded-small block h-[4px] w-[4px]",
                id === activeWorkspace ? "bg-primary" : "bg-outline",
              )}
            />
          ))}
        </span>
      </button>
      {menuAt && (
        <ContextMenu
          x={menuAt.x}
          y={menuAt.y}
          label="Workspaces"
          onClose={() => setMenuAt(null)}
          items={WORKSPACE_IDS.map((id) => ({
            label: workspaceLabel(id, occupancy[id]),
            checked: id === activeWorkspace,
            onSelect: () => setActiveWorkspace(id),
          }))}
        />
      )}
    </>
  );
}
