// knip has no `extends`, so this spreads the house preset. The root's own entry is the scripts folder, which runs by
// hand. apps/docs is a Docusaurus site with its own build and entries, so it stays out of the check, and the Rust
// host, the image setup and the ISO build are not part of the workspaces.
import preset from "./vendor/house-style/knip.json" with { type: "json" };

export default {
  ...preset,
  ignore: [
    ...preset.ignore,
    "apps/docs/**",
    // Unused files knip found when the check was adopted (2026-11-11). They are dead code left for a clean-up, and
    // each line goes when its file does.
    "apps/core/src/lib/dayjs.ts",
    "apps/core/src/shared/components/ui/PromptDialog.tsx",
    "apps/core/src/shared/components/window/index.ts",
    "apps/core/src/shared/hooks/useVirtualList.ts",
    "apps/core/src/shared/lib/systemLog.ts",
    "apps/core/src/shared/registry/index.ts",
  ],
  // The Vite client types the web tsconfigs name.
  ignoreUnresolved: ["vite/client"],
  ignoreBinaries: ["codegraph"],
  workspaces: {
    ".": { entry: ["scripts/*.{js,mjs,ts}"] },
    "apps/core": {
      // Declared before anything uses them (2026-11-11); the kit declares its own copies. A clean-up removes them.
      ignoreDependencies: ["@tanstack/react-virtual", "clsx", "tailwind-merge"],
    },
    // The add-ons run vitest from a script and do not list it, so knip would not know their tests.
    "apps/add-ons/*": { vitest: true, ignoreBinaries: ["vitest"] },
    // Used by files that no workspace declares; they resolve through the hoisted copy (2026-11-11). A clean-up
    // declares them where they are used.
    "apps/add-ons/file-manager": { vitest: true, ignoreBinaries: ["vitest"], ignoreDependencies: ["react-dom"] },
    "apps/add-ons/notepad": { vitest: true, ignoreBinaries: ["vitest"], ignoreDependencies: ["highlight.js"] },
    "apps/add-ons/snipping-tool": { vitest: true, ignoreBinaries: ["vitest"], ignoreDependencies: ["react-dom"] },
    "packages/ui": { ignoreDependencies: ["lucide-react"] },
    "apps/backend": {
      // The e2e specs run from jest's own config, the proxy's page and worker are files the server hands out, and
      // main is the Nest entry.
      entry: ["src/main.ts", "test/**/*.ts", "src/modules/browser/static/*.js"],
      // bare-mux is served from its npm package by path; multer only has its types declared; the rest are tools
      // jest and the build load by name.
      ignoreDependencies: ["@mercuryworkshop/bare-mux", "multer", "jsdom", "source-map-support", "ts-loader"],
      ignoreBinaries: ["mkfifo", "dbus-daemon"],
    },
  },
};
