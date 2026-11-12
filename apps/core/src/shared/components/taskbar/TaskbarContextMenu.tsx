import { ContextMenu, type ContextMenuItem } from "@imbatranim/ui";
import { WORKSPACE_IDS, type WorkspaceId } from "../../store/windowStore";
import { cn } from "../../../lib/cn";

/**
 * Right-click menu on a taskbar button (kit-backed since the context-menu kit —
 * the third hand-rolled menu triggered the promote rule, so positioning,
 * dismissal and the keyboard/ARIA contract now come from the shared
 * `ContextMenu`; the old `MENU_WIDTH`/`MENU_HEIGHT` size guesses are gone, the
 * positioner measures and flips above the taskbar on its own). What stays
 * local is the content: a title header and the workspace 1–4 grid ride the
 * kit's custom-row escape hatch.
 */
export function TaskbarContextMenu({
  x,
  y,
  windowTitle,
  currentWorkspace,
  isMaximized,
  onMoveToWorkspace,
  onToggleMaximize,
  onMinimize,
  onClose,
  onDismiss,
  appActions = [],
}: {
  x: number;
  y: number;
  windowTitle: string;
  /** The app's own actions, a Linux app's desktop actions (Firefox's New Window). */
  appActions?: { label: string; onSelect: () => void }[];
  currentWorkspace: WorkspaceId;
  isMaximized: boolean;
  onMoveToWorkspace: (id: WorkspaceId) => void;
  onToggleMaximize: () => void;
  onMinimize: () => void;
  onClose: () => void;
  onDismiss: () => void;
}) {
  const items: ContextMenuItem[] = [
    {
      type: "custom",
      key: "title",
      children: (
        <div className="border-outline-variant text-on-surface-variant text-label truncate border-b px-2.5 py-1.5 font-semibold">
          {windowTitle}
        </div>
      ),
    },
    ...(appActions.length > 0 ? [...appActions, { type: "separator" as const }] : []),
    {
      type: "custom",
      key: "workspaces",
      children: (
        <>
          <div className="text-on-surface-variant text-tiny px-2.5 pt-1.5 font-semibold tracking-widest uppercase">
            Move to workspace
          </div>
          <div className="flex gap-1 px-2.5 py-1.5">
            {WORKSPACE_IDS.map((id: WorkspaceId) => (
              <button
                key={id}
                role="menuitem"
                disabled={id === currentWorkspace}
                onClick={() => onMoveToWorkspace(id)}
                aria-label={`Move to workspace ${id}`}
                className={cn(
                  "focus-visible:ring-primary rounded-control border-outline-variant text-label flex h-[24px] flex-1 items-center justify-center border tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-inset",
                  id === currentWorkspace
                    ? "bg-surface-container-high text-on-surface-variant cursor-default"
                    : "hover:bg-primary-container hover:text-on-primary-container hover:border-primary",
                )}
              >
                {id}
              </button>
            ))}
          </div>
        </>
      ),
    },
    { type: "separator" },
    { label: isMaximized ? "Restore" : "Maximize", onSelect: onToggleMaximize },
    { label: "Minimize", onSelect: onMinimize },
    { label: "Close", onSelect: onClose, danger: true },
  ];

  return <ContextMenu x={x} y={y} items={items} onClose={onDismiss} label={`Actions for ${windowTitle}`} />;
}
