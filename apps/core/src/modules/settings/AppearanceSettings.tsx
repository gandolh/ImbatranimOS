import { useId, type CSSProperties, type ReactNode } from "react";
import { Check, Image, Monitor, Moon, Sun } from "lucide-react";
import { Radio, RadioGroup } from "@imbatranim/ui";
import { cn } from "../../lib/cn";
import {
  ACCENT_PRESETS,
  THEME_IDS,
  accentSwatch,
  useAppearanceStore,
  type ModePreference,
  type ThemeId,
} from "../../shared/store/appearanceStore";
import { useCurrentWallpaper, useWallpaperStore } from "../../shared/store/wallpaperStore";
import { WALLPAPERS, wallpaperById } from "../../shared/components/desktop/wallpapers";

const THEME_NAMES: Record<ThemeId, string> = { apricot: "Apricot", classic: "Classic" };

const MODES: { id: ModePreference; name: string; icon: typeof Moon }[] = [
  { id: "light", name: "Light", icon: Sun },
  { id: "dark", name: "Dark", icon: Moon },
  { id: "system", name: "System", icon: Monitor },
];

const FOCUS_RING =
  "focus-visible:ring-primary focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container-low outline-none";

/** An unchosen Mode or Accent option: on surface-container, bordered at 3:1 (2026-11-13). */
const OPTION = "border-outline bg-surface-container text-on-surface hover:bg-surface-container-high";

/**
 * A card's edge, drawn in an overlay above its preview so the preview never
 * hides it; the chosen card's is a 2 px ring in the strong accent.
 */
function cardEdge(chosen: boolean): string {
  return cn(
    "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:ring-inset",
    chosen
      ? "after:ring-primary after:ring-2"
      : "after:ring-outline-variant after:ring-1 group-hover:after:ring-outline",
  );
}

/**
 * Settings → Appearance: Theme, Mode, Accent, Wallpaper, top to bottom
 * (decisions-themes.md, 2026-11-02). Accent and Wallpaper list the current
 * theme's options; choosing a theme brings back that theme's own saved accent
 * and wallpaper. Each group is a radio group: Tab reaches its chosen option,
 * the arrow keys move between options, Space or Enter chooses.
 */
export function AppearanceSettings() {
  const theme = useAppearanceStore((s) => s.theme);
  const accent = useAppearanceStore((s) => s.accents[s.theme]);
  const setTheme = useAppearanceStore((s) => s.setTheme);
  const modePreference = useAppearanceStore((s) => s.modePreference);
  const setModePreference = useAppearanceStore((s) => s.setModePreference);
  const setAccent = useAppearanceStore((s) => s.setAccent);
  const wallpaper = useCurrentWallpaper();
  const setWallpaper = useWallpaperStore((s) => s.setWallpaper);

  return (
    <>
      <Group label="Theme" value={theme} onValueChange={setTheme} className="gap-double flex flex-wrap">
        {THEME_IDS.map((id) => (
          <ThemeCard key={id} id={id} chosen={theme === id} />
        ))}
      </Group>

      <Group
        label="Mode"
        value={modePreference}
        onValueChange={setModePreference}
        className="gap-window-padding flex max-[600px]:gap-2"
      >
        {MODES.map((m) => {
          const Icon = m.icon;
          const chosen = modePreference === m.id;
          return (
            <Option
              key={m.id}
              value={m.id}
              className={cn(
                "rounded-control text-control flex h-[40px] flex-1 items-center justify-center gap-2 border px-[12px] font-semibold",
                "max-[600px]:h-[48px] max-[600px]:gap-1 max-[600px]:px-[8px]",
                FOCUS_RING,
                chosen ? "border-primary bg-primary-container text-on-primary-container" : OPTION,
              )}
            >
              <Icon size={15} strokeWidth={1.75} />
              {m.name}
            </Option>
          );
        })}
      </Group>

      <Group label="Accent" value={accent} onValueChange={setAccent} className="flex flex-wrap gap-2">
        {ACCENT_PRESETS[theme].map((preset) => {
          const chosen = accent === preset.id;
          return (
            <Option
              key={preset.id}
              value={preset.id}
              title={preset.name}
              className={cn(
                "group rounded-control flex h-[40px] items-center gap-2 border pr-[12px] pl-[8px] max-[600px]:h-[48px]",
                FOCUS_RING,
                chosen ? "border-primary bg-surface-container-high ring-primary ring-1 ring-inset" : OPTION,
              )}
            >
              <span
                className="rounded-item flex h-[24px] w-[24px] items-center justify-center"
                style={{ backgroundColor: accentSwatch(preset).fill, color: accentSwatch(preset).on }}
              >
                {chosen && <Check size={13} strokeWidth={3} />}
              </span>
              <span className="text-on-surface text-control font-semibold">{preset.name}</span>
            </Option>
          );
        })}
      </Group>

      <Group
        label="Wallpaper"
        value={wallpaper}
        onValueChange={setWallpaper}
        className="gap-double grid grid-cols-3 max-[600px]:gap-2"
        last
      >
        {WALLPAPERS[theme].map((wp) => {
          const chosen = wallpaper === wp.id;
          return (
            <Option
              key={wp.id}
              value={wp.id}
              className={cn(
                "group rounded-control bg-surface-container relative flex flex-col overflow-hidden",
                cardEdge(chosen),
                FOCUS_RING,
              )}
            >
              <div className="aspect-[16/7] w-full" style={wp.preview} />
              {chosen && <ChosenBadge />}
              <div className="border-outline-variant bg-surface-container gap-half flex items-center border-t px-[12px] py-[8px] max-[600px]:px-[4px]">
                <Image size={14} strokeWidth={1.75} className="text-on-surface-variant shrink-0 max-[600px]:hidden" />
                <span className="text-on-surface text-control font-semibold">{wp.name}</span>
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
        "group gap-base flex w-[140px] flex-col text-left max-[600px]:w-[calc(50%-8px)]",
        "focus-visible:ring-primary focus-visible:ring-offset-surface-container-low rounded-control outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
      )}
    >
      <span className={cn("rounded-control relative block aspect-[132/80] w-full overflow-hidden", cardEdge(chosen))}>
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
      <span className="text-on-surface text-control font-semibold">{THEME_NAMES[id]}</span>
    </Option>
  );
}

function ChosenBadge() {
  return (
    <span className="bg-primary-container text-on-primary-container rounded-item border-primary absolute top-[6px] right-[6px] flex h-[20px] w-[20px] items-center justify-center border">
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
    <div className={last ? undefined : "mb-double"}>
      <p id={labelId} className="font-ui text-on-surface-variant text-label mb-base font-semibold">
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
