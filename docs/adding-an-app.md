# Adding an app to the desktop

Apps that open in a window are workspace packages under `apps/add-ons/`, kept apart from the OS so one can be added or removed without touching the rest of core.

1. Create `apps/add-ons/<name>/` with:
   - a `package.json` named `@imbatranim/<name>`, depending on `@imbatranim/core` and `@imbatranim/ui` (copy an existing add-on's scripts and devDependencies);
   - a `tsconfig.json` that extends `../tsconfig.base.json`;
   - an `eslint.config.js` copied from another add-on. It carries the import rules below.
2. Put the app in `src/`. Components and hooks come from `@imbatranim/ui`. Everything that touches the machine comes from the `system` handle the desktop injects (`useSystem()` from `@imbatranim/ui`): `fs`, `http`, `window`, `intents`, `shortcuts`, `appearance`, `schedule`, `notify` and `on`. From `@imbatranim/core` you may import types only.
3. Export `manifest: AddonManifest` from `src/index.ts`: an id, a name, an icon, a lazy-loaded component and window sizes. Optional fields add command-palette sources, a background component or a desktop layer. `apps/add-ons/todo/src/index.ts` is a short example.
4. Register it in `apps/core/src/manifest.ts`, the one file in core that knows about add-ons: one import and one entry in `MANIFESTS`. Then run `npm install` at the repo root to link the workspace.

Nothing else in core changes. ESLint enforces the boundaries: a value import from `@imbatranim/core` in an add-on is an error, add-ons cannot import each other, and core imports add-ons only in `manifest.ts`.

The rules for how an app should look and behave (tokens, dialogs, empty states, the accessibility floor) are in [corpus/wiki/ui-conventions.md](../corpus/wiki/ui-conventions.md). Why apps get a handle instead of importing the OS is in [corpus/wiki/os-layering.md](../corpus/wiki/os-layering.md).

To ship an app from another repository instead, without changing this one, see [marketplace/README.md](../marketplace/README.md).
