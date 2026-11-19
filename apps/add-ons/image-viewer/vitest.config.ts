import { defineConfig } from "vitest/config";

// Pure logic runs in node. The viewer's test renders the app and opts into jsdom with a docblock.
// A fixed zone east of UTC, so the day-grouping tests tell local days from UTC days on any machine.
export default defineConfig({
  test: { environment: "node", env: { TZ: "Europe/Bucharest" }, include: ["src/**/*.test.ts", "src/**/*.test.tsx"] },
});
