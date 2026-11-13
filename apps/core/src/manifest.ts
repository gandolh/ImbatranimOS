/**
 * The composition root — the ONLY file in core allowed to import
 * `@imbatranim/*` add-on packages (enforced by eslint no-restricted-imports;
 * the exception lives in eslint.config.js, not tribal knowledge).
 *
 * Adding an app to the OS = one import + one array entry here. Nothing else
 * in core changes.
 */
import { lazy } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { manifest as stickyNotes } from "@imbatranim/sticky-notes";
import { manifest as browser } from "@imbatranim/browser";
import { manifest as notepad } from "@imbatranim/notepad";
import { manifest as terminal } from "@imbatranim/repl-interpreter";
import { manifest as fileManager } from "@imbatranim/file-manager";
import { manifest as systemMonitor } from "@imbatranim/system-monitor";
import { manifest as snippingTool } from "@imbatranim/snipping-tool";
import { manifest as calculator } from "@imbatranim/calculator";
import { manifest as clock } from "@imbatranim/clock";
import { manifest as calendar } from "@imbatranim/calendar";
import { manifest as imageViewer } from "@imbatranim/image-viewer";
import { manifest as mediaPlayer } from "@imbatranim/media-player";
import { manifest as codeEditor, diffManifest as diff } from "@imbatranim/code-editor";
import { manifest as paint } from "@imbatranim/paint";
import { manifest as logs } from "@imbatranim/logs";
import type { AddonManifest, AppConfig } from "./contract";
import { COMMAND_SOURCES, registerCommandSource } from "./shared/commands/CommandSourcesRegistry";

// Settings is core (shell + auth + settings roster), not an add-on — it is
// declared here directly rather than imported as a package.
const settings: AddonManifest = {
  id: "settings",
  name: "Settings",
  description: "System settings and appearance",
  meta: ["config", "appearance", "background", "wallpaper", "theme"],
  icon: SettingsIcon,
  component: lazy(() => import("./modules/settings/Settings").then((m) => ({ default: m.Settings }))),
  multiInstance: false,
  // Tall enough that Theme, Mode, Accent and Wallpaper show whole with Apps
  // peeking under them (2026-11-13); the window store clamps it to the screen.
  defaultSize: { width: 680, height: 724 },
  minSize: { width: 360, height: 400 },
};

const MANIFESTS: AddonManifest[] = [
  stickyNotes,
  browser,
  notepad,
  settings,
  terminal,
  fileManager,
  systemMonitor,
  snippingTool,
  calculator,
  clock,
  calendar,
  imageViewer,
  mediaPlayer,
  codeEditor,
  diff,
  paint,
  logs,
];

// A copy, not MANIFESTS itself: marketplace apps are spliced into
// this array at runtime — see shared/registry/marketplace.tsx.
export const APP_REGISTRY: AppConfig[] = [...MANIFESTS];

// Register add-on command-palette sources once (guard against HMR
// double-registration, same as the palette's own sources).
for (const m of MANIFESTS) {
  for (const source of m.commandSources ?? []) {
    if (!COMMAND_SOURCES.find((s) => s.group === source.group)) {
      registerCommandSource(source);
    }
  }
}
