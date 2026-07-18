import { useState } from 'react'
import dayjs from 'dayjs'
import { Button, Checkbox, Dialog, Input, Select, useConfirm } from '@imbatranim/core'
import type { CalendarEvent, CalendarEventInput, EventDialogState } from './types'

const REMINDER_OPTIONS = [
  { value: 'none', label: 'No reminder' },
  { value: '5', label: '5 minutes before' },
  { value: '10', label: '10 minutes before' },
  { value: '15', label: '15 minutes before' },
  { value: '30', label: '30 minutes before' },
  { value: '60', label: '1 hour before' },
]

type EventDialogProps = {
  state: EventDialogState | null
  onClose: () => void
  onCreate: (input: CalendarEventInput) => void
  onUpdate: (id: string, patch: Partial<CalendarEventInput>) => void
  onDelete: (id: string) => void
}

type FormState = {
  title: string
  notes: string
  allDay: boolean
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  reminder: string
}

function toDate(ms: number): string {
  return dayjs(ms).format('YYYY-MM-DD')
}

function toTime(ms: number): string {
  return dayjs(ms).format('HH:mm')
}

function formFromEvent(event: CalendarEvent): FormState {
  return {
    title: event.title,
    notes: event.notes ?? '',
    allDay: event.allDay,
    startDate: toDate(event.start),
    startTime: toTime(event.start),
    endDate: toDate(event.end),
    endTime: toTime(event.end),
    reminder: event.reminderMinutes ? String(event.reminderMinutes) : 'none',
  }
}

function formFromSlot(start: number, end: number, allDay: boolean): FormState {
  return {
    title: '',
    notes: '',
    allDay,
    startDate: toDate(start),
    startTime: toTime(start),
    endDate: toDate(end),
    endTime: toTime(end),
    reminder: 'none',
  }
}

/** Stable identity for a dialog state — used to resync the form when the
 * caller swaps in a different event/slot (state adjustment during render,
 * not an effect — mirrors the resync idiom used by Bookmarks/StickyNotes). */
function stateKey(state: EventDialogState | null): string {
  if (!state) return 'closed'
  return state.mode === 'edit' ? `edit-${state.event.id}` : `create-${state.start}-${state.end}`
}

export function EventDialog({ state, onClose, onCreate, onUpdate, onDelete }: EventDialogProps) {
  const { confirm, confirmDialog } = useConfirm()

  const [form, setForm] = useState<FormState>(() =>
    state
      ? state.mode === 'edit'
        ? formFromEvent(state.event)
        : formFromSlot(state.start, state.end, state.allDay)
      : formFromSlot(Date.now(), Date.now(), true)
  )
  const [key, setKey] = useState(() => stateKey(state))
  const [error, setError] = useState<string | null>(null)

  const nextKey = stateKey(state)
  if (nextKey !== key) {
    setKey(nextKey)
    setError(null)
    if (state) {
      setForm(
        state.mode === 'edit'
          ? formFromEvent(state.event)
          : formFromSlot(state.start, state.end, state.allDay)
      )
    }
  }

  function buildInput(): CalendarEventInput | null {
    if (!form.title.trim()) {
      setError('Title is required.')
      return null
    }

    const start = form.allDay
      ? dayjs(form.startDate).startOf('day')
      : dayjs(`${form.startDate}T${form.startTime}`)
    const end = form.allDay
      ? dayjs(form.endDate).endOf('day')
      : dayjs(`${form.endDate}T${form.endTime}`)

    if (end.isBefore(start)) {
      setError('End must be after start.')
      return null
    }

    return {
      title: form.title.trim(),
      notes: form.notes.trim() || undefined,
      allDay: form.allDay,
      start: start.valueOf(),
      end: end.valueOf(),
      reminderMinutes: form.reminder === 'none' ? undefined : Number(form.reminder),
    }
  }

  function handleSave() {
    const input = buildInput()
    if (!input) return
    if (state?.mode === 'edit') {
      onUpdate(state.event.id, input)
    } else {
      onCreate(input)
    }
    onClose()
  }

  async function handleDelete() {
    if (state?.mode !== 'edit') return
    const ok = await confirm({
      title: 'Delete event',
      message: `Delete "${state.event.title}"?`,
      destructive: true,
    })
    if (ok) {
      onDelete(state.event.id)
      onClose()
    }
  }

  return (
    <>
      <Dialog
        open={state !== null}
        onOpenChange={(next) => !next && onClose()}
        title={state?.mode === 'edit' ? 'Edit event' : 'New event'}
        className="w-[360px]"
      >
        <div className="flex flex-col gap-3">
          <Input
            label="Title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Event title"
            autoFocus
          />

          <Checkbox
            label="All day"
            checked={form.allDay}
            onCheckedChange={(checked) => setForm((f) => ({ ...f, allDay: checked === true }))}
          />

          <div className="flex gap-2">
            <Input
              label="Start date"
              type="date"
              value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
            />
            {!form.allDay && (
              <Input
                label="Start time"
                type="time"
                value={form.startTime}
                onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
              />
            )}
          </div>

          <div className="flex gap-2">
            <Input
              label="End date"
              type="date"
              value={form.endDate}
              onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
            />
            {!form.allDay && (
              <Input
                label="End time"
                type="time"
                value={form.endTime}
                onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
              />
            )}
          </div>

          <Select
            label="Reminder"
            options={REMINDER_OPTIONS}
            value={form.reminder}
            onValueChange={(value) => setForm((f) => ({ ...f, reminder: value as string }))}
          />

          <label className="flex flex-col gap-1">
            <span className="font-ui text-on-surface-variant text-[11px] font-semibold tracking-wider uppercase">
              Notes
            </span>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Optional notes"
              rows={3}
              className="border-outline-variant bg-surface-container-lowest font-content text-on-surface focus:border-primary focus:ring-primary/40 w-full resize-none border px-2.5 py-1.5 text-[13px] outline-none focus:ring-2"
            />
          </label>

          {error && <p className="text-error text-[11px]">{error}</p>}

          <div className="mt-1 flex items-center justify-between">
            <div>
              {state?.mode === 'edit' && (
                <Button variant="destructive" size="sm" onClick={handleDelete}>
                  Delete
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="default" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleSave}>
                Save
              </Button>
            </div>
          </div>
        </div>
      </Dialog>
      {confirmDialog}
    </>
  )
}
