import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import eslintConfigPrettier from 'eslint-config-prettier'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.ts'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      eslintConfigPrettier,
    ],
    languageOptions: {
      // The engine spans browser (Render/text-layer) and node (render path,
      // tests) — allow both global sets.
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // A leading underscore marks intentionally unused bindings. Kept as a
      // warning (not error) so the vendored engine source lints clean without
      // edits — this is a source-of-truth copy of @pdfcore/engine.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // document.ts uses a deliberate `@ts-ignore` for the pdf.js legacy subpath
      // (ships no type declarations). Allow ts-directives with a description.
      '@typescript-eslint/ban-ts-comment': [
        'warn',
        { 'ts-ignore': 'allow-with-description' },
      ],
    },
  },
])
