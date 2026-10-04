import { defineConfig } from 'vitest/config'

// The address parser and the host-message guards are pure; the frame itself is
// exercised in the running container.
export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
