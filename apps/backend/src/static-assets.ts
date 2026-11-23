import { createReadStream, readdirSync, statSync } from "fs";
import { extname, join, sep } from "path";
import type { NextFunction, Request, Response } from "express";

/**
 * How the built desktop is sent. Vite names every file under `/assets/` after
 * a hash of its content, so a name never changes meaning and the browser may
 * keep it for a year without asking again; `index.html`, which names the
 * current hashes, is asked about on every load. The default (`max-age=0`)
 * made every reload revalidate each of the 20-odd modules of the first page
 * load, one request each.
 */
export const IMMUTABLE = "public, max-age=31536000, immutable";
const ASSETS = "/assets/";

/**
 * `setHeaders` for the static server over `root`: a year for a hashed asset,
 * a check on every load for the rest (`index.html`, the favicon).
 */
export function staticHeadersFor(root: string): (res: Response, path: string) => void {
  const assets = join(root, "assets") + sep;
  return (res, path) => {
    res.setHeader("Cache-Control", path.startsWith(assets) ? IMMUTABLE : "no-cache");
  };
}

type Encoding = "br" | "gzip";
const SUFFIX: Record<Encoding, string> = { br: ".br", gzip: ".gz" };
type Variants = Partial<Record<Encoding, { path: string; size: number }>>;

/**
 * Which encodings a request accepts, from `Accept-Encoding` (RFC 9110
 * §12.5.3): a coding listed with `q=0` is refused, `*` stands for any coding
 * not listed, and a request without the header takes only the file as it is.
 */
export function acceptedEncodings(header: string | undefined): Set<Encoding> {
  const accepted = new Set<Encoding>();
  if (!header) return accepted;
  const listed = new Map<string, number>();
  for (const part of header.split(",")) {
    const [name = "", ...params] = part.trim().toLowerCase().split(";");
    const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    const weight = q === undefined ? 1 : Number(q.slice(2));
    if (name) listed.set(name, Number.isFinite(weight) ? weight : 0);
  }
  for (const encoding of ["br", "gzip"] as const) {
    const weight = listed.get(encoding) ?? listed.get("*") ?? 0;
    if (weight > 0) accepted.add(encoding);
  }
  return accepted;
}

/**
 * Sends a hashed asset in the encoding the build already made for it: the
 * desktop's build writes a `.br` and a `.gz` beside each script, stylesheet
 * and font it can shrink, so nothing is compressed per request, here or in a
 * proxy in front (a response that carries `Content-Encoding` is passed on as
 * it is). Brotli first, since it is the smaller; a request that takes
 * neither, or asks for a range, gets the file itself from the static server
 * after this. The directory is read once, at start: only a name in that
 * listing is ever opened, so a path in the URL never reaches the file system.
 */
export function precompressedAssets(root: string): (req: Request, res: Response, next: NextFunction) => void {
  const dir = join(root, ASSETS);
  const variants = new Map<string, Variants>();
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    // No built desktop here: nothing to send compressed.
  }
  const present = new Set(names);
  for (const name of names) {
    for (const encoding of ["br", "gzip"] as const) {
      const suffix = SUFFIX[encoding];
      if (!name.endsWith(suffix)) continue;
      const original = name.slice(0, -suffix.length);
      if (!present.has(original)) continue;
      const path = join(dir, name);
      const entry = variants.get(original) ?? {};
      entry[encoding] = { path, size: statSync(path).size };
      variants.set(original, entry);
    }
  }

  return (req, res, next) => {
    if ((req.method !== "GET" && req.method !== "HEAD") || !req.path.startsWith(ASSETS)) return next();
    const name = req.path.slice(ASSETS.length);
    const entry = variants.get(name);
    if (!entry) return next();
    // The answer depends on the header for this name, whichever is sent.
    res.setHeader("Vary", "Accept-Encoding");
    if (req.headers.range !== undefined) return next();
    const accepted = acceptedEncodings(req.headers["accept-encoding"]);
    const encoding = (["br", "gzip"] as const).find((e) => accepted.has(e) && entry[e]);
    const variant = encoding && entry[encoding];
    if (!encoding || !variant) return next();

    res.setHeader("Cache-Control", IMMUTABLE);
    res.type(extname(name));
    res.setHeader("Content-Encoding", encoding);
    res.setHeader("Content-Length", variant.size);
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    createReadStream(variant.path).on("error", next).pipe(res);
  };
}
