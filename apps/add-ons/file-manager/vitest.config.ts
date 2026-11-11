import { defineConfig } from "vitest/config";

// Pure logic runs in node. The listing's test renders the app and opts into
// jsdom with a docblock.
export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts", "src/**/*.test.tsx"] },
});
