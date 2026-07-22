/**
 * Public error types for `@pdfcore/engine`.
 *
 * Errors are part of the public surface so callers (and later briefs) can
 * branch on them. No backend-library error type is ever re-thrown directly.
 */

/** Base class for all errors thrown by `@pdfcore/engine`. */
export class PdfEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfEngineError";
  }
}

/**
 * Thrown by a capability method that exists in the interface but is not yet
 * implemented by the current backend adapter. The message names the capability
 * method and the brief that will add it, so callers get an actionable signal
 * rather than a silent no-op.
 *
 * @example
 *   throw new NotImplemented("Pages.rotate", "added by brief 11");
 */
export class NotImplemented extends PdfEngineError {
  constructor(what: string, detail?: string) {
    super(`${what} is not implemented yet${detail ? ` — ${detail}` : ""}.`);
    this.name = "NotImplemented";
  }
}

/**
 * Thrown when a capability cannot run on the current platform (e.g. canvas
 * rendering without a bound platform, or a Node-only feature in the browser).
 * Fails fast rather than silently degrading (see architecture.md platform
 * matrix / DEC-34).
 */
export class UnsupportedPlatform extends PdfEngineError {
  constructor(what: string, detail?: string) {
    super(
      `${what} is not available on this platform${detail ? ` — ${detail}` : ""}.`,
    );
    this.name = "UnsupportedPlatform";
  }
}
