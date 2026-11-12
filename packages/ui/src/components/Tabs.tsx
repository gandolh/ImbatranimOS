import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import type { ComponentProps } from "react";
import { cn } from "../cn";

type WithClass<P, S = never> = Omit<P, "className"> & { className?: string | ((state: S) => string) };

/** The tab set. It draws a plain div with no look of its own. Controlled with `value` and `onValueChange`. */
export function Tabs(props: ComponentProps<typeof BaseTabs.Root>) {
  return <BaseTabs.Root {...props} />;
}

/**
 * The row of tabs. Arrow keys move and choose (`activateOnFocus`), as for any
 * filter: pass `activateOnFocus={false}` when a panel is slow to render.
 */
export function TabsList({
  className,
  ...props
}: Omit<ComponentProps<typeof BaseTabs.List>, "className"> & { className?: string }) {
  return <BaseTabs.List activateOnFocus {...props} className={cn(className)} />;
}

/** One tab: a button with `role=tab`. `data-active` is on the chosen one. The caller's classes give the look. */
export function Tab({ className, ...props }: WithClass<ComponentProps<typeof BaseTabs.Tab>, { active: boolean }>) {
  return (
    <BaseTabs.Tab
      {...props}
      className={(state) =>
        cn("outline-none", typeof className === "function" ? className({ active: state.active }) : className)
      }
    />
  );
}

/** The panel of one tab. Only the chosen panel is mounted unless `keepMounted` is set. */
export function TabsPanel({
  className,
  ...props
}: Omit<ComponentProps<typeof BaseTabs.Panel>, "className"> & { className?: string }) {
  return <BaseTabs.Panel {...props} className={cn("outline-none", className)} />;
}
