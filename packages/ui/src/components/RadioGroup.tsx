import { Radio as BaseRadio } from "@base-ui/react/radio";
import { RadioGroup as BaseRadioGroup } from "@base-ui/react/radio-group";
import type { ComponentProps } from "react";
import { cn } from "../cn";

type GroupProps<Value extends string> = Omit<
  ComponentProps<typeof BaseRadioGroup>,
  "className" | "value" | "defaultValue" | "onValueChange"
> & {
  value?: Value;
  defaultValue?: Value;
  onValueChange?: (value: Value) => void;
  className?: string;
};

/**
 * One choice from a few, for a filter, a mode, or a setting kept on the
 * device. Tab enters the group at the chosen option; the arrow keys move AND
 * choose, which is right because nothing is saved to the server. Name it with
 * `aria-label` or `aria-labelledby`.
 */
export function RadioGroup<Value extends string = string>({ className, onValueChange, ...props }: GroupProps<Value>) {
  return <BaseRadioGroup<Value> {...props} onValueChange={(next) => onValueChange?.(next)} className={cn(className)} />;
}

type RadioProps = Omit<ComponentProps<typeof BaseRadio.Root>, "className"> & {
  /** A string, or a function of the radio's state (`checked`) for a look that switches with it. */
  className?: string | ((state: { checked: boolean }) => string);
};

/**
 * One option of a {@link RadioGroup}. It draws as a `span`, laid out like a
 * button (inline, content centred); the caller's classes make it a chip, a
 * card or a swatch. `data-checked` is on the chosen one, and `aria-checked`.
 */
export function Radio({ className, ...props }: RadioProps) {
  return (
    <BaseRadio.Root
      {...props}
      className={(state) =>
        cn(
          "inline-block cursor-pointer text-center outline-none select-none",
          "data-disabled:cursor-not-allowed",
          typeof className === "function" ? className({ checked: state.checked }) : className,
        )
      }
    />
  );
}
