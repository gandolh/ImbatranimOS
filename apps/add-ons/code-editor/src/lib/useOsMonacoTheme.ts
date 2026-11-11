import { useEffect, useState } from "react";
import * as monaco from "monaco-editor";
import { useSystemAppearance } from "@imbatranim/ui";
import { OS_MONACO_THEME, buildMonacoTheme, documentVarResolver } from "./osMonacoTheme";

function define(mode: "light" | "dark"): void {
  monaco.editor.defineTheme(OS_MONACO_THEME, buildMonacoTheme(mode, documentVarResolver()));
}

/**
 * The name of the OS-coloured Monaco theme, kept current. It is defined before
 * the editor first renders (the desktop's variables are set by the time a
 * window opens) and redefined when the mode or accent changes, including a
 * switch between Apricot and Classic, whose accents always differ.
 */
export function useOsMonacoTheme(): string {
  const { theme, accent } = useSystemAppearance();
  const mode = theme === "dark" ? "dark" : "light";
  // A lazy initialiser, so the theme exists before Monaco is asked for it.
  useState(() => define(mode));
  useEffect(() => {
    // One frame later: the desktop writes the new values onto <html> in an
    // effect of its own, which may run after this one.
    const frame = requestAnimationFrame(() => {
      define(mode);
      monaco.editor.setTheme(OS_MONACO_THEME);
    });
    return () => cancelAnimationFrame(frame);
  }, [mode, accent]);
  return OS_MONACO_THEME;
}
