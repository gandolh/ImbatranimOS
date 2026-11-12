import { useRef } from "react";
import { Popover } from "@imbatranim/ui";
import { Volume, Volume1, Volume2, VolumeX } from "lucide-react";
import { cn } from "../../../lib/cn";
import { useSoundStore } from "../../store/soundStore";

// The media player's slider: a native range with the browser's chrome
// stripped, square, in the accent.
const RANGE_CLASSES =
  "h-1 cursor-pointer appearance-none bg-surface-container-high accent-primary " +
  "[&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-primary " +
  "[&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary " +
  "focus-visible:outline-primary focus-visible:outline-2 focus-visible:outline-offset-2";

/** A speaker that says muted, silent, or roughly how loud. */
function SpeakerIcon({ volume, muted, size }: { volume: number; muted: boolean; size: number }) {
  const props = { size, strokeWidth: 1.75, "aria-hidden": true };
  if (muted) return <VolumeX {...props} data-speaker="muted" />;
  if (volume === 0) return <Volume {...props} data-speaker="silent" />;
  if (volume < 0.5) return <Volume1 {...props} data-speaker="low" />;
  return <Volume2 {...props} data-speaker="high" />;
}

/**
 * The tray's speaker: one volume and one mute over every sound the OS makes,
 * the media player's and Linux apps'. Each source plays at its own volume
 * times this one.
 */
export function TrayVolume() {
  const volume = useSoundStore((s) => s.volume);
  const muted = useSoundStore((s) => s.muted);
  const setVolume = useSoundStore((s) => s.setVolume);
  const setMuted = useSoundStore((s) => s.setMuted);
  const slider = useRef<HTMLInputElement>(null);
  const percent = Math.round(volume * 100);
  const label = muted ? "Volume: muted" : `Volume: ${percent}%`;

  return (
    <Popover
      initialFocus={slider}
      label="Volume"
      trigger={
        <button
          type="button"
          aria-label={label}
          title={label}
          data-tray-volume=""
          className={cn(
            "flex h-full cursor-pointer items-center px-2.5 outline-none",
            "text-on-surface hover:bg-surface-container-high",
            "focus-visible:ring-primary focus-visible:ring-2 focus-visible:ring-inset",
          )}
        >
          <SpeakerIcon volume={volume} muted={muted} size={15} />
        </button>
      }
    >
      <div className="font-ui flex w-60 items-center gap-2 p-3">
        <button
          type="button"
          aria-label={muted ? "Unmute" : "Mute"}
          aria-pressed={muted}
          title={muted ? "Unmute" : "Mute"}
          onClick={() => setMuted(!muted)}
          className={cn(
            "rounded-control flex h-7 w-7 shrink-0 items-center justify-center outline-none",
            "text-on-surface hover:bg-surface-container-high",
            "focus-visible:ring-primary focus-visible:ring-2 focus-visible:ring-inset",
          )}
        >
          <SpeakerIcon volume={volume} muted={muted} size={16} />
        </button>
        <input
          ref={slider}
          type="range"
          aria-label="Volume"
          aria-valuetext={muted ? `${percent}%, muted` : `${percent}%`}
          min={0}
          max={100}
          step={1}
          value={percent}
          onChange={(e) => setVolume(Number(e.target.value) / 100)}
          className={cn(RANGE_CLASSES, "min-w-0 flex-1", muted && "opacity-50")}
        />
        <span className="text-on-surface-variant w-8 shrink-0 text-right text-[11px] tabular-nums" aria-hidden>
          {percent}
        </span>
      </div>
    </Popover>
  );
}
