import { defineConfig } from 'vitest/config'

// The evaluator and the input reducers are pure; this is where calculator correctness bugs
// hide, and the package had no tests at all before the calculator work.
export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
