// The house format from the vendored house-style copy (width 120, trailing commas, double quotes,
// semicolons), plus the Tailwind plugin, which sorts class names in the web workspaces.
import house from "./vendor/house-style/prettier.config.js";

export default { ...house, plugins: ["prettier-plugin-tailwindcss"] };
