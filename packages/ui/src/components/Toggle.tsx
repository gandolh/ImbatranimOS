import { Toggle as BaseToggle } from "@base-ui/react/toggle";
import { ToggleGroup as BaseToggleGroup } from "@base-ui/react/toggle-group";
import type { ComponentProps } from "react";
import { cn } from "../cn";

type ToggleProps = Omit<ComponentProps<typeof BaseToggle>, "className"> & {
  /** A string, or a function of the toggle's state (`pressed`) for a look that switches with it. */
  className?: string | ((state: { pressed: boolean }) => string);
};

/**
 * An on/off button (`aria-pressed`, `data-pressed`). Controlled with `pressed`
 * and `onPressedChange`. Use it for a setting that is on or off; a choice of one
 * is a {@link RadioGroup}.
 */
export function Toggle({ className, ...props }: ToggleProps) {
  return (
    <BaseToggle
      {...props}
      className={(state) =>
        cn("outline-none", typeof className === "function" ? className({ pressed: state.pressed }) : className)
      }
    />
  );
}

type ToggleGroupProps = Omit<ComponentProps<typeof BaseToggleGroup>, "className" | "onValueChange"> & {
  className?: string;
  onValueChange?: (value: string[]) => void;
  /**
   * Pressing the pressed item again would empty the group; with `keepOne` that
   * change is dropped, so one item always stays pressed. For a picker that
   * saves on each choice: the arrow keys only move focus, so they never write.
   */
  keepOne?: boolean;
};

/**
 * A row of {@link Toggle}s that share one value (`string[]`). `multiple` lets
 * several be pressed (the weekdays of a repeat); without it, one at most.
 */
export function ToggleGroup({ className, keepOne = false, onValueChange, ...props }: ToggleGroupProps) {
  return (
    <BaseToggleGroup
      {...props}
      className={cn(className)}
      onValueChange={(next) => {
        if (keepOne && next.length === 0) return;
        onValueChange?.(next);
      }}
    />
  );
}
