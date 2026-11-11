import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { houseStyle } from "./vendor/house-style/eslint.config.js";

/** The web workspaces: the desktop, the UI kit and the add-ons. */
const WEB = ["apps/core/src", "packages/ui/src", "apps/add-ons/*/src"];

export default [
  ...houseStyle({
    root: import.meta.dirname,
    web: WEB,
    server: "apps/backend/src",
    // Scripts run by hand, which print and read the environment directly.
    scripts: ["scripts"],
    // Jest's specs (`*.spec.ts`, and everything under apps/backend/test) are tests too.
    tests: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}", "apps/backend/test/**"],
    // The calculator tests wrap `expect` in `near`, and the e2e specs assert through supertest's `.expect()`.
    assertFunctionNames: ["expect", "expectTypeOf", "near", "**.expect", "checkCommit"],
    // The database service reports a failed migration on the console before the app has a logger to report it to.
    console: ["apps/backend/src/db/db.service.ts"],
    // The desktop's Tailwind entry; it imports the kit's tokens and scans the add-ons.
    tailwind: { css: "apps/core/src/index.css" },
    // Docs is a Docusaurus site with its own build and `^` ranges; the Rust host, the image setup, the ISO build
    // and the marketplace manifests are not TypeScript.
    ignores: [
      "apps/docs/**",
      "apps/backend/src/modules/browser/static/**",
      "apps/wayland-host/**",
      "infrastructure/**",
      "iso/**",
      "marketplace/**",
    ],
  }),

  // The web workspaces kept the Vite refresh rule before the house config existed.
  { name: "imbatranimos/react-refresh", files: WEB.map((dir) => `${dir}/**/*.{ts,tsx}`), ...reactRefresh.configs.vite },

  // The import boundaries, one block per workspace. They carry the seam between the OS, the kit and the add-ons.
  {
    // Core must not depend on the apps that plug into it. Exactly one file, src/manifest.ts (the composition
    // root), may import add-on packages. The one exception is the kit: @imbatranim/ui sits below core, so core
    // links against it the way every app does.
    name: "imbatranimos/core-boundary",
    files: ["apps/core/src/**/*.{ts,tsx}"],
    ignores: ["apps/core/src/manifest.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@imbatranim/*", "!@imbatranim/ui"],
              message: "Only src/manifest.ts (the composition root) may import add-on packages.",
            },
          ],
        },
      ],
    },
  },
  {
    // The kit sits below the OS: it is what apps link against, so it may depend on nothing above itself. An
    // import from core here would drag the whole compositor into every app bundle and dissolve the seam.
    name: "imbatranimos/kit-boundary",
    files: ["packages/ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@imbatranim/core", "@imbatranim/core/*"],
              message:
                "The SDK must not depend on the OS. Capabilities reach apps through the injected system handle; the handle implementation lives in core.",
            },
          ],
        },
      ],
    },
  },
  {
    // Add-ons may import only core's public surface: no deep paths into core, no reaching into sibling add-ons.
    // The seam is the injected `system` handle and the kit; the one thing left to import from core is its types
    // (AddonManifest), which are erased at build time and cannot couple the bundle to the OS.
    name: "imbatranimos/add-on-boundary",
    files: ["apps/add-ons/*/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@imbatranim/core",
              message:
                "Value imports from the OS are forbidden: capabilities come from the injected `system` handle, the UI kit from @imbatranim/ui. Type-only imports are allowed.",
              allowTypeImports: true,
            },
          ],
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@imbatranim/core/*"], message: "Import only the public surface: '@imbatranim/core'." },
            {
              group: ["@imbatranim/!(core)", "@imbatranim/!(core)/*"],
              message: "Add-ons must not import other add-ons.",
            },
            {
              group: ["../../core/*", "../../../core/*"],
              message: "No relative escapes into core: use '@imbatranim/core'.",
            },
          ],
        },
      ],
    },
  },

  // The NestJS backend keeps its decorators and constructor injection, so it stays on the type-checked rule set it
  // already ran, and the house's erasable-syntax tsconfig flags do not apply to it. The house's six typed rules and
  // the rest of the base come from the block above; this adds the rest of typescript-eslint's type-checked set.
  {
    name: "imbatranimos/backend",
    files: ["apps/backend/**/*.ts"],
    rules: {
      ...tseslint.configs.recommendedTypeChecked.at(-1)?.rules,
      "@typescript-eslint/no-unsafe-argument": "warn",
    },
  },

  {
    // Off for now (2026-11-11): the compiler runs without noUncheckedIndexedAccess, so this rule calls every `!` on an
    // indexed read unnecessary and its autofix strips them. It comes back with the flag.
    name: "imbatranimos/no-unnecessary-type-assertion-off",
    rules: { "@typescript-eslint/no-unnecessary-type-assertion": "off" },
  },
  {
    // A warning for now (2026-11-11): the backend modules read their settings from the environment themselves. When
    // they take them from one config module, this block goes and the rule is an error again.
    name: "imbatranimos/process-env-warns",
    files: ["apps/backend/src/**/*.ts"],
    ignores: ["**/*.spec.ts"],
    rules: { "n/no-process-env": "warn" },
  },
  {
    // Two classes are plain CSS the stylesheets define (the scrollbar look in index.css, the Markdown preview's
    // highlight.css), not Tailwind utilities, so the rule cannot know them.
    name: "imbatranimos/plain-css-classes",
    files: WEB.map((dir) => `${dir}/**/*.{ts,tsx}`),
    rules: { "better-tailwindcss/no-unknown-classes": ["error", { ignore: ["custom-scrollbar", "md-preview"] }] },
  },
];
