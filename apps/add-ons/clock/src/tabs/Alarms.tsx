import { useState } from 'react'
import { Plus, Trash2, Info } from 'lucide-react'
import { Button, Checkbox, Input } from '@imbatranim/core'
import { useClockStore } from '../clockStore'
import type { Alarm } from '../clockStore'

function AddAlarmRow() {
  const addAlarm = useClockStore((s) => s.addAlarm)
  const [label, setLabel] = useState('')
  const [time, setTime] = useState('07:00')

  const handleAdd = () => {
    if (!time) return
    addAlarm(label.trim(), time)
    setLabel('')
  }

  return (
    <div className="flex items-end gap-2">
      <Input
        label="Time"
        type="time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        className="w-28"
      />
      <Input
        label="Label (optional)"
        placeholder="Wake up"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="flex-1"
      />
      <Button variant="primary" size="sm" onClick={handleAdd} disabled={!time}>
        <Plus size={12} strokeWidth={2} />
        Add
      </Button>
    </div>
  )
}

function AlarmRow({ alarm }: { alarm: Alarm }) {
  const toggleAlarm = useClockStore((s) => s.toggleAlarm)
  const removeAlarm = useClockStore((s) => s.removeAlarm)

  return (
    <div className="border-outline-variant group flex items-center justify-between border-b px-3 py-2">
      <div className="flex items-center gap-3">
        <Checkbox checked={alarm.enabled} onCheckedChange={() => toggleAlarm(alarm.id)} />
        <div>
          <p className="text-on-surface font-mono text-[15px] tabular-nums">{alarm.time}</p>
          {alarm.label && (
            <p className="font-ui text-on-surface-variant text-[11px]">{alarm.label}</p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => removeAlarm(alarm.id)}
        title="Remove alarm"
        className="text-on-surface-variant hover:text-error shrink-0 p-1 opacity-0 transition-opacity group-hover:opacity-100"
      >
        <Trash2 size={12} strokeWidth={2} />
      </button>
    </div>
  )
}

export function Alarms() {
  const alarms = useClockStore((s) => s.alarms)

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-2 p-3">
        <p className="font-ui text-on-surface-variant text-[11px] font-semibold tracking-wider uppercase">
          New alarm
        </p>
        <AddAlarmRow />
      </div>

      <div className="border-outline-variant bg-surface-container-low flex items-start gap-2 border-y px-3 py-2">
        <Info size={12} strokeWidth={2} className="text-on-surface-variant mt-0.5 shrink-0" />
        <p className="font-ui text-on-surface-variant text-[11px]">
          Alarms only fire while this Clock window stays open — there is no background/OS-level
          alarm. Closing the window (or the tab) silences it.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {alarms.length === 0 ? (
          <p className="font-ui text-on-surface-variant flex h-full items-center justify-center text-[12px]">
            No alarms set
          </p>
        ) : (
          alarms.map((a) => <AlarmRow key={a.id} alarm={a} />)
        )}
      </div>
    </div>
  )
}
