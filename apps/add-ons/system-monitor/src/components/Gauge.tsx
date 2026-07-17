type GaugeProps = {
  label: string
  percent: number
  detail?: string
}

// htop-flavored meter: bar + numeric readout together, so the reading is
// never color-only (B&W-friendly; a later brief reskins visuals).
export function Gauge({ label, percent, detail }: GaugeProps) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0))
  const level = clamped >= 90 ? 'critical' : clamped >= 70 ? 'warn' : 'ok'
  const barColor =
    level === 'critical' ? 'bg-error' : level === 'warn' ? 'bg-secondary' : 'bg-primary'

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="font-ui text-on-surface-variant text-[11px] font-semibold tracking-wider uppercase">
          {label}
        </span>
        <span className="text-on-surface font-mono text-[13px] font-semibold">
          {clamped.toFixed(1)}%
        </span>
      </div>
      <div className="border-outline-variant bg-surface-container-lowest h-3 w-full border">
        <div
          className={`h-full ${barColor} transition-[width] duration-300 ease-out`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {detail && <span className="text-on-surface-variant font-mono text-[10px]">{detail}</span>}
    </div>
  )
}
