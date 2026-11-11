import { Global, Module, ValidationPipe, type INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import type { Server } from "http";
import { tmpdir } from "os";
import { join } from "path";
import request from "supertest";

import { DbModule } from "../src/db/db.module";
import { DbService } from "../src/db/db.service";
import { IdentityModule } from "../src/modules/identity/identity.module";
import { MarketplaceModule } from "../src/modules/marketplace/marketplace.module";
import { MarketplaceService } from "../src/modules/marketplace/marketplace.service";
import { PtyModule } from "../src/modules/pty/pty.module";
import { UpgradeRoutesModule } from "../src/upgrade-routes";
import { hooksDescriptor, makeHooksRepo } from "./fixtures/hooks-repo";
import { kitDescriptor, makeKitRepo, type KitRepo } from "./fixtures/kit-repo";
import { makeSuiteRepo, suiteDescriptor } from "./fixtures/suite-repo";

/**
 * Kit apps, end to end against a real git repository on disk: a
 * version 2 descriptor with `sharedKit` installs its apps with their
 * stylesheets; the listing says the shared kit version the live build was
 * made against and where each app's stylesheets are served; the row records
 * both; a build that leaves a listed stylesheet out fails and keeps the live
 * build; a descriptor without `sharedKit` lists and records exactly as
 * one catalog entry, several apps left it; and the hooks a kit app declares
 * are listed, and recorded with the build that declared them.
 */
const DESKTOP = "http://localhost:5173";
const PASSWORD = "correct horse battery";

interface Listed {
  id: string;
  descriptorId: string;
  sharedKit: number | null;
  background: boolean;
  commandSources: boolean;
  catalogSharedKit: number | null;
  ref: string;
  installed: {
    ref: string;
    buildId: string;
    entryPath?: string;
    stylePaths?: string[];
    missing: boolean;
  } | null;
  job: { state: string; reason?: string } | null;
}

describe("kit apps (e2e)", () => {
  let work: string;
  let prevFilesRoot: string | undefined;
  let catalog: string;
  let appsDir: string;
  let repoUrl: string;
  let commits: KitRepo;
  let hooksRepoUrl: string;
  let hooksCommit: string;
  let app: INestApplication<Server>;
  let http: ReturnType<typeof request>;
  let cookie: string;

  const write = (d: Record<string, unknown> & { id: string }) =>
    writeFileSync(join(catalog, `${d.id}.json`), JSON.stringify(d));

  beforeAll(async () => {
    work = mkdtempSync(join(tmpdir(), "imb-marketplace-kit-"));
    // Uninstalling removes apps' cache folders from the home: this one.
    prevFilesRoot = process.env.FILES_ROOT;
    process.env.FILES_ROOT = join(work, "home");
    const repo = join(work, "repo");
    commits = makeKitRepo(repo);
    repoUrl = `file://${repo}`;
    catalog = join(work, "catalog");
    mkdirSync(catalog);

    write(kitDescriptor(repoUrl, commits.whole));
    // A mount suite beside it, from one catalog entry, several apps's repository.
    const suiteRepo = join(work, "suite-repo");
    const suite = makeSuiteRepo(suiteRepo);
    write(suiteDescriptor(`file://${suiteRepo}`, suite.whole));
    // Hooks: a kit app declaring both, and one declaring an export it lacks.
    const hooksRepo = join(work, "hooks-repo");
    hooksCommit = makeHooksRepo(hooksRepo);
    hooksRepoUrl = `file://${hooksRepo}`;
    write(hooksDescriptor(hooksRepoUrl, hooksCommit));
    // Refused: a hook on a descriptor that is not a kit's.
    write(
      suiteDescriptor(`file://${suiteRepo}`, suite.whole, {
        id: "hooked",
        apps: [
          {
            id: "hooked-one",
            name: "One",
            entry: "alpha/app.mjs",
            background: true,
            capabilities: [],
          },
        ],
      }),
    );
    // Refused: styles on a descriptor that is not a kit's.
    write(
      suiteDescriptor(`file://${suiteRepo}`, suite.whole, {
        id: "styled",
        apps: [
          {
            id: "styled-one",
            name: "One",
            entry: "alpha/app.mjs",
            styles: ["alpha/app.css"],
            capabilities: [],
          },
        ],
      }),
    );

    const values: Record<string, unknown> = {
      DB_PATH: join(work, "home", ".imbatranim", "db.sqlite"),
      FRONTEND_URL: DESKTOP,
      MARKETPLACE_DIR: catalog,
      MARKETPLACE_ALLOW_LOCAL_REPOS: true,
    };
    mkdirSync(join(work, "home", ".imbatranim"), { recursive: true });
    appsDir = join(work, "home", ".imbatranim", "apps");

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
  }, 30_000);

  afterAll(async () => {
    await app.close();
    rmSync(work, { recursive: true, force: true });
    if (prevFilesRoot === undefined) delete process.env.FILES_ROOT;
    else process.env.FILES_ROOT = prevFilesRoot;
  });

  const listing = async () => {
    const res = await http.get("/api/marketplace").set("Cookie", cookie).expect(200);
    return res.body as {
      apps: Listed[];
      problems: { file: string; problem: string }[];
    };
  };
  const listed = async (id: string) => (await listing()).apps.find((a) => a.id === id)!;
  const install = async (id: string) => {
    await http.post(`/api/marketplace/apps/${id}/install`).set("Cookie", cookie).expect(202);
    await app.get(MarketplaceService).settled();
  };
  const row = (id: string) =>
    app.get(DbService).db.prepare("SELECT entry, entries FROM marketplace_apps WHERE id = ?").get(id) as {
      entry: string;
      entries: string;
    };

  it("lists a kit descriptor's shared kit version before it is installed, and refuses styles without one", async () => {
    const { apps, problems } = await listing();
    const notes = apps.find((a) => a.id === "kit-notes")!;
    expect(notes).toMatchObject({
      descriptorId: "kit",
      sharedKit: 1,
      catalogSharedKit: 1,
      installed: null,
    });
    expect(apps.find((a) => a.id === "suite-alpha")).toMatchObject({
      sharedKit: null,
      catalogSharedKit: null,
    });
    expect(problems).toEqual([
      {
        file: "hooked.json",
        problem: "apps.0.background: only a kit app (with sharedKit) may declare background",
      },
      {
        file: "styled.json",
        problem: "apps.0.styles: only a kit app (with sharedKit) may list styles",
      },
    ]);
    // An app that declares no hook lists none.
    expect(notes).toMatchObject({ background: false, commandSources: false });
  });

  it("installs the kit apps with their stylesheets, and serves them as CSS", async () => {
    await install("kit");
    const notes = await listed("kit-notes");
    const hello = await listed("kit-hello");
    expect(notes.job).toBeNull();
    expect(notes.installed?.missing).toBe(false);
    const base = `marketplace/apps/kit/b/${notes.installed!.buildId}`;
    expect(notes.installed?.entryPath).toBe(`${base}/notes/app.mjs`);
    expect(notes.installed?.stylePaths).toEqual([`${base}/kit.css`]);
    expect(hello.installed?.stylePaths).toEqual([`${base}/kit.css`]);
    expect(notes.sharedKit).toBe(1);

    const css = await http.get(`/api/${notes.installed!.stylePaths![0]}`).set("Cookie", cookie).expect(200);
    expect(css.headers["content-type"]).toMatch(/^text\/css/);
    expect(css.text).toContain(".border-heritage");
    const mod = await http.get(`/api/${notes.installed!.entryPath!}`).set("Cookie", cookie).expect(200);
    expect(mod.headers["content-type"]).toMatch(/^text\/javascript/);
    expect(mod.text).toContain("globalThis.__imbatranimShared");
    expect(mod.text).toContain("export function App");

    // Each app's module, stylesheets and shared kit version, as built.
    expect(row("kit").entry).toBe("dist/os");
    expect(JSON.parse(row("kit").entries)).toEqual({
      "kit-notes": {
        entry: "notes/app.mjs",
        styles: ["kit.css"],
        sharedKit: 1,
      },
      "kit-hello": {
        entry: "hello/app.mjs",
        styles: ["kit.css"],
        sharedKit: 1,
      },
    });
  }, 30_000);

  it("lists what the live build was made against until a reinstall", async () => {
    const before = await listed("kit-notes");
    write(kitDescriptor(repoUrl, commits.whole, { sharedKit: 99 }));
    try {
      expect((await listed("kit-notes")).sharedKit).toBe(1);
      await install("kit");
      const after = await listed("kit-notes");
      expect(after.installed?.buildId).not.toBe(before.installed?.buildId);
      expect(after.sharedKit).toBe(99);
    } finally {
      write(kitDescriptor(repoUrl, commits.whole));
      await install("kit");
    }
    expect((await listed("kit-notes")).sharedKit).toBe(1);
  }, 60_000);

  it("reports the catalog's kit beside the build's, so a rebuild at the same ref can be offered", async () => {
    expect(await listed("kit-notes")).toMatchObject({
      sharedKit: 1,
      catalogSharedKit: 1,
    });
    // The catalog moves to another kit at the same ref: the build still says
    // what it was made against, and the catalog what a rebuild would make.
    write(kitDescriptor(repoUrl, commits.whole, { sharedKit: 99 }));
    try {
      const bumped = await listed("kit-notes");
      expect(bumped).toMatchObject({ sharedKit: 1, catalogSharedKit: 99 });
      expect(bumped.ref).toBe(bumped.installed?.ref);
    } finally {
      write(kitDescriptor(repoUrl, commits.whole));
    }
    expect(await listed("kit-notes")).toMatchObject({
      sharedKit: 1,
      catalogSharedKit: 1,
    });
  });

  it("fails an update whose build leaves a stylesheet out, and keeps the live build", async () => {
    const before = await listed("kit-notes");
    write(kitDescriptor(repoUrl, commits.leavesOutStyle));
    try {
      await install("kit");
      const notes = await listed("kit-notes");
      expect(notes.job?.state).toBe("failed");
      expect(notes.job?.reason).toBe("The build did not produce dist/os/kit.css");
      expect(notes.installed?.buildId).toBe(before.installed?.buildId);
      expect(notes.installed?.ref).toBe(commits.whole);
      await http.get(`/api/${notes.installed!.stylePaths![0]}`).set("Cookie", cookie).expect(200);
      expect(readdirSync(appsDir).filter((n) => n.startsWith("kit@"))).toEqual([`kit@${before.installed!.buildId}`]);
      expect(readFileSync(join(appsDir, "kit.log"), "utf8")).toContain("✗ The build did not produce dist/os/kit.css");
    } finally {
      write(kitDescriptor(repoUrl, commits.whole));
    }
  }, 30_000);

  it("records and lists a mount suite exactly as one catalog entry, several apps did", async () => {
    await install("suite");
    const alpha = await listed("suite-alpha");
    expect(alpha.sharedKit).toBeNull();
    expect(alpha.installed?.stylePaths).toEqual([]);
    expect(JSON.parse(row("suite").entries)).toEqual({
      "suite-alpha": "alpha/app.mjs",
      "suite-beta": "beta/app.mjs",
    });
  }, 30_000);

  it("lists the hooks a kit app declares, and records them with its build", async () => {
    expect(await listed("kit-ticker")).toMatchObject({
      background: true,
      commandSources: true,
      installed: null,
    });
    await install("kit-hooks");
    const ticker = await listed("kit-ticker");
    expect(ticker.job).toBeNull();
    expect(ticker).toMatchObject({ background: true, commandSources: true });
    expect(await listed("kit-hookless")).toMatchObject({
      background: true,
      commandSources: false,
    });
    // Only the hooks each app declared.
    expect(JSON.parse(row("kit-hooks").entries)).toEqual({
      "kit-ticker": {
        entry: "ticker/app.mjs",
        styles: [],
        sharedKit: 1,
        background: true,
        commandSources: true,
      },
      "kit-hookless": {
        entry: "hookless/app.mjs",
        styles: [],
        sharedKit: 1,
        background: true,
      },
    });
    const mod = await http.get(`/api/${ticker.installed!.entryPath!}`).set("Cookie", cookie).expect(200);
    expect(mod.text).toContain("export function Background");
    expect(mod.text).toContain("export const commandSources");

    // The descriptor drops a hook without a new build: the live build's
    // declaration stands until the next install.
    write(
      hooksDescriptor(hooksRepoUrl, hooksCommit, {
        apps: [
          {
            id: "kit-ticker",
            name: "Ticker",
            entry: "ticker/app.mjs",
            capabilities: ["notify"],
          },
          {
            id: "kit-hookless",
            name: "Hookless",
            entry: "hookless/app.mjs",
            capabilities: [],
          },
        ],
      }),
    );
    try {
      expect(await listed("kit-ticker")).toMatchObject({
        background: true,
        commandSources: true,
      });
    } finally {
      write(hooksDescriptor(hooksRepoUrl, hooksCommit));
    }

    await http.delete("/api/marketplace/apps/kit-hooks").set("Cookie", cookie).expect(204);
    expect((await listed("kit-ticker")).installed).toBeNull();
  }, 30_000);

  it("uninstalls the kit descriptor: both apps, and their stylesheets are no longer served", async () => {
    const notes = await listed("kit-notes");
    await http.delete("/api/marketplace/apps/kit").set("Cookie", cookie).expect(204);
    expect((await listed("kit-notes")).installed).toBeNull();
    expect((await listed("kit-hello")).installed).toBeNull();
    await http.get(`/api/${notes.installed!.stylePaths![0]}`).set("Cookie", cookie).expect(404);
  });
});
