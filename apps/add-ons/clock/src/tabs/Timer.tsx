import { useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { Button, Input, cn } from '@imbatranim/core'
import { useClockStore } from '../clockStore'
import { useNow } from '../useNow'
import { formatClockDuration } from '../format'

const PRESETS_MIN = [1, 5, 10, 20, 30, 60]

export function Timer() {
  const timer = useClockStore((s) => s.timer)
  const setDuration = useClockStore((s) => s.setTimerDuration)
  const start = useClockStore((s) => s.startTimer)
  const pause = useClockStore((s) => s.pauseTimer)
  const reset = useClockStore((s) => s.resetTimer)
  const [customMinutes, setCustomMinutes] = useState('')

  // Ticks only while running; remaining is always endAt - Date.now(), so
  // pausing/resuming or switching tabs never drifts the countdown.
  const now = useNow(250, timer.running)
  const remaining =
    timer.running && timer.endAt !== null ? Math.max(0, timer.endAt - now) : timer.pausedRemainingMs

  const applyCustom = () => {
    const minutes = Number(customMinutes)
    if (!Number.isFinite(minutes) || minutes <= 0) return
    setDuration(Math.round(minutes * 60_000))
    setCustomMinutes('')
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col items-center justify-center gap-4 px-4 py-8">
        <span
          className={cn(
            'font-mono text-[36px] leading-none font-semibold tabular-nums',
            remaining === 0 && timer.fired ? 'text-error' : 'text-on-surface'
          )}
        >
          {formatClockDuration(remaining)}
        </span>
        <div className="flex items-center gap-2">
          {timer.running ? (
            <Button variant="default" size="sm" onClick={pause}>
              <Pause size={12} strokeWidth={2} />
              Pause
            </Button>
          ) : (
            <Button variant="primary" size="sm" onClick={start} disabled={remaining === 0}>
              <Play size={12} strokeWidth={2} />
              Start
            </Button>
          )}
          <Button variant="default" size="sm" onClick={reset}>
            <RotateCcw size={12} strokeWidth={2} />
            Reset
          </Button>
        </div>
      </div>

      <div className="border-outline-variant flex flex-col gap-2 border-t p-3">
        <p className="font-ui text-on-surface-variant text-[11px] font-semibold tracking-wider uppercase">
          Presets
        </p>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS_MIN.map((min) => (
            <Button
              key={min}
              variant="default"
              size="sm"
              disabled={timer.running}
              onClick={() => setDuration(min * 60_000)}
            >
              {min}m
            </Button>
          ))}
        </div>

        <p className="font-ui text-on-surface-variant mt-2 text-[11px] font-semibold tracking-wider uppercase">
          Custom
        </p>
        <div className="flex items-end gap-2">
          <Input
            type="number"
            min={1}
            placeholder="Minutes"
            value={customMinutes}
            disabled={timer.running}
            onChange={(e) => setCustomMinutes(e.target.value)}
            className="flex-1"
          />
          <Button
            variant="default"
            size="sm"
            onClick={applyCustom}
            disabled={timer.running || !customMinutes}
          >
            Set
          </Button>
        </div>
      </div>
    </div>
  )
}
