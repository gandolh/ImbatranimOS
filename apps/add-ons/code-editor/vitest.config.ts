import { defineConfig } from "vitest/config";

// Pure logic only — no DOM needed. Mirrors apps/add-ons/media-player's setup. The
// editor's save-conflict test opts into jsdom with a docblock and fakes
// Monaco, which cannot run there.
export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts", "src/**/*.test.tsx"] },
});
