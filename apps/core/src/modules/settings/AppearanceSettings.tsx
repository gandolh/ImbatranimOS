import { useId, type CSSProperties, type ReactNode } from "react";
import { Check, Image, Moon, Sun } from "lucide-react";
import { Radio, RadioGroup } from "@imbatranim/ui";
import { cn } from "../../lib/cn";
import {
  ACCENT_PRESETS,
  THEME_IDS,
  useAppearanceStore,
  type Mode,
  type ThemeId,
} from "../../shared/store/appearanceStore";
import { useCurrentWallpaper, useWallpaperStore } from "../../shared/store/wallpaperStore";
import { WALLPAPERS, wallpaperById } from "../../shared/components/desktop/wallpapers";

const THEME_NAMES: Record<ThemeId, string> = { apricot: "Apricot", classic: "Classic" };

const MODES: { id: Mode; name: string; icon: typeof Moon }[] = [
  { id: "light", name: "Light", icon: Sun },
  { id: "dark", name: "Dark", icon: Moon },
];

const FOCUS_RING = "focus-visible:ring-primary focus-visible:ring-2 focus-visible:ring-inset";

/**
 * Settings → Appearance: Theme, Mode, Accent, Wallpaper, top to bottom
 * (decisions-themes.md, 2026-11-02). Accent and Wallpaper list the current
 * theme's options; choosing a theme brings back that theme's own saved accent
 * and wallpaper. Each group is a radio group: Tab reaches its chosen option,
 * the arrow keys move between options, Space or Enter chooses.
 */
export function AppearanceSettings() {
  const theme = useAppearanceStore((s) => s.theme);
  const mode = useAppearanceStore((s) => s.mode);
  const accent = useAppearanceStore((s) => s.accents[s.theme]);
  const setTheme = useAppearanceStore((s) => s.setTheme);
  const setMode = useAppearanceStore((s) => s.setMode);
  const setAccent = useAppearanceStore((s) => s.setAccent);
  const wallpaper = useCurrentWallpaper();
  const setWallpaper = useWallpaperStore((s) => s.setWallpaper);

  return (
    <>
      <Group label="Theme" value={theme} onValueChange={setTheme} className="flex flex-wrap gap-4">
        {THEME_IDS.map((id) => (
          <ThemeCard key={id} id={id} chosen={theme === id} />
        ))}
      </Group>

      <Group label="Mode" value={mode} onValueChange={setMode} className="flex gap-3">
        {MODES.map((m) => {
          const Icon = m.icon;
          const chosen = mode === m.id;
          return (
            <Option
              key={m.id}
              value={m.id}
              className={cn(
                "rounded-control text-control flex flex-1 items-center justify-center gap-2 border px-4 py-2.5 font-medium transition-colors",
                FOCUS_RING,
                chosen
                  ? "border-primary bg-primary-container text-on-primary-container"
                  : "border-outline-variant bg-surface-container-low text-on-surface hover:bg-surface-container-high",
              )}
            >
              <Icon size={15} strokeWidth={1.75} />
              {m.name}
            </Option>
          );
        })}
      </Group>

      <Group label="Accent" value={accent} onValueChange={setAccent} className="flex flex-wrap gap-3">
        {ACCENT_PRESETS[theme].map((preset) => {
          const chosen = accent === preset.id;
          return (
            <Option
              key={preset.id}
              value={preset.id}
              title={preset.name}
              className={cn(
                "group rounded-control flex items-center gap-2 border px-2.5 py-2 transition-colors",
                FOCUS_RING,
                chosen
                  ? "border-primary bg-surface-container-high"
                  : "border-outline-variant bg-surface-container-low hover:bg-surface-container",
              )}
            >
              <span
                className="rounded-control flex h-6 w-6 items-center justify-center"
                style={{ backgroundColor: preset[mode].soft, color: preset[mode].softOn }}
              >
                {chosen && <Check size={13} strokeWidth={3} />}
              </span>
              <span className="text-on-surface text-control pr-1 font-medium">{preset.name}</span>
            </Option>
          );
        })}
      </Group>

      <Group label="Wallpaper" value={wallpaper} onValueChange={setWallpaper} className="grid grid-cols-3 gap-4" last>
        {WALLPAPERS[theme].map((wp) => {
          const chosen = wallpaper === wp.id;
          return (
            <Option
              key={wp.id}
              value={wp.id}
              className={cn(
                "group rounded-control relative overflow-hidden border transition-colors",
                FOCUS_RING,
                chosen ? "border-primary" : "border-outline-variant hover:border-outline",
              )}
            >
              <div className="aspect-[16/10] w-full" style={wp.preview} />
              {chosen && <ChosenBadge />}
              <div className="border-outline-variant bg-surface-container-low flex items-center gap-1.5 border-t px-2 py-1.5">
                <Image size={12} strokeWidth={1.75} className="text-on-surface-variant" />
                <span className="text-on-surface text-label font-medium">{wp.name}</span>
              </div>
            </Option>
          );
        })}
      </Group>
    </>
  );
}

