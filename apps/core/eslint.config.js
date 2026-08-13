import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import eslintConfigPrettier from 'eslint-config-prettier'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      eslintConfigPrettier,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Codified convention: a leading underscore marks intentionally unused
      // (e.g. the windowId prop of single-instance apps).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Core must not depend on the apps that plug into it. Exactly one file
      // — src/manifest.ts, the composition root — may import add-on
      // packages; the override below grants it. The one exception is the SDK:
      // @imbatranim/ui sits BELOW core (brief 48), so core links against it
      // the same way every app does.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@imbatranim/*', '!@imbatranim/ui'],
              message: 'Only src/manifest.ts (the composition root) may import add-on packages.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/manifest.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
])
