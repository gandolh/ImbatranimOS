import { defineConfig } from 'vitest/config'

// norPDF had no test runner until brief 143. Node by default; a test that needs a
// DOM opts in with a `// @vitest-environment jsdom` docblock, as apps/core does.
export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts', 'src/**/*.test.tsx'] },
})