/**
 * A theme's preview: a small desktop drawn with that theme's own values in the
 * current mode. The drawing sits under its own `data-os-theme`/`data-theme`,
 * which the token blocks in index.css match on any element, and carries the
 * theme's saved accent; the frame, ring and badge around it are the current
 * theme's.
 */
function ThemeCard({ id, chosen }: { id: ThemeId; chosen: boolean }) {
  const mode = useAppearanceStore((s) => s.mode);
  const accentId = useAppearanceStore((s) => s.accents[id]);
  const wallpaperId = useWallpaperStore((s) => s.wallpapers[id]);
  const presets = ACCENT_PRESETS[id];
  const colours = (presets.find((p) => p.id === accentId) ?? presets[0])[mode];
  const scope = {
    "--accent": colours.strong,
    "--accent-on": colours.strongOn,
    "--accent-soft": colours.soft,
    "--accent-soft-on": colours.softOn,
    ...wallpaperById(wallpaperId).preview,
  } as CSSProperties;

  return (
    <Option
      value={id}
      aria-label={`${THEME_NAMES[id]} theme`}
      className={cn(
        "group flex w-36 flex-col gap-1.5 text-left",
        "focus-visible:ring-primary focus-visible:ring-offset-surface rounded-control focus-visible:ring-2 focus-visible:ring-offset-2",
      )}
    >
      <span
        className={cn(
          "rounded-control relative block aspect-[132/80] w-full overflow-hidden border transition-colors",
          chosen ? "border-primary" : "border-outline-variant group-hover:border-outline",
        )}
      >
        <span data-os-theme={id} data-theme={mode} className="absolute inset-0" style={scope}>
          <span
            className="absolute overflow-hidden"
            style={{
              left: "18%",
              top: "14%",
              width: "58%",
              height: "58%",
              background: "var(--k-surface-container-lowest)",
              border: "1px solid var(--k-outline-variant)",
              borderRadius: "calc(var(--k-radius-window) * 0.4)",
            }}
          >
            <span
              className="block"
              style={{
                height: "22%",
                background: "var(--k-surface-container-high)",
                borderBottom: "1px solid var(--k-outline-variant)",
              }}
            />
            <span
              className="block"
              style={{
                width: "45%",
                height: 6,
                margin: "7px 6px 4px",
                background: "var(--accent-soft)",
                borderRadius: "calc(var(--k-radius-control) * 0.4)",
              }}
            />
            <span
              className="block"
              style={{
                width: "66%",
                height: 4,
                margin: "0 6px",
                background: "var(--k-outline-variant)",
                borderRadius: "calc(var(--k-radius-control) * 0.4)",
              }}
            />
          </span>
          <span
            className="absolute inset-x-0 bottom-0"
            style={{
              height: "14%",
              background: "var(--k-surface-container-low)",
              borderTop: "1px solid var(--k-outline-variant)",
            }}
          />
        </span>
        {chosen && <ChosenBadge />}
      </span>
      <span className="text-on-surface text-control font-medium">{THEME_NAMES[id]}</span>
    </Option>
  );
}

function ChosenBadge() {
  return (
    <span className="bg-primary-container text-on-primary-container rounded-control absolute top-2 right-2 flex h-5 w-5 items-center justify-center">
      <Check size={12} strokeWidth={3} />
    </span>
  );
}

/** A labelled radio group: Tab reaches the chosen option, and the arrow keys move and choose. */
function Group<Value extends string>({
  label,
  className,
  last = false,
  value,
  onValueChange,
  children,
}: {
  label: string;
  className: string;
  last?: boolean;
  value: Value;
  onValueChange: (value: Value) => void;
  children: ReactNode;
}) {
  const labelId = useId();

  return (
    <div className={last ? undefined : "mb-8"}>
      <p
        id={labelId}
        className="font-ui text-on-surface-variant text-label mb-3 font-semibold tracking-widest uppercase"
      >
        {label}
      </p>
      <RadioGroup<Value> aria-labelledby={labelId} value={value} onValueChange={onValueChange} className={className}>
        {children}
      </RadioGroup>
    </div>
  );
}

/**
 * One option of a Group. The caller draws the chosen look; the group owns which
 * one is chosen.
 */
function Option({
  value,
  className,
  children,
  ...rest
}: {
  value: string;
  className: string;
  children: ReactNode;
  title?: string;
  "aria-label"?: string;
}) {
  return (
    <Radio value={value} className={className} {...rest}>
      {children}
    </Radio>
  );
}
