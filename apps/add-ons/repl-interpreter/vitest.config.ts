import { defineConfig } from "vitest/config";

// Pure logic — close-code classification, theme mapping, font-size persistence, the paste rule — runs in
// node; the storage tests install a small localStorage stub. The Terminal's component test opts into jsdom
// with a docblock and fakes xterm, which cannot render there.
export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts", "src/**/*.test.tsx"] },
});
