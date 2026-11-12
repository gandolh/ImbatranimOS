import { Slider as BaseSlider } from "@base-ui/react/slider";
import { cn } from "../cn";

type SliderProps = {
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  /** Fires on release (or a key press), with the final value: for a write that should not follow every step. */
  onValueCommitted?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  /** The thumb's accessible name. */
  "aria-label": string;
  /** Says the value aloud, such as "40%, muted"; the default is the number. */
  getAriaValueText?: (formattedValue: string, value: number) => string;
  /** The thumb's ref target for `initialFocus`: the hidden range input inside it. */
  inputRef?: React.Ref<HTMLInputElement>;
  className?: string;
};

/**
 * A single-value slider: a square thumb on a thin track, in the accent, for a
 * volume or a seek position. Keys move it by `step`, Home and End jump, and
 * Page Up and Down move by ten steps.
 */
export function Slider({
  value,
  defaultValue,
  onValueChange,
  onValueCommitted,
  min,
  max,
  step,
  disabled,
  "aria-label": ariaLabel,
  getAriaValueText,
  inputRef,
  className,
}: SliderProps) {
  return (
    <BaseSlider.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={(next) => onValueChange?.(Array.isArray(next) ? next[0] : next)}
      onValueCommitted={(next) => onValueCommitted?.(Array.isArray(next) ? next[0] : next)}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      className={cn("min-w-0", className)}
    >
      <BaseSlider.Control className="flex w-full cursor-pointer touch-none items-center py-1.5 select-none data-disabled:cursor-not-allowed">
        <BaseSlider.Track className="bg-surface-container-high h-1 w-full select-none">
          <BaseSlider.Thumb
            aria-label={ariaLabel}
            getAriaValueText={getAriaValueText}
            inputRef={inputRef}
            className="bg-primary has-[:focus-visible]:outline-primary h-3 w-3 select-none has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2"
          />
        </BaseSlider.Track>
      </BaseSlider.Control>
    </BaseSlider.Root>
  );
}
