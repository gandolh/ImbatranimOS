# Lint + format debt (pre-existing, surfaced by brief 16)

Captured 2026-07-17 while landing turborepo (brief 16). Not caused by the
workspace move — verified against identical plugin/prettier versions.

- `npm run lint` fails on **frontend**: ~25+ real errors —
  `@typescript-eslint/no-unused-vars` on `_`-prefixed vars (the eslint
  config has no `argsIgnorePattern: '^_'`), several
  `react-hooks` "setState synchronously in effect" errors, a
  `react-refresh/only-export-components` error. Backend lint passes
  (it runs with `--fix`).
- `npm run format:check` fails on **backend**: 30 files were never
  prettier-clean (the script didn't exist before brief 16; only
  write-mode `format` did, and it was never run).

Options when promoting to a brief: add `argsIgnorePattern`/
`varsIgnorePattern: '^_'` to the frontend eslint config (kills most
errors legitimately), fix the handful of real hook issues, run
`npm run format -w backend` once, and consider wiring format:check +
lint as a pre-tag gate for v1.0 (brief 15).
