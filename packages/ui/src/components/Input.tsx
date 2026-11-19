import { Input as BaseInput } from "@base-ui/react/input";
import { CircleAlert } from "lucide-react";
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
      <div className="relative">
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
            // Two signals say invalid: `aria-invalid` from the caller, and
            // `data-invalid` from a Base UI Field. Border, room for the mark
            // and the mark itself follow both.
            "peer data-[invalid]:border-error aria-invalid:border-error",
            "aria-invalid:pe-8 data-[invalid]:pe-8",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          {...props}
        />
        <CircleAlert
          aria-hidden="true"
          data-error-mark=""
          className="text-error pointer-events-none absolute end-2.5 top-1/2 hidden size-4 -translate-y-1/2 peer-aria-invalid:block peer-data-[invalid]:block"
        />
      </div>
    </div>
  );
}
