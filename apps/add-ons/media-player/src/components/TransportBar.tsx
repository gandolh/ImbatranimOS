import { Play, Pause, SkipBack, SkipForward, Volume2, Volume1, VolumeX } from 'lucide-react'
import { Button, Tooltip, cn } from '@imbatranim/core'
import { formatTime } from '../lib/formatTime'

type TransportBarProps = {
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  muted: boolean
  canPrev: boolean
  canNext: boolean
  disabled: boolean
  onTogglePlay: () => void
  onSeek: (time: number) => void
  onVolumeChange: (volume: number) => void
  onToggleMute: () => void
  onPrev: () => void
  onNext: () => void
}

// Native range inputs, stripped of the browser's default (rounded) chrome and
// re-skinned flat/square to match the OS's Win7-classic, no-rounded-corners
// look — using the token accent color rather than a hardcoded one.
const RANGE_CLASSES =
  'h-1 cursor-pointer appearance-none bg-surface-container-high accent-primary ' +
  '[&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-primary ' +
  '[&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

function VolumeIcon({ volume, muted }: { volume: number; muted: boolean }) {
  if (muted || volume === 0) return <VolumeX size={14} />
  if (volume < 0.5) return <Volume1 size={14} />
  return <Volume2 size={14} />
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
}: TransportBarProps) {
  const seekableMax = duration > 0 ? duration : 0
  return (
    <div className="border-outline-variant bg-surface-container-low flex shrink-0 flex-col gap-1.5 border-t px-2 py-1.5">
      <div className="flex items-center gap-2">
        <span className="font-ui text-on-surface-variant w-9 shrink-0 text-right text-[10px] tabular-nums">
          {formatTime(currentTime)}
        </span>
        <input
          type="range"
          aria-label="Seek"
          className={cn(RANGE_CLASSES, 'w-full flex-1')}
          min={0}
          max={seekableMax}
          step="any"
          value={Math.min(currentTime, seekableMax)}
          disabled={disabled || seekableMax <= 0}
          onChange={(e) => onSeek(Number(e.target.value))}
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
            onClick={onPrev}
            disabled={disabled || !canPrev}
          >
            <SkipBack size={13} />
          </Button>
        </Tooltip>
        <Tooltip content={isPlaying ? 'Pause' : 'Play'}>
          <Button
            variant="primary"
            size="sm"
            className="h-7 w-7 shrink-0 p-0"
            onClick={onTogglePlay}
            disabled={disabled}
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          </Button>
        </Tooltip>
        <Tooltip content="Next track">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 shrink-0 p-0"
            onClick={onNext}
            disabled={disabled || !canNext}
          >
            <SkipForward size={13} />
          </Button>
        </Tooltip>

        <div className="flex-1" />

        <Tooltip content={muted ? 'Unmute' : 'Mute'}>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 shrink-0 p-0"
            onClick={onToggleMute}
            disabled={disabled}
          >
            <VolumeIcon volume={volume} muted={muted} />
          </Button>
        </Tooltip>
        <input
          type="range"
          aria-label="Volume"
          className={cn(RANGE_CLASSES, 'w-16 flex-none')}
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          disabled={disabled}
          onChange={(e) => onVolumeChange(Number(e.target.value))}
        />
      </div>
    </div>
  )
}
