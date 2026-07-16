import { useWallpaperStore, type Wallpaper } from '../../shared/store/wallpaperStore'
import { Monitor, Check } from 'lucide-react'

const WALLPAPERS: { id: Wallpaper; name: string; preview: string }[] = [
  {
    id: 'dots',
    name: 'Dots',
    preview: 'radial-gradient(#c3c6d0 1px, transparent 1px)',
  },
  {
    id: 'grid',
    name: 'Grid',
    preview:
      'linear-gradient(#c3c6d0 1px, transparent 1px), linear-gradient(90deg, #c3c6d0 1px, transparent 1px)',
  },
  {
    id: 'linen',
    name: 'Linen',
    preview: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4'%3E%3Crect width='4' height='4' fill='%23faf9f8'/%3E%3Crect width='1' height='1' x='0' y='0' fill='%23c3c6d0' opacity='0.25'/%3E%3Crect width='1' height='1' x='2' y='2' fill='%23c3c6d0' opacity='0.2'/%3E%3C/svg%3E")`,
  },
]

export function Settings() {
  const { wallpaper: currentWallpaper, setWallpaper } = useWallpaperStore()

  return (
    <div className="flex flex-col h-full bg-surface select-none">
      <div className="p-8 overflow-y-auto flex-1 custom-scrollbar">
        <header className="mb-10">
          <h1 className="text-3xl font-bold font-ui text-primary tracking-tight">Settings</h1>
          <p className="text-sm text-on-surface-variant mt-1">Manage your workspace preferences</p>
        </header>

        <section className="mb-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-primary/10 text-primary">
              <Monitor size={20} />
            </div>
            <h2 className="text-xl font-semibold font-ui">Personalization</h2>
          </div>

          <div className="space-y-8">
            <div>
              <div className="flex items-baseline justify-between mb-4">
                <p className="text-sm font-medium text-on-surface">Desktop Wallpaper</p>
                <p className="text-xs text-on-surface-variant italic">Choose a pattern that fits your style</p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                {WALLPAPERS.map((wp) => (
                  <button
                    key={wp.id}
                    onClick={() => setWallpaper(wp.id)}
                    className={`group relative aspect-[16/10] cursor-pointer border-2 transition-all duration-300 ${currentWallpaper === wp.id
                      ? 'border-primary shadow-[4px_4px_0_rgba(64,95,142,0.2)]'
                      : 'border-outline-variant hover:border-outline hover:translate-y-[-2px]'
                      }`}
                  >
                    <div
                      className="absolute inset-0 transition-transform duration-500 group-hover:scale-105"
                      style={{
                        backgroundImage: wp.preview,
                        backgroundSize: wp.id === 'dots' ? '12px 12px' : wp.id === 'grid' ? '16px 16px' : 'repeat',
                        backgroundColor: '#faf9f8'
                      }}
                    />

                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />

                    {currentWallpaper === wp.id && (
                      <div className="absolute top-3 right-3 bg-primary text-white p-1.5 shadow-md transform scale-110">
                        <Check size={14} strokeWidth={3} />
                      </div>
                    )}

                    <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/40 to-transparent">
                      <span className="text-[12px] font-bold text-white drop-shadow-sm">
                        {wp.name}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mb-10 pt-10 border-t border-outline-variant">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-secondary/10 text-secondary">
              <span className="text-xl font-bold font-ui">i</span>
            </div>
            <h2 className="text-xl font-semibold font-ui text-on-surface">System Information</h2>
          </div>

          <div className="grid gap-4">
            {[
              { label: 'OS', value: 'Minimal Web Desktop' },
              { label: 'Environment', value: 'Vite + React + Tailwind CSS' },
              { label: 'Status', value: 'Developer Preview' }
            ].map(item => (
              <div key={item.label} className="flex justify-between items-center p-3 bg-surface-container-low border border-outline-variant">
                <span className="text-xs font-medium text-on-surface-variant uppercase tracking-wider">{item.label}</span>
                <span className="text-sm font-semibold text-primary font-ui">{item.value}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="px-8 py-4 bg-surface-container-low border-t border-outline-variant flex justify-between items-center">
        <div className="flex gap-4">
          <span className="text-[10px] text-on-surface-variant hover:text-primary cursor-help transition-colors font-bold uppercase tracking-widest">Privacy</span>
          <span className="text-[10px] text-on-surface-variant hover:text-primary cursor-help transition-colors font-bold uppercase tracking-widest">Terms</span>
        </div>
        <p className="text-[10px] text-on-surface-variant font-mono">
          BUILD // 2024.05.01
        </p>
      </div>
    </div>
  )
}
