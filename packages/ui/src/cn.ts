import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge, told the type scale in theme.css. Without the `text` list it
 * reads `text-label` as a colour, so `cn("text-on-surface", "text-label")`
 * would drop one of the two. Keep the list in step with the --text-* names.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        "nano",
        "micro",
        "tiny",
        "label",
        "control",
        "body",
        "subhead",
        "lead",
        "title",
        "display-sm",
        "display",
        "display-lg",
        "display-xl",
        "note",
        "prose",
        "heading",
        "headline",
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
