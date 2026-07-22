import { Menu } from '@base-ui/react/menu'
import { ChevronRight, FilePlus, FolderOpen, History } from 'lucide-react'
import { cn } from '@imbatranim/core'
import type { RecentFile } from './recentFilesStore'

// VS-Code-style File menu, built on the same @base-ui/react primitive Dialog
// already uses elsewhere in core — no bespoke popover/click-outside logic.

const triggerClass =
  'font-ui text-on-surface hover:bg-surface-container-high inline-flex h-6 cursor-pointer ' +
  'items-center border border-transparent px-2 text-[11px] outline-none select-none'

const popupClass =
  'border-outline-variant bg-surface-container-low min-w-[190px] border py-1 ' +
  'shadow-[0_12px_32px_rgba(0,0,0,0.35)] outline-none'

const itemClass =
  'font-ui text-on-surface flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 ' +
  'text-left text-[12px] outline-none data-[highlighted]:bg-surface-container-high'

export type FileMenuProps = {
  recent: RecentFile[]
  onNew: () => void
  onOpenPicker: () => void
  onOpenRecent: (entry: RecentFile) => void
  onClearRecent: () => void
}

export function FileMenu({
  recent,
  onNew,
  onOpenPicker,
  onOpenRecent,
  onClearRecent,
}: FileMenuProps) {
  return (
    <Menu.Root>
      <Menu.Trigger className={triggerClass}>File</Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="start" sideOffset={4}>
          <Menu.Popup className={popupClass}>
            <Menu.Item className={itemClass} onClick={onNew}>
              <FilePlus size={13} strokeWidth={1.5} />
              New
            </Menu.Item>
            <Menu.Item className={itemClass} onClick={onOpenPicker}>
              <FolderOpen size={13} strokeWidth={1.5} />
              Open…
            </Menu.Item>

            <Menu.SubmenuRoot>
              <Menu.SubmenuTrigger className={cn(itemClass, 'justify-between')}>
                <span className="flex items-center gap-2">
                  <History size={13} strokeWidth={1.5} />
                  Open Recent
                </span>
                <ChevronRight size={12} />
              </Menu.SubmenuTrigger>
              <Menu.Portal>
                <Menu.Positioner side="right" align="start" sideOffset={2}>
                  <Menu.Popup className={cn(popupClass, 'max-h-72 overflow-y-auto')}>
                    {recent.length === 0 ? (
                      <div className="font-ui text-on-surface-variant px-3 py-1.5 text-[12px]">
                        No recent files
                      </div>
                    ) : (
                      <>
                        {recent.map((entry) => (
                          <Menu.Item
                            key={`${entry.root}:${entry.path}`}
                            className={itemClass}
                            onClick={() => onOpenRecent(entry)}
                          >
                            <span className="truncate" title={entry.path}>
                              {entry.name}
                            </span>
                          </Menu.Item>
                        ))}
                        <Menu.Separator className="border-outline-variant my-1 border-t" />
                        <Menu.Item className={itemClass} onClick={onClearRecent}>
                          Clear Recent
                        </Menu.Item>
                      </>
                    )}
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.SubmenuRoot>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
