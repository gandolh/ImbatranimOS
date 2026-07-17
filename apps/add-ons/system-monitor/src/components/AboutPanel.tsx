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
          className="border-outline-variant bg-surface-container-low flex items-center justify-between border px-3 py-2"
        >
          <span className="font-ui text-on-surface-variant text-[10px] font-semibold tracking-wider uppercase">
            {label}
          </span>
          <span className="text-on-surface font-mono text-[12px]">{value}</span>
        </div>
      ))}
    </div>
  )
}
