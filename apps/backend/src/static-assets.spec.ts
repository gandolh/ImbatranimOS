import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { brotliCompressSync, gzipSync } from "zlib";
import express from "express";
import request from "supertest";

import { IMMUTABLE, acceptedEncodings, precompressedAssets, staticHeadersFor } from "./static-assets";

const SCRIPT = `export const answer = ${"42 + ".repeat(400)}0;\n`;

let root: string;
let app: express.Express;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "static-assets-"));
  mkdirSync(join(root, "assets"));
  writeFileSync(join(root, "index.html"), "<!doctype html>");
  writeFileSync(join(root, "assets", "main-abc.js"), SCRIPT);
  writeFileSync(join(root, "assets", "main-abc.js.br"), brotliCompressSync(SCRIPT));
  writeFileSync(join(root, "assets", "main-abc.js.gz"), gzipSync(SCRIPT));
  writeFileSync(join(root, "assets", "only-gz.css"), "body{}".repeat(300));
  writeFileSync(join(root, "assets", "only-gz.css.gz"), gzipSync("body{}".repeat(300)));
  writeFileSync(join(root, "assets", "plain.svg"), "<svg/>");
  // A compressed copy whose file is missing is never sent.
  writeFileSync(join(root, "assets", "orphan.js.br"), brotliCompressSync("x"));

  app = express();
  app.use(precompressedAssets(root));
  app.use(express.static(root, { setHeaders: staticHeadersFor(root) }));
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

/** The body as text: supertest has already undone the encoding, so `Content-Length` shows which copy was sent. */
function text(res: request.Response, done: (err: Error | null, body: string) => void) {
  const chunks: Buffer[] = [];
  res.on("data", (c: Buffer) => chunks.push(c));
  res.on("end", () => done(null, Buffer.concat(chunks).toString()));
}

describe("acceptedEncodings", () => {
  it("takes what the header lists and nothing without one", () => {
    expect([...acceptedEncodings("gzip, deflate, br, zstd")].sort()).toEqual(["br", "gzip"]);
    expect([...acceptedEncodings("gzip, deflate")]).toEqual(["gzip"]);
    expect([...acceptedEncodings(undefined)]).toEqual([]);
    expect([...acceptedEncodings("")]).toEqual([]);
  });

  it("refuses a coding at q=0 and lets * stand for the rest", () => {
    expect([...acceptedEncodings("br;q=0, gzip;q=0.5")]).toEqual(["gzip"]);
    expect([...acceptedEncodings("*")].sort()).toEqual(["br", "gzip"]);
    expect([...acceptedEncodings("*;q=0, gzip")]).toEqual(["gzip"]);
    expect([...acceptedEncodings("BR; Q=1")]).toEqual(["br"]);
    expect([...acceptedEncodings("br;q=nonsense")]).toEqual([]);
  });
});

describe("precompressedAssets", () => {
  it("sends brotli when it is accepted, cached for a year", async () => {
    const res = await request(app)
      .get("/assets/main-abc.js")
      .set("Accept-Encoding", "gzip, br")
      .buffer(true)
      .parse(text);
    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBe("br");
    expect(res.headers["content-type"]).toMatch(/javascript/);
    expect(res.headers["cache-control"]).toBe(IMMUTABLE);
    expect(res.headers.vary).toBe("Accept-Encoding");
    expect(Number(res.headers["content-length"])).toBe(brotliCompressSync(SCRIPT).length);
    expect(res.body).toBe(SCRIPT);
  });

  it("sends gzip to a client that takes only gzip", async () => {
    const res = await request(app).get("/assets/main-abc.js").set("Accept-Encoding", "gzip").buffer(true).parse(text);
    expect(res.headers["content-encoding"]).toBe("gzip");
    expect(Number(res.headers["content-length"])).toBe(gzipSync(SCRIPT).length);
    expect(res.body).toBe(SCRIPT);
  });

  it("uses the encoding a file has when the better one is missing", async () => {
    const res = await request(app)
      .get("/assets/only-gz.css")
      .set("Accept-Encoding", "br, gzip")
      .buffer(true)
      .parse(text);
    expect(res.headers["content-encoding"]).toBe("gzip");
    expect(res.headers["content-type"]).toMatch(/text\/css/);
  });

  it("leaves the file itself to the static server when no encoding is taken", async () => {
    const res = await request(app).get("/assets/main-abc.js").set("Accept-Encoding", "identity");
    expect(res.headers["content-encoding"]).toBeUndefined();
    expect(res.headers.vary).toBe("Accept-Encoding");
    expect(res.headers["cache-control"]).toBe(IMMUTABLE);
    expect(res.text).toBe(SCRIPT);
  });

  it("leaves a range request to the static server", async () => {
    const res = await request(app).get("/assets/main-abc.js").set("Accept-Encoding", "br").set("Range", "bytes=0-5");
    expect(res.status).toBe(206);
    expect(res.headers["content-encoding"]).toBeUndefined();
    expect(res.text).toBe(SCRIPT.slice(0, 6));
  });

  it("answers HEAD with the compressed length and no body", async () => {
    const res = await request(app).head("/assets/main-abc.js").set("Accept-Encoding", "br");
    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBe("br");
    expect(Number(res.headers["content-length"])).toBe(brotliCompressSync(SCRIPT).length);
  });

  it("never sends a compressed copy whose file is missing, or a name outside the listing", async () => {
    const orphan = await request(app).get("/assets/orphan.js").set("Accept-Encoding", "br");
    expect(orphan.status).toBe(404);
    const escape = await request(app).get("/assets/..%2Findex.html").set("Accept-Encoding", "br");
    expect(escape.headers["content-encoding"]).toBeUndefined();
  });

  it("is a no-op where there is no built desktop", async () => {
    const empty = express();
    empty.use(precompressedAssets(join(root, "missing")));
    empty.use((_req, res) => {
      res.status(204).end();
    });
    const res = await request(empty).get("/assets/main-abc.js").set("Accept-Encoding", "br");
    expect(res.status).toBe(204);
  });
});

describe("staticHeadersFor", () => {
  it("caches a hashed asset for a year and checks index.html on every load", async () => {
    const svg = await request(app).get("/assets/plain.svg");
    expect(svg.headers["cache-control"]).toBe(IMMUTABLE);
    const page = await request(app).get("/index.html");
    expect(page.headers["cache-control"]).toBe("no-cache");
  });
});
