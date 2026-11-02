import { defineConfig } from 'vitest/config'

// Pure logic — the intent normaliser and the re-delivery rule.
// No DOM needed.
export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
