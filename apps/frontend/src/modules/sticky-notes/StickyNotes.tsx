import { useCallback, useEffect, useRef, useState } from 'react'
import dayjs from 'dayjs'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Button } from '../../shared/components/ui/Button'
import { useWindowStore } from '../../shared/store/windowStore'
import { createStickyNote } from './api/stickyNotesApi'
import {
  useDeleteStickyNoteMutation,
  useStickyNotesQuery,
  useUpdateStickyNoteMutation,
} from './queries/stickyNotesQueries'
import { useStickyNoteEditorStore } from './stickyNoteEditorStore'
import type { StickyNote } from './types'

// ---------------------------------------------------------------------------
// openStickyNote — exported helper; called by list rows and "New Note" button
// ---------------------------------------------------------------------------
export function openStickyNote(note: StickyNote) {
  const windowId = useWindowStore.getState().openWindow(
    'sticky-notes',
    `Note #${note.id}`,
    { width: 320, height: 280 },
    { width: 240, height: 200 },
    { x: note.pos_x, y: note.pos_y },
  )
  useStickyNoteEditorStore.getState().setEditor(windowId, note.id)
}

// ---------------------------------------------------------------------------
// Editor view — shown when window has a note ID in the editor store
// ---------------------------------------------------------------------------
function NoteEditor({ noteId, windowId }: { noteId: number; windowId: string }) {
  const { data: notes } = useStickyNotesQuery()
  const note = notes?.find((n) => n.id === noteId)
  const updateMutation = useUpdateStickyNoteMutation()
  const clearEditor = useStickyNoteEditorStore((s) => s.clearEditor)

  const [content, setContent] = useState(note?.content ?? '')
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync content if note loads/changes from query
  useEffect(() => {
    if (note) setContent(note.content)
  }, [note?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = useCallback(
    (value: string) => {
      setContent(value)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        updateMutation.mutate(
          { id: noteId, data: { content: value } },
          {
            onSuccess: () => {
              setSavedAt(Date.now())
              setTimeout(() => setSavedAt(null), 1500)
            },
          },
        )
      }, 800)
    },
    [noteId, updateMutation],
  )

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const showSaved = savedAt !== null

  return (
    <div className="flex h-full flex-col bg-surface-container-lowest">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-outline-variant px-2 py-1">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1"
          onClick={() => clearEditor(windowId)}
        >
          <ArrowLeft size={12} strokeWidth={2} />
          <span>Back</span>
        </Button>
        <span
          className={cn(
            'font-ui text-[11px] text-on-surface-variant transition-opacity duration-300',
            showSaved ? 'opacity-100' : 'opacity-0',
          )}
        >
          Saved
        </span>
      </div>

      {/* Textarea */}
      <textarea
        className="font-content flex-1 resize-none bg-transparent p-3 text-[14px] text-on-surface outline-none placeholder:text-on-surface-variant"
        value={content}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Start typing…"
        spellCheck={false}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// List / launcher view
// ---------------------------------------------------------------------------
function NoteList({ windowId }: { windowId: string }) {
  const { data: notes, isLoading } = useStickyNotesQuery()
  const deleteMutation = useDeleteStickyNoteMutation()
  const setEditor = useStickyNoteEditorStore((s) => s.setEditor)

  const handleNewNote = async () => {
    const note = await createStickyNote({ content: '', pos_x: 100, pos_y: 100 })
    // open editor in THIS window
    setEditor(windowId, note.id)
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center font-ui text-[12px] text-on-surface-variant">
        Loading…
      </div>
    )
  }

  const empty = !notes || notes.length === 0

  return (
    <div className="flex h-full flex-col bg-surface-container-lowest">
      {/* Toolbar */}
      <div className="flex items-center border-b border-outline-variant px-2 py-1.5">
        <Button variant="primary" size="sm" onClick={handleNewNote}>
          + New Note
        </Button>
      </div>

      {/* Body */}
      {empty ? (
        <div className="flex flex-1 items-center justify-center font-ui text-[12px] text-on-surface-variant">
          No sticky notes yet
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {notes!.map((note) => (
            <NoteRow
              key={note.id}
              note={note}
              onOpen={() => openStickyNote(note)}
              onDelete={(e) => {
                e.stopPropagation()
                deleteMutation.mutate(note.id)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function NoteRow({
  note,
  onOpen,
  onDelete,
}: {
  note: StickyNote
  onOpen: () => void
  onDelete: (e: React.MouseEvent) => void
}) {
  const preview = note.content.slice(0, 60) || '(empty)'
  const date = dayjs(note.created_at).format('MMM D, YYYY')

  return (
    <div
      className="group flex cursor-pointer items-center gap-2 border-b border-outline-variant px-3 py-2 hover:bg-surface-container-low"
      onClick={onOpen}
    >
      <div className="min-w-0 flex-1">
        <p className="font-content truncate text-[13px] text-on-surface">{preview}</p>
        <p className="font-ui mt-0.5 text-[11px] text-on-surface-variant">{date}</p>
      </div>
      <button
        className="shrink-0 p-1 text-on-surface-variant opacity-0 transition-opacity group-hover:opacity-100 hover:text-error"
        onClick={onDelete}
        title="Delete note"
        type="button"
      >
        <Trash2 size={12} strokeWidth={2} />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Root export — switches between list and editor based on editor store
// ---------------------------------------------------------------------------
export function StickyNotes({ windowId }: { windowId: string }) {
  const noteId = useStickyNoteEditorStore((s) => s.editorMap[windowId])

  if (noteId !== undefined) {
    return <NoteEditor noteId={noteId} windowId={windowId} />
  }

  return <NoteList windowId={windowId} />
}
