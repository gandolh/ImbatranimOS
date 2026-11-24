type GaugeProps = {
  label: string;
  percent: number;
  detail?: string;
};

// htop-flavored meter: bar + numeric readout together, so the reading is
// never color-only (B&W-friendly; a later brief reskins visuals).
export function Gauge({ label, percent, detail }: GaugeProps) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  const level = clamped >= 90 ? "critical" : clamped >= 70 ? "warn" : "ok";
  const barColor = level === "critical" ? "bg-error" : level === "warn" ? "bg-secondary" : "bg-primary";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="font-ui text-on-surface-variant text-label font-semibold tracking-wider uppercase">
          {label}
        </span>
        <span className="text-on-surface text-body font-mono font-semibold">{clamped.toFixed(1)}%</span>
      </div>
      <div className="rounded-control border-outline-variant bg-surface-container-lowest h-3 w-full overflow-hidden border">
        {/* Scaled, not sized: a transform transitions on the compositor, where a width
            transition laid the window out again on every frame of each poll's 300 ms. */}
        <div
          className={`h-full w-full origin-left ${barColor} transition-transform duration-300 ease-out motion-reduce:transition-none`}
          style={{ transform: `scaleX(${clamped / 100})` }}
        />
      </div>
      {detail && <span className="text-on-surface-variant text-tiny font-mono">{detail}</span>}
    </div>
  );
}
