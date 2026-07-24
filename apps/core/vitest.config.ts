import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Pure geometry + store logic runs under Node; the tests stub `window`.
    // Component tests opt into jsdom per-file via a `@vitest-environment`
    // docblock (see AppErrorBoundary.test.tsx) rather than flipping this
    // global default.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
