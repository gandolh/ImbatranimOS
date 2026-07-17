import type { AboutInfo } from '../api/systemApi'

function formatUptime(totalSeconds: number): string {
  const d = Math.floor(totalSeconds / 86400)
  const h = Math.floor((totalSeconds % 86400) / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const parts: string[] = []
  if (d) parts.push(`${d}d`)
  if (d || h) parts.push(`${h}h`)
  parts.push(`${m}m`)
  return parts.join(' ')
}

export function AboutPanel({ about }: { about: AboutInfo }) {
  const rows: [string, string][] = [
    ['Hostname', about.hostname],
    ['Kernel', about.kernel],
    ['Platform', `${about.platform} / ${about.arch}`],
    ['Uptime', formatUptime(about.uptimeSeconds)],
    ['Image Version', about.imageVersion],
  ]

  return (
    <div className="grid gap-2">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="flex items-center justify-between border border-outline-variant bg-surface-container-low px-3 py-2"
        >
          <span className="font-ui text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
            {label}
          </span>
          <span className="font-mono text-[12px] text-on-surface">{value}</span>
        </div>
      ))}
    </div>
  )
}
