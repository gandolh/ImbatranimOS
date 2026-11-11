import { defineConfig } from "vitest/config";

// Pure logic — find/replace, caret maths, text stats, the root-default rule and the
// size guard — in node. The editor's save-conflict test opts into jsdom
// with a docblock, the way apps/core's component tests do.
export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts", "src/**/*.test.tsx"] },
});
