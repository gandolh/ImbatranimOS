import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  RotateCw,
  Volume2,
  Volume1,
  VolumeX,
  Shuffle,
  Repeat,
  Repeat1,
  Maximize2,
  Captions,
  CaptionsOff,
} from "lucide-react";
import { Button, Select, Slider, Toggle, Tooltip } from "@imbatranim/ui";
import { formatTime } from "../lib/formatTime";
import { Timebar } from "./Timebar";
import { SKIP_SECONDS, PLAYBACK_RATES } from "../lib/transport";
import type { RepeatMode } from "../lib/queueOrder";

type TransportBarProps = {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  canPrev: boolean;
  canNext: boolean;
  disabled: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  onPrev: () => void;
  onNext: () => void;
  /** Buffered ranges as [start, end] pairs. */
  buffered: [number, number][];
  playbackRate: number;
  onRateChange: (rate: number) => void;
  /** Relative skip in seconds; negative goes back. */
  onSkip: (seconds: number) => void;
  repeat: RepeatMode;
  onCycleRepeat: () => void;
  shuffle: boolean;
  onToggleShuffle: () => void;
  /** Only offered for video. */
  onFullscreen: (() => void) | null;
  /** `null` when the file has no sidecar subtitle. */
  subtitlesOn: boolean | null;
  onToggleSubtitles: () => void;
};

const RATE_OPTIONS = PLAYBACK_RATES.map((r) => ({ value: String(r), label: `${r}×` }));

function VolumeIcon({ volume, muted }: { volume: number; muted: boolean }) {
  if (muted || volume === 0) return <VolumeX size={14} />;
  if (volume < 0.5) return <Volume1 size={14} />;
  return <Volume2 size={14} />;
}

/** Custom transport bar over a native media element with `controls` off. */
export function TransportBar({
  isPlaying,
  currentTime,
  duration,
  volume,
  muted,
  canPrev,
  canNext,
  disabled,
  onTogglePlay,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onPrev,
  onNext,
  buffered,
  playbackRate,
  onRateChange,
  onSkip,
  repeat,
  onCycleRepeat,
  shuffle,
  onToggleShuffle,
  onFullscreen,
  subtitlesOn,
  onToggleSubtitles,
}: TransportBarProps) {
  return (
    <div className="border-outline-variant bg-surface-container-low flex shrink-0 flex-col gap-1.5 border-t px-2 py-1.5">
      <div className="flex items-center gap-2">
        <span className="font-ui text-on-surface-variant w-9 shrink-0 text-right text-[10px] tabular-nums">
          {formatTime(currentTime)}
        </span>
        <Timebar
          currentTime={currentTime}
          duration={duration}
          buffered={buffered}
          disabled={disabled}
          onSeek={onSeek}
        />
        <span className="font-ui text-on-surface-variant w-9 shrink-0 text-[10px] tabular-nums">
          {formatTime(duration)}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <Tooltip content="Previous track">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 shrink-0 p-0"
            aria-label="Previous track"
            onClick={onPrev}
            disabled={disabled || !canPrev}
          >
            <SkipBack size={13} />
          </Button>
        </Tooltip>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 shrink-0 p-0"
          onClick={() => onSkip(-SKIP_SECONDS)}
          disabled={disabled}
          title={`Back ${SKIP_SECONDS}s`}
          aria-label={`Back ${SKIP_SECONDS} seconds`}
        >
          <RotateCcw size={13} />
        </Button>
        <Tooltip content={isPlaying ? "Pause" : "Play"}>
          <Button
            variant="primary"
            size="sm"
            className="h-7 w-7 shrink-0 p-0"
            // Icon-only, so the tooltip is not enough: a tooltip is not an accessible name
            // and never reaches a screen reader.
            aria-label={isPlaying ? "Pause" : "Play"}
            onClick={onTogglePlay}
            disabled={disabled}
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          </Button>
        </Tooltip>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 shrink-0 p-0"
          onClick={() => onSkip(SKIP_SECONDS)}
          disabled={disabled}
          title={`Forward ${SKIP_SECONDS}s`}
          aria-label={`Forward ${SKIP_SECONDS} seconds`}
        >
          <RotateCw size={13} />
        </Button>
        <Tooltip content="Next track">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 shrink-0 p-0"
            aria-label="Next track"
            onClick={onNext}
            disabled={disabled || !canNext}
          >
            <SkipForward size={13} />
          </Button>
        </Tooltip>

        <Tooltip content={shuffle ? "Shuffle is on" : "Shuffle"}>
          <Toggle
            pressed={shuffle}
            onPressedChange={onToggleShuffle}
            aria-label="Shuffle"
            render={<Button variant={shuffle ? "selected" : "ghost"} size="sm" className="ml-1 h-6 w-6 shrink-0 p-0" />}
          >
            <Shuffle size={13} />
          </Toggle>
        </Tooltip>
        <Tooltip
          content={repeat === "off" ? "Repeat: off" : repeat === "all" ? "Repeat: whole queue" : "Repeat: this track"}
        >
          <Button
            variant={repeat === "off" ? "ghost" : "selected"}
            size="sm"
            className="h-6 w-6 shrink-0 p-0"
            // Three states, so `aria-pressed` cannot carry it: the mode goes in the label
            // instead, which is what a screen reader reads out.
            aria-label={`Repeat: ${repeat}`}
            onClick={onCycleRepeat}
          >
            {repeat === "one" ? <Repeat1 size={13} /> : <Repeat size={13} />}
          </Button>
        </Tooltip>

        <div className="flex-1" />

        {subtitlesOn !== null && (
          <Tooltip content={subtitlesOn ? "Hide subtitles" : "Show subtitles"}>
            <Toggle
              pressed={subtitlesOn}
              onPressedChange={onToggleSubtitles}
              aria-label="Subtitles"
              render={
                <Button variant={subtitlesOn ? "selected" : "ghost"} size="sm" className="h-6 w-6 shrink-0 p-0" />
              }
            >
              {subtitlesOn ? <Captions size={13} /> : <CaptionsOff size={13} />}
            </Toggle>
          </Tooltip>
        )}

        <Select
          aria-label="Playback speed"
          title="Playback speed"
          className="text-on-surface-variant h-6 shrink-0 px-1 py-0 text-[11px] tabular-nums"
          options={RATE_OPTIONS}
          value={String(playbackRate)}
          disabled={disabled}
          onValueChange={(next) => onRateChange(Number(next))}
        />

        <Tooltip content={muted ? "Unmute" : "Mute"}>
          <Toggle
            pressed={muted}
            onPressedChange={onToggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
            disabled={disabled}
            render={<Button variant="ghost" size="sm" className="h-6 w-6 shrink-0 p-0" />}
          >
            <VolumeIcon volume={volume} muted={muted} />
          </Toggle>
        </Tooltip>
        <Slider
          aria-label="Volume"
          className="w-16 flex-none"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          disabled={disabled}
          onValueChange={onVolumeChange}
        />

        {onFullscreen && (
          <Tooltip content="Fullscreen (F)">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 shrink-0 p-0"
              aria-label="Fullscreen"
              onClick={onFullscreen}
            >
              <Maximize2 size={13} />
            </Button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
