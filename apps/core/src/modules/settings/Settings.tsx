import { useCallback, useState } from 'react'
import {
  Monitor,
  Palette,
  LayoutGrid,
  Keyboard,
  HardDrive,
  DatabaseBackup,
  FileCog,
  Power,
  Store,
  Boxes,
  RefreshCw,
} from 'lucide-react'
import { Checkbox } from '../../shared/components/ui'
import { APP_REGISTRY } from '../../shared/registry/registry'
import { NON_DISABLEABLE } from '../../shared/registry/enabledApps'
import { useAddonStore } from '../../shared/store/addonStore'
import { ShortcutList } from '../../shared/components/shortcuts/ShortcutsOverlay'
import { StorageSettings } from './StorageSettings'
import { BackupSettings } from './BackupSettings'
import { DefaultAppsSettings } from './DefaultAppsSettings'
import { StartupSettings } from './StartupSettings'
import { LocalPasswordForm } from '../auth/LocalScreens'
import { AboutMachine } from './AboutMachine'
import { AppearanceSettings } from './AppearanceSettings'
import { MarketplaceSettings } from './MarketplaceSettings'
import { LinuxAppsSettings } from './LinuxAppsSettings'
import { UpdatesSettings } from './UpdatesSettings'
import { useRegistryVersion } from '../../shared/registry/marketplace'

function SectionHeader({ icon: Icon, title }: { icon: typeof Monitor; title: string }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <div className="rounded-control border-outline-variant bg-surface-container text-primary flex h-9 w-9 items-center justify-center border">
        <Icon size={18} strokeWidth={1.75} />
      </div>
      <h2 className="font-ui text-on-surface text-base font-semibold">{title}</h2>
    </div>
  )
}

export function Settings() {
  // Lifted so the footer and the About panel show the same version from one fetch,
  // rather than either hardcoding it or fetching twice.
  const [imageVersion, setImageVersion] = useState<string | null>(null)
  const onVersion = useCallback((v: string) => setImageVersion(v), [])

  const disabledApps = useAddonStore((s) => s.disabled)
  const toggleApp = useAddonStore((s) => s.toggle)
  // The Apps list includes installed marketplace apps.
  useRegistryVersion()

  return (
    <div className="bg-surface text-on-surface flex h-full flex-col select-none">
      <div className="custom-scrollbar flex-1 overflow-y-auto p-7">
        <header className="mb-8">
          <h1 className="font-ui text-on-surface text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-on-surface-variant mt-1 text-[13px]">Tune the look of ImbatranimOS.</p>
        </header>

        {/* Appearance ─────────────────────────────────────────── */}
        <section className="mb-10">
          <SectionHeader icon={Palette} title="Appearance" />

          <AppearanceSettings />
        </section>

        {/* Apps ────────────────────────────────────────────────── */}
        <section className="mb-10">
          <SectionHeader icon={LayoutGrid} title="Apps" />
          <p className="text-on-surface-variant mb-5 text-[12px]">
            Turn add-ons on or off. Disabled apps disappear from Start, search, and the desktop —
            their code never loads. Core apps stay on so you can't lock yourself out.
          </p>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
            {APP_REGISTRY.map((app) => {
              const AppIcon = app.icon
              const required = NON_DISABLEABLE.has(app.id)
              const enabled = required || !disabledApps.includes(app.id)
              return (
                <div
                  key={app.id}
                  className="rounded-control border-outline-variant bg-surface-container-low flex items-center gap-3 border px-3 py-2.5"
                >
                  <span className="rounded-control border-outline-variant bg-surface-container-lowest text-on-surface flex h-7 w-7 shrink-0 items-center justify-center border">
                    <AppIcon size={15} strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-ui text-on-surface block truncate text-[13px] font-medium">
                      {app.name}
                    </span>
                    <span className="text-on-surface-variant block truncate text-[11px]">
                      {app.description}
                    </span>
                  </span>
                  {required && (
                    <span className="text-on-surface-variant text-[9px] font-semibold tracking-widest uppercase">
                      Required
                    </span>
                  )}
                  <Checkbox
                    aria-label={`Enable ${app.name}`}
                    checked={enabled}
                    disabled={required}
                    onCheckedChange={() => toggleApp(app.id)}
                  />
                </div>
              )
            })}
          </div>
        </section>

        {/* Marketplace ──────────────────────────────────────────── */}
        <section className="mb-10">
          <SectionHeader icon={Store} title="Marketplace" />
          <MarketplaceSettings />
        </section>

        {/* Linux apps ─────────────────────────────────────────── */}
        <section className="mb-10">
          <SectionHeader icon={Boxes} title="Linux apps" />
          <LinuxAppsSettings />
        </section>

        {/* Updates (for Linux apps) ──────────────────────────── */}
        <section className="mb-10">
          <SectionHeader icon={RefreshCw} title="Updates" />
          <UpdatesSettings />
        </section>

        {/* Storage ────────────────────────────────────────────── */}
        <section className="mb-10">
          <SectionHeader icon={HardDrive} title="Storage" />
          <StorageSettings />
        </section>

        {/* Default apps ───────────────────────────────────────── */}
        <section className="mb-10">
          <SectionHeader icon={FileCog} title="Default apps" />
          <DefaultAppsSettings />
        </section>

        {/* Startup ────────────────────────────────────────────── */}
        <section className="mb-10">
          <SectionHeader icon={Power} title="Startup" />
          <StartupSettings />
        </section>

        {/* Backup ─────────────────────────────────────────────── */}
        <section className="mb-10">
          <SectionHeader icon={DatabaseBackup} title="Backup" />
          <BackupSettings />
        </section>

        {/* Keyboard ───────────────────────────────────────────── */}
        <section className="mb-10">
          <SectionHeader icon={Keyboard} title="Keyboard shortcuts" />
          <p className="font-ui text-on-surface-variant mb-3 text-[11px]">
            Press <span className="text-on-surface font-semibold">?</span> anywhere on the desktop
            to open this list.
          </p>
          <ShortcutList />
        </section>

        {/* Security ───────────────────────────────────────────── */}
        <section className="border-outline-variant mb-6 border-t pt-8">
          <SectionHeader icon={Monitor} title="Security" />
          {/* The machine's own password. */}
          <LocalPasswordForm />
        </section>

        {/* About ──────────────────────────────────────────────── */}
        <section className="border-outline-variant mb-6 border-t pt-8">
          <SectionHeader icon={Monitor} title="About this machine" />
          <AboutMachine onVersion={onVersion} />
        </section>
      </div>

      <div className="border-outline-variant bg-surface-container-low flex items-center justify-between border-t px-7 py-3">
        <span className="text-on-surface-variant text-[10px] font-semibold tracking-widest uppercase">
          ImbatranimOS
        </span>
        {/* Driven by IMAGE_VERSION, not a literal. This said "v0.1 · preview" while
            package.json was at 1.0.0 — the OS reporting a version it was not. */}
        <span className="font-ui text-on-surface-variant text-[10px] tabular-nums">
          {imageVersion ? `v${imageVersion}` : '—'}
        </span>
      </div>
    </div>
  )
}
