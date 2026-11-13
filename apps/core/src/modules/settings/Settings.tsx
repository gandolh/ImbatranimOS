import { useCallback, useEffect, useState } from "react";
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
} from "lucide-react";
import { useSystem } from "@imbatranim/ui";
import { Checkbox } from "../../shared/components/ui";
import { APP_REGISTRY } from "../../shared/registry/registry";
import { NON_DISABLEABLE } from "../../shared/registry/enabledApps";
import { useAddonStore } from "../../shared/store/addonStore";
import { ShortcutList } from "../../shared/components/shortcuts/ShortcutsOverlay";
import { StorageSettings } from "./StorageSettings";
import { OldDataSettings } from "./OldDataSettings";
import { BackupSettings } from "./BackupSettings";
import { DefaultAppsSettings } from "./DefaultAppsSettings";
import { StartupSettings } from "./StartupSettings";
import { LocalPasswordForm } from "../auth/LocalScreens";
import { AboutMachine } from "./AboutMachine";
import { AppearanceSettings } from "./AppearanceSettings";
import { MarketplaceSettings } from "./MarketplaceSettings";
import { LinuxAppsSettings } from "./LinuxAppsSettings";
import { UpdatesSettings } from "./UpdatesSettings";
import { useRegistryVersion } from "../../shared/registry/marketplace";

function SectionHeader({ icon: Icon, title }: { icon: typeof Monitor; title: string }) {
  return (
    <div className="gap-window-padding mt-double mb-window-padding max-[600px]:mb-double flex items-center max-[600px]:mt-[20px]">
      <div className="rounded-control border-outline-variant bg-surface-container text-primary flex h-[36px] w-[36px] shrink-0 items-center justify-center border">
        <Icon size={18} strokeWidth={1.75} />
      </div>
      <h2 className="font-ui text-on-surface text-lead font-semibold">{title}</h2>
    </div>
  );
}

export function Settings() {
  // Lifted so the footer and the About panel show the same version from one fetch,
  // rather than either hardcoding it or fetching twice.
  const [imageVersion, setImageVersion] = useState<string | null>(null);
  const onVersion = useCallback((v: string) => setImageVersion(v), []);

  const disabledApps = useAddonStore((s) => s.disabled);
  const toggleApp = useAddonStore((s) => s.toggle);
  // The Apps list includes installed marketplace apps.
  useRegistryVersion();

  // An intent `{ marketplace: <descriptor id> }` asks for that row of the
  // Marketplace pane. The counter lets the same row be asked for again.
  const system = useSystem();
  const [focusRow, setFocusRow] = useState<{ id: string; n: number } | null>(null);
  useEffect(
    () =>
      system.intents.onIntent((payload) => {
        const id = (payload as { marketplace?: unknown } | null | undefined)?.marketplace;
        if (typeof id === "string") setFocusRow((prev) => ({ id, n: (prev?.n ?? 0) + 1 }));
      }),
    [system],
  );

  return (
    // The window's body, surface-container-low like every floating layer
    // (2026-11-13). One scrolling page of sections, fading at its foot so the
    // next section shows it is there.
    <div className="bg-surface-container-low text-on-surface flex h-full flex-col select-none">
      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto [mask-image:linear-gradient(to_bottom,black_calc(100%-34px),transparent)] px-[28px] pt-[24px] pb-[34px] max-[600px]:px-[16px] max-[600px]:pt-[16px]">
        <header>
          <h1 className="font-display text-on-surface text-headline font-bold">Settings</h1>
          <p className="font-content text-on-surface-variant text-body mt-0.5">Tune the look of ImbatranimOS.</p>
        </header>

        {/* Appearance ─────────────────────────────────────────── */}
        <section className="mb-double">
          <SectionHeader icon={Palette} title="Appearance" />

          <AppearanceSettings />
        </section>

        {/* Apps ────────────────────────────────────────────────── */}
        <section className="mb-double">
          <SectionHeader icon={LayoutGrid} title="Apps" />
          <p className="text-on-surface-variant text-control mb-5">
            Turn add-ons on or off. Disabled apps disappear from Start, search, and the desktop — their code never
            loads. Core apps stay on so you can't lock yourself out.
          </p>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
            {APP_REGISTRY.map((app) => {
              const AppIcon = app.icon;
              const required = NON_DISABLEABLE.has(app.id);
              const enabled = required || !disabledApps.includes(app.id);
              return (
                <div
                  key={app.id}
                  className="rounded-control border-outline-variant bg-surface-container-low flex items-center gap-3 border px-3 py-2.5"
                >
                  <span className="rounded-control border-outline-variant bg-surface-container-lowest text-on-surface flex h-7 w-7 shrink-0 items-center justify-center border">
                    <AppIcon size={15} strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-ui text-on-surface text-body block truncate font-medium">{app.name}</span>
                    <span className="text-on-surface-variant text-label block truncate">{app.description}</span>
                  </span>
                  {required && <span className="text-on-surface-variant text-label font-semibold">Required</span>}
                  <Checkbox
                    aria-label={`Enable ${app.name}`}
                    checked={enabled}
                    disabled={required}
                    onCheckedChange={() => toggleApp(app.id)}
                  />
                </div>
              );
            })}
          </div>
        </section>

        {/* Marketplace ──────────────────────────────────────────── */}
        <section className="mb-double">
          <SectionHeader icon={Store} title="Marketplace" />
          <MarketplaceSettings focusRow={focusRow} />
        </section>

        {/* Linux apps ─────────────────────────────────────────── */}
        <section className="mb-double">
          <SectionHeader icon={Boxes} title="Linux apps" />
          <LinuxAppsSettings />
        </section>

        {/* Updates (for Linux apps) ──────────────────────────── */}
        <section className="mb-double">
          <SectionHeader icon={RefreshCw} title="Updates" />
          <UpdatesSettings />
        </section>

        {/* Storage ────────────────────────────────────────────── */}
        <section className="mb-double">
          <SectionHeader icon={HardDrive} title="Storage" />
          <StorageSettings />
          <OldDataSettings />
        </section>

        {/* Default apps ───────────────────────────────────────── */}
        <section className="mb-double">
          <SectionHeader icon={FileCog} title="Default apps" />
          <DefaultAppsSettings />
        </section>

        {/* Startup ────────────────────────────────────────────── */}
        <section className="mb-double">
          <SectionHeader icon={Power} title="Startup" />
          <StartupSettings />
        </section>

        {/* Backup ─────────────────────────────────────────────── */}
        <section className="mb-double">
          <SectionHeader icon={DatabaseBackup} title="Backup" />
          <BackupSettings />
        </section>

        {/* Keyboard ───────────────────────────────────────────── */}
        <section className="mb-double">
          <SectionHeader icon={Keyboard} title="Keyboard shortcuts" />
          <p className="font-ui text-on-surface-variant text-label mb-3">
            Press <span className="text-on-surface font-semibold">?</span> anywhere on the desktop to open this list.
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

      <div className="border-outline-variant bg-surface-container flex h-[36px] shrink-0 items-center justify-between border-t px-[12px] max-[600px]:hidden">
        <span className="font-display text-on-surface text-body font-bold">
          Imbatranim<span className="text-primary">OS</span>
        </span>
        {/* Driven by IMAGE_VERSION, not a literal. This said "v0.1 · preview" while
            package.json was at 1.0.0 — the OS reporting a version it was not. */}
        <span className="font-ui text-on-surface-variant text-label tabular-nums">
          {imageVersion ? `v${imageVersion}` : "—"}
        </span>
      </div>
    </div>
  );
}
