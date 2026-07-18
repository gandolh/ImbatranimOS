import { Music, Video, ListMusic } from 'lucide-react'
import { ScrollArea, cn } from '@imbatranim/core'
import type { Track } from '../api/listDir'

type PlaylistProps = {
  tracks: Track[]
  activePath: string | null
  onSelect: (path: string) => void
}

/** The folder queue — sibling media files, name-sorted, click to switch. */
export function Playlist({ tracks, activePath, onSelect }: PlaylistProps) {
  return (
    <div className="border-outline-variant bg-surface-container-low flex h-full w-52 shrink-0 flex-col border-l">
      <div className="border-outline-variant flex items-center gap-1.5 border-b px-2 py-1.5">
        <ListMusic size={12} className="text-on-surface-variant shrink-0" />
        <span className="font-ui text-on-surface-variant text-[11px] font-semibold tracking-wide uppercase">
          Queue · {tracks.length}
        </span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <ul className="flex flex-col">
          {tracks.map((track) => {
            const active = track.path === activePath
            const Icon = track.kind === 'video' ? Video : Music
            return (
              <li key={track.path}>
                <button
                  type="button"
                  onClick={() => onSelect(track.path)}
                  className={cn(
                    'font-ui border-outline-variant flex w-full cursor-pointer items-center gap-1.5 border-b px-2 py-1.5 text-left text-[11px]',
                    active
                      ? 'bg-primary text-on-primary'
                      : 'text-on-surface hover:bg-surface-container-high'
                  )}
                >
                  <Icon size={12} className="shrink-0" />
                  <span className="truncate">{track.name}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </ScrollArea>
    </div>
  )
}
