import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Round-trip + adapter tests run under Node (Render uses @napi-rs/canvas).
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
