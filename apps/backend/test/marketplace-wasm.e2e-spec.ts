import { Global, Module, ValidationPipe, type INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import type { IncomingHttpHeaders, Server } from "http";
import { tmpdir } from "os";
import { join } from "path";
import request from "supertest";

import { DbModule } from "../src/db/db.module";
import { IdentityModule } from "../src/modules/identity/identity.module";
import { MarketplaceModule } from "../src/modules/marketplace/marketplace.module";
import { MarketplaceService } from "../src/modules/marketplace/marketplace.service";
import { PtyModule } from "../src/modules/pty/pty.module";
import { EMBEDDER_POLICY, securityHeaders } from "../src/security-headers";
import { UpgradeRoutesModule } from "../src/upgrade-routes";
import { makeWasmRepo, wasmDescriptor } from "./fixtures/wasm-repo";

/**
 * A kit app that runs WebAssembly with threads, end to end against a real
 * git repository on disk: it installs, its `.wasm` is served beside its
 * module as `application/wasm` and compiles to an `add` that adds, and its
 * module and worker come with the desktop's headers: a CSP that lets them
 * compile WASM, and the isolation that gives the page SharedArrayBuffer.
 * The desktop's headers are mounted as `main.ts` mounts them. The browser
 * half (the page and the worker sharing memory) is the fixture's walk.
 */
const DESKTOP = "http://localhost:5173";
const PASSWORD = "correct horse battery";

interface Listed {
  id: string;
  installed: { buildId: string; entryPath?: string; missing: boolean } | null;
  job: { state: string; reason?: string } | null;
}

function scriptSrc(headers: IncomingHttpHeaders): string | undefined {
  return String(headers["content-security-policy"])
    .split("; ")
    .find((d) => d.startsWith("script-src "));
}

function expectIsolated(headers: IncomingHttpHeaders) {
  expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
  expect(headers["cross-origin-embedder-policy"]).toBe(EMBEDDER_POLICY);
}

describe("a kit app with WebAssembly and threads (e2e)", () => {
  let work: string;
  let app: INestApplication<Server>;
  let http: ReturnType<typeof request>;
  let cookie: string;

  beforeAll(async () => {
    work = mkdtempSync(join(tmpdir(), "imb-marketplace-wasm-"));
    const repo = join(work, "repo");
    const { whole } = makeWasmRepo(repo);
    const catalog = join(work, "catalog");
    mkdirSync(catalog);
    writeFileSync(join(catalog, "wasm.json"), JSON.stringify(wasmDescriptor(`file://${repo}`, whole)));

    const values: Record<string, unknown> = {
      DB_PATH: join(work, "home", ".imbatranim", "db.sqlite"),
      FRONTEND_URL: DESKTOP,
      MARKETPLACE_DIR: catalog,
      MARKETPLACE_ALLOW_LOCAL_REPOS: true,
    };
    mkdirSync(join(work, "home", ".imbatranim"), { recursive: true });

    @Global()
    @Module({
      providers: [
        {
          provide: ConfigService,
          useValue: { get: (key: string) => values[key] },
        },
      ],
      exports: [ConfigService],
    })
    class TestConfig {}

    const moduleRef = await Test.createTestingModule({
      imports: [TestConfig, DbModule, IdentityModule, UpgradeRoutesModule, PtyModule, MarketplaceModule],
    }).compile();
    app = moduleRef.createNestApplication<INestApplication<Server>>({
      logger: false,
    });
    app.use(securityHeaders);
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.listen(0);
    http = request(app.getHttpServer());

    await http.post("/api/identity/local/setup").send({ username: "Ana", password: PASSWORD }).expect(204);
    const signedIn = await http.post("/api/identity/local/sign-in").send({ password: PASSWORD }).expect(204);
    cookie = [signedIn.headers["set-cookie"]]
      .flat()
      .map((c: string) => c.split(";")[0])
      .join("; ");

    await http.post("/api/marketplace/apps/wasm/install").set("Cookie", cookie).expect(202);
    await app.get(MarketplaceService).settled();
  }, 30_000);

  afterAll(async () => {
    await app.close();
    rmSync(work, { recursive: true, force: true });
  });

  const entry = async () => {
    const res = await http.get("/api/marketplace").set("Cookie", cookie).expect(200);
    const listed = (res.body as { apps: Listed[] }).apps.find((a) => a.id === "wasm-threads")!;
    expect(listed.job).toBeNull();
    expect(listed.installed?.missing).toBe(false);
    return `/api/${listed.installed!.entryPath!}`;
  };
  const beside = (path: string, file: string) => path.replace(/app\.mjs$/, file);

  it("serves the module with a CSP that lets it compile WASM, and the isolation headers", async () => {
    const path = await entry();
    expect(path).toMatch(/\/threads\/app\.mjs$/);
    const mod = await http.get(path).set("Cookie", cookie).expect(200);
    expect(mod.headers["content-type"]).toMatch(/^text\/javascript/);
    expect(mod.text).toContain("new URL('./add.wasm', import.meta.url)");
    expect(scriptSrc(mod.headers)).toBe("script-src 'self' 'wasm-unsafe-eval'");
    expectIsolated(mod.headers);
  });

  it("serves the .wasm beside the module as application/wasm, and it adds", async () => {
    const res = await http
      .get(beside(await entry(), "add.wasm"))
      .set("Cookie", cookie)
      .buffer(true)
      .parse((r, done) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(res.headers["content-type"]).toBe("application/wasm");
    const wasm = await WebAssembly.compile(new Uint8Array(res.body as Buffer));
    const add = new WebAssembly.Instance(wasm).exports.add as (a: number, b: number) => number;
    expect(add(2, 3)).toBe(5);
    expect(add(7, 35)).toBe(42);
  });

  it("serves the worker with the policy it runs under: WASM allowed, isolated", async () => {
    const worker = await http
      .get(beside(await entry(), "worker.mjs"))
      .set("Cookie", cookie)
      .expect(200);
    expect(worker.headers["content-type"]).toMatch(/^text\/javascript/);
    expect(worker.text).toContain("Atomics.store");
    expect(scriptSrc(worker.headers)).toBe("script-src 'self' 'wasm-unsafe-eval'");
    expectIsolated(worker.headers);
  });
});
