import { useEffect, useRef, useState } from 'react'
import { GripVertical, X } from 'lucide-react'
import { useDrag } from '@use-gesture/react'
import { cn } from '../../lib/cn'
import { ScrollArea } from '../../shared/components/ui/ScrollArea'
import {
  useCreateTodoMutation,
  useDeleteTodoMutation,
  useReorderTodosMutation,
  useTodosQuery,
  useUpdateTodoMutation,
} from './queries/todosQueries'
import type { Filter, Todo } from './types'

const ROW_H = 36

// ---------------------------------------------------------------------------
// TodoRow
// ---------------------------------------------------------------------------
function TodoRow({
  todo,
  index,
  total,
  onUpdate,
  onDelete,
  onDragEnd,
}: {
  todo: Todo
  index: number
  total: number
  onUpdate: (id: number, data: { text?: string; completed?: boolean }) => void
  onDelete: (id: number) => void
  onDragEnd: (fromIndex: number, toIndex: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(todo.text)
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOffset, setDragOffset] = useState(0)
  const [dragging, setDragging] = useState(false)

  const completed = Boolean(todo.completed)

  const bind = useDrag(
    ({ movement: [, my], active, last }) => {
      setDragging(active)
      setDragOffset(active ? my : 0)
      if (last) {
        const toIndex = Math.max(0, Math.min(total - 1, index + Math.round(my / ROW_H)))
        if (toIndex !== index) onDragEnd(index, toIndex)
        setDragOffset(0)
      }
    },
    { filterTaps: true },
  )

  function commitEdit() {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== todo.text) onUpdate(todo.id, { text: trimmed })
    else setDraft(todo.text)
    setEditing(false)
  }

  function cancelEdit() {
    setDraft(todo.text)
    setEditing(false)
  }

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  return (
    <div
      className={cn(
        'group relative flex h-9 items-center gap-1.5 border-b border-outline-variant px-2',
        dragging && 'z-10 bg-surface-container-low opacity-90',
      )}
      style={{ transform: dragging ? `translateY(${dragOffset}px)` : undefined }}
    >
      {/* Drag handle */}
      <span
        {...bind()}
        className="flex cursor-grab items-center opacity-0 group-hover:opacity-100 active:cursor-grabbing"
        style={{ touchAction: 'none' }}
      >
        <GripVertical size={14} className="text-on-surface-variant" />
      </span>

      {/* Checkbox */}
      <button
        type="button"
        onClick={() => onUpdate(todo.id, { completed: !completed })}
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center border',
          completed
            ? 'border-primary-container bg-primary-container'
            : 'border-outline-variant bg-transparent',
        )}
        aria-label={completed ? 'Mark incomplete' : 'Mark complete'}
      >
        {completed && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
          </svg>
        )}
      </button>

      {/* Text — inline edit */}
      {editing ? (
        <input
          ref={inputRef}
          className="font-content min-w-0 flex-1 bg-transparent text-[13px] text-on-surface outline-none"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitEdit()
            if (e.key === 'Escape') cancelEdit()
          }}
        />
      ) : (
        <span
          className={cn(
            'font-content min-w-0 flex-1 cursor-text truncate text-[13px] text-on-surface',
            completed && 'opacity-50 line-through',
          )}
          onClick={() => setEditing(true)}
        >
          {todo.text}
        </span>
      )}

      {/* Delete */}
      <button
        type="button"
        onClick={() => onDelete(todo.id)}
        className="shrink-0 p-0.5 text-on-surface-variant opacity-0 group-hover:opacity-100 hover:text-error"
        aria-label="Delete task"
      >
        <X size={13} />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Todo (root export)
// ---------------------------------------------------------------------------
export function Todo({ windowId: _windowId }: { windowId: string }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [addText, setAddText] = useState('')
  const { data: serverItems = [] } = useTodosQuery(filter)
  const [items, setItems] = useState<Todo[]>([])

  // Sync local items when server data changes (but not during drag)
  useEffect(() => {
    setItems(serverItems)
  }, [serverItems])

  const createMutation = useCreateTodoMutation()
  const updateMutation = useUpdateTodoMutation()
  const deleteMutation = useDeleteTodoMutation()
  const reorderMutation = useReorderTodosMutation()

  function handleDragEnd(fromIndex: number, toIndex: number) {
    const next = [...items]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    setItems(next)
    reorderMutation.mutate(next.map((t) => t.id))
  }

  function handleAdd() {
    const text = addText.trim()
    if (!text) return
    setAddText('')
    createMutation.mutate(text)
  }

  const emptyMessages: Record<Filter, string> = {
    all: 'No tasks',
    active: 'Nothing active',
    completed: 'Nothing completed',
  }

  const tabs: Filter[] = ['all', 'active', 'completed']

  return (
    <div className="flex h-full flex-col bg-surface-container-lowest">
      {/* Filter tabs */}
      <div className="flex h-8 items-center border-b border-outline-variant">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setFilter(tab)}
            className={cn(
              'font-ui flex h-full items-center px-3 text-[12px] text-on-surface-variant capitalize',
              filter === tab &&
                'border-b-2 border-primary font-semibold text-on-surface',
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Task list */}
      <ScrollArea className="flex-1">
        {items.length === 0 ? (
          <div className="flex h-20 items-center justify-center font-ui text-[12px] text-on-surface-variant">
            {emptyMessages[filter]}
          </div>
        ) : (
          items.map((todo, i) => (
            <TodoRow
              key={todo.id}
              todo={todo}
              index={i}
              total={items.length}
              onUpdate={(id, data) => updateMutation.mutate({ id, data })}
              onDelete={(id) => deleteMutation.mutate(id)}
              onDragEnd={handleDragEnd}
            />
          ))
        )}
      </ScrollArea>

      {/* Add task input */}
      <div className="flex h-9 items-center border-t border-outline-variant bg-surface-container-low px-2">
        <input
          className="font-content min-w-0 flex-1 bg-transparent text-[13px] text-on-surface outline-none placeholder:text-on-surface-variant"
          placeholder="Add a task…"
          value={addText}
          onChange={(e) => setAddText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd()
          }}
        />
      </div>
    </div>
  )
}
