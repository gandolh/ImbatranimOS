import { useWallpaperStore, type Wallpaper } from '../../shared/store/wallpaperStore'
import {
  useAppearanceStore,
  ACCENT_PRESETS,
  type ThemeMode,
} from '../../shared/store/appearanceStore'
import { Monitor, Palette, Moon, Sun, Check, Image } from 'lucide-react'
import { cn } from '../../lib/cn'
import { SecuritySettings } from '../auth/SecuritySettings'

const WALLPAPERS: { id: Wallpaper; name: string; preview: React.CSSProperties }[] = [
  {
    id: 'dots',
    name: 'Dots',
    preview: {
      backgroundImage: 'radial-gradient(var(--k-outline-variant) 1px, transparent 1px)',
      backgroundSize: '12px 12px',
      backgroundColor: 'var(--k-surface)',
    },
  },
  {
    id: 'grid',
    name: 'Grid',
    preview: {
      backgroundImage:
        'linear-gradient(var(--k-outline-variant) 1px, transparent 1px), linear-gradient(90deg, var(--k-outline-variant) 1px, transparent 1px)',
      backgroundSize: '16px 16px',
      backgroundColor: 'var(--k-surface)',
    },
  },
  {
    id: 'linen',
    name: 'Fine',
    preview: {
      backgroundImage:
        'radial-gradient(var(--k-outline-variant) 0.5px, transparent 0.5px), radial-gradient(var(--k-outline-variant) 0.5px, var(--k-surface) 0.5px)',
      backgroundSize: '6px 6px',
      backgroundPosition: '0 0, 3px 3px',
      backgroundColor: 'var(--k-surface)',
    },
  },
]

const THEMES: { id: ThemeMode; name: string; icon: typeof Moon }[] = [
  { id: 'dark', name: 'Dark', icon: Moon },
  { id: 'light', name: 'Light', icon: Sun },
]

function SectionHeader({ icon: Icon, title }: { icon: typeof Monitor; title: string }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center border border-outline-variant bg-surface-container text-primary">
        <Icon size={18} strokeWidth={1.75} />
      </div>
      <h2 className="font-ui text-base font-semibold text-on-surface">{title}</h2>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 font-ui text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant">
      {children}
    </p>
  )
}

export function Settings() {
  const { wallpaper, setWallpaper } = useWallpaperStore()
  const theme = useAppearanceStore((s) => s.theme)
  const accent = useAppearanceStore((s) => s.accent)
  const setTheme = useAppearanceStore((s) => s.setTheme)
  const setAccent = useAppearanceStore((s) => s.setAccent)

  return (
    <div className="flex h-full flex-col bg-surface text-on-surface select-none">
      <div className="custom-scrollbar flex-1 overflow-y-auto p-7">
        <header className="mb-8">
          <h1 className="font-ui text-2xl font-bold tracking-tight text-on-surface">Settings</h1>
          <p className="mt-1 text-[13px] text-on-surface-variant">Tune the look of ImbatranimOS.</p>
        </header>

        {/* Appearance ─────────────────────────────────────────── */}
        <section className="mb-10">
          <SectionHeader icon={Palette} title="Appearance" />

          {/* Theme */}
          <div className="mb-8">
            <FieldLabel>Theme</FieldLabel>
            <div className="flex gap-3">
              {THEMES.map((t) => {
                const Icon = t.icon
                const active = theme === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    className={cn(
                      'flex flex-1 items-center justify-center gap-2 border px-4 py-2.5 text-[12px] font-medium outline-none transition-colors',
                      'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
                      active
                        ? 'border-primary bg-primary text-on-primary'
                        : 'border-outline-variant bg-surface-container-low text-on-surface hover:bg-surface-container-high',
                    )}
                  >
                    <Icon size={15} strokeWidth={1.75} />
                    {t.name}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Accent */}
          <div className="mb-8">
            <FieldLabel>Accent color</FieldLabel>
            <div className="flex flex-wrap gap-3">
              {ACCENT_PRESETS.map((preset) => {
                const active = accent === preset.id
                return (
                  <button
                    key={preset.id}
                    onClick={() => setAccent(preset.id)}
                    title={preset.name}
                    aria-label={preset.name}
                    aria-pressed={active}
                    className={cn(
                      'group flex items-center gap-2 border px-2.5 py-2 outline-none transition-colors',
                      'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
                      active
                        ? 'border-primary bg-surface-container-high'
                        : 'border-outline-variant bg-surface-container-low hover:bg-surface-container',
                    )}
                  >
                    <span
                      className="flex h-6 w-6 items-center justify-center"
                      style={{ backgroundColor: preset.hex, color: preset.on }}
                    >
                      {active && <Check size={13} strokeWidth={3} />}
                    </span>
                    <span className="pr-1 text-[12px] font-medium text-on-surface">{preset.name}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Wallpaper */}
          <div>
            <FieldLabel>Desktop pattern</FieldLabel>
            <div className="grid grid-cols-3 gap-4">
              {WALLPAPERS.map((wp) => {
                const active = wallpaper === wp.id
                return (
                  <button
                    key={wp.id}
                    onClick={() => setWallpaper(wp.id)}
                    className={cn(
                      'group relative overflow-hidden border outline-none transition-colors',
                      'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
                      active ? 'border-primary' : 'border-outline-variant hover:border-outline',
                    )}
                  >
                    <div className="aspect-[16/10] w-full" style={wp.preview} />
                    {active && (
                      <div className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center bg-primary text-on-primary">
                        <Check size={12} strokeWidth={3} />
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 border-t border-outline-variant bg-surface-container-low px-2 py-1.5">
                      <Image size={12} strokeWidth={1.75} className="text-on-surface-variant" />
                      <span className="text-[11px] font-medium text-on-surface">{wp.name}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        {/* Security ───────────────────────────────────────────── */}
        <SecuritySettings />

        {/* About ──────────────────────────────────────────────── */}
        <section className="mb-6 border-t border-outline-variant pt-8">
          <SectionHeader icon={Monitor} title="About this machine" />
          <div className="grid gap-2">
            {[
              { label: 'OS', value: 'ImbatranimOS' },
              { label: 'Shell', value: 'React desktop on Alpine' },
              { label: 'Status', value: 'Developer Preview' },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between border border-outline-variant bg-surface-container-low px-3 py-2.5"
              >
                <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
                  {item.label}
                </span>
                <span className="font-ui text-[13px] font-semibold text-on-surface">{item.value}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="flex items-center justify-between border-t border-outline-variant bg-surface-container-low px-7 py-3">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
          ImbatranimOS
        </span>
        <span className="font-ui text-[10px] tabular-nums text-on-surface-variant">v0.1 · preview</span>
      </div>
    </div>
  )
}
