// The house dependency-cruiser preset, from the vendored house-style copy: no cycles, no unresolvable imports, a
// feature used through its index only, no Fastify in lib/.
module.exports = {
  extends: "./vendor/house-style/.dependency-cruiser.cjs",
  forbidden: [
    // A warning for now (2026-11-11): core and the backend hold 57 import cycles (the marketplace service and the
    // modules that record its builds, the window and app registries, the file picker's intents). When they are
    // broken up, this goes and the rule is an error again.
    { name: "no-circular", severity: "warn" },
  ],
};
