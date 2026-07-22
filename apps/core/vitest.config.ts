import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Pure geometry + store logic runs under Node; the tests stub `window`.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
