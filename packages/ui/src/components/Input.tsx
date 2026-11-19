import { Input as BaseInput } from "@base-ui/react/input";
import type { ComponentProps } from "react";
import { cn } from "../cn";

type InputProps = ComponentProps<typeof BaseInput> & {
  label?: string;
};

export function Input({ label, className, id, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="font-ui text-on-surface-variant text-label font-semibold">
          {label}
        </label>
      )}
      <BaseInput
        id={id}
        className={cn(
          "border-outline bg-surface-container-lowest rounded-control w-full border px-2.5 py-1.5",
          "font-content text-on-surface text-body",
          "outline-none motion-safe:transition-colors",
          "placeholder:text-on-surface-variant",
          // Its own focus, with or without a Field around it: `data-focused`
          // comes only from a Field, so a bare Input drew no ring (2026-11-19).
          "focus-visible:border-primary focus-visible:ring-primary focus-visible:ring-2 focus-visible:ring-inset",
          "data-[invalid]:border-error",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    </div>
  );
}
