import { useCallback, useEffect, useRef, useState } from 'react'
import dayjs from 'dayjs'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { cn } from '@imbatranim/core'
import { Button } from '@imbatranim/core'
import { useWindowStore } from '@imbatranim/core'
import { createStickyNote } from './api/stickyNotesApi'
import {
  useDeleteStickyNoteMutation,
  useStickyNotesQuery,
  useUpdateStickyNoteMutation,
} from './queries/stickyNotesQueries'
import { useStickyNoteEditorStore } from './stickyNoteEditorStore'
import type { StickyNote } from './types'

// ---------------------------------------------------------------------------
// openStickyNote — helper; called by list rows and "New Note" button
// ---------------------------------------------------------------------------
function openStickyNote(note: StickyNote) {
  const windowId = useWindowStore
    .getState()
    .openWindow(
      'sticky-notes',
      `Note #${note.id}`,
      { width: 320, height: 280 },
      { width: 240, height: 200 },
      { x: note.pos_x, y: note.pos_y }
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

  // Sync content when the note (re)loads from the query — state adjustment
  // during render instead of an effect (react.dev/you-might-not-need-an-effect)
  const [prevNoteId, setPrevNoteId] = useState(note?.id)
  if (note && note.id !== prevNoteId) {
    setPrevNoteId(note.id)
    setContent(note.content)
  }

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
          }
        )
      }, 800)
    },
    [noteId, updateMutation]
  )

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const showSaved = savedAt !== null

  return (
    <div className="bg-surface-container-lowest flex h-full flex-col">
      {/* Top bar */}
      <div className="border-outline-variant flex items-center justify-between border-b px-2 py-1">
        <Button variant="ghost" size="sm" className="gap-1" onClick={() => clearEditor(windowId)}>
          <ArrowLeft size={12} strokeWidth={2} />
          <span>Back</span>
        </Button>
        <span
          className={cn(
            'font-ui text-on-surface-variant text-[11px] transition-opacity duration-300',
            showSaved ? 'opacity-100' : 'opacity-0'
          )}
        >
          Saved
        </span>
      </div>

      {/* Textarea */}
      <textarea
        className="font-content text-on-surface placeholder:text-on-surface-variant flex-1 resize-none bg-transparent p-3 text-[14px] outline-none"
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
      <div className="font-ui text-on-surface-variant flex h-full items-center justify-center text-[12px]">
        Loading…
      </div>
    )
  }

  const empty = !notes || notes.length === 0

  return (
    <div className="bg-surface-container-lowest flex h-full flex-col">
      {/* Toolbar */}
      <div className="border-outline-variant flex items-center border-b px-2 py-1.5">
        <Button variant="primary" size="sm" onClick={handleNewNote}>
          + New Note
        </Button>
      </div>

      {/* Body */}
      {empty ? (
        <div className="font-ui text-on-surface-variant flex flex-1 items-center justify-center text-[12px]">
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
      className="group border-outline-variant hover:bg-surface-container-low flex cursor-pointer items-center gap-2 border-b px-3 py-2"
      onClick={onOpen}
    >
      <div className="min-w-0 flex-1">
        <p className="font-content text-on-surface truncate text-[13px]">{preview}</p>
        <p className="font-ui text-on-surface-variant mt-0.5 text-[11px]">{date}</p>
      </div>
      <button
        className="text-on-surface-variant hover:text-error shrink-0 p-1 opacity-0 transition-opacity group-hover:opacity-100"
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
