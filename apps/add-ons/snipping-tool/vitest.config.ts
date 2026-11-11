import { defineConfig } from "vitest/config";

// Pure logic only — the lossy-region scan's geometry and the annotation maths. The parts
// that need a real canvas (that a redaction is flattened into the exported PNG) are measured
// in a browser instead; see the snipping tool honest capture work's outcome note.
export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
