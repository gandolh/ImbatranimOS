import * as fs from "fs";
import * as path from "path";

/**
 * The OS's version: `IMAGE_VERSION` when the image sets it, else the `version` of the `package.json` in the
 * folder the backend runs in (the root one in the image). "unknown" when neither says.
 */
export function osVersion(): string {
  if (process.env.IMAGE_VERSION) return process.env.IMAGE_VERSION;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as {
      version?: string;
    };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}
