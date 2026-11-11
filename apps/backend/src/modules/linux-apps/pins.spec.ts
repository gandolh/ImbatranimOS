import { mkdirSync, mkdtempSync, rmSync, symlinkSync, readdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { newestSnapshot } from "./channel";
import { currentGeneration, deleteGenerationsExcept, hasGeneration } from "./generations";
import type { PackageRow } from "./package-index";
import {
  compareSnapshots,
  diffVersions,
  effectivePin,
  EMPTY_STATE,
  imagePin,
  nextRelease,
  parsePinState,
  parseSnapshot,
  type Pin,
} from "./pins";

const A: Pin = {
  release: "nixos-26.05",
  snapshot: "nixos-26.05.13446.7dcdd87373d7",
  commit: "7dcdd87373d72e7a2173e4db02e20d3d7f495cfd",
};
const B: Pin = {
  release: "nixos-26.05",
  snapshot: "nixos-26.05.13627.c56a87d8e41c",
  commit: "c56a87d8e41ce69bd2af57eb35dcc117a9dfca33",
};

describe("snapshots", () => {
  it("takes a snapshot name apart and orders by release, then build", () => {
    expect(parseSnapshot(B.snapshot)).toEqual({
      release: "nixos-26.05",
      year: 26,
      month: 5,
      build: 13627,
      short: "c56a87d8e41c",
    });
    expect(parseSnapshot("nixos-26.05.1.zz")).toBeNull();
    expect(compareSnapshots(B.snapshot, A.snapshot)).toBeGreaterThan(0);
    // A new release is newer than any build of the old one.
    expect(compareSnapshots("nixos-26.11.10.aaaaaaaaaaaa", B.snapshot)).toBeGreaterThan(0);
    expect(compareSnapshots(A.snapshot, A.snapshot)).toBe(0);
  });

  it("names the next release: May, then November, then May", () => {
    expect(nextRelease("nixos-26.05")).toBe("nixos-26.11");
    expect(nextRelease("nixos-26.11")).toBe("nixos-27.05");
    expect(nextRelease("nixos-unstable")).toBeNull();
  });
});

describe("the pin state file", () => {
  it("keeps only pins whose name, release and commit agree", () => {
    const state = parsePinState(
      JSON.stringify({
        current: B,
        previous: { ...A, generation: 3, xwaylandGeneration: null },
        checkedAt: 5,
        // A commit that isn't the snapshot's, and one that isn't a commit.
        update: { ...B, commit: A.commit },
        upgrade: { ...B, commit: "x; rm -rf ~" },
      }),
    );
    expect(state.current).toEqual(B);
    expect(state.previous).toEqual({
      ...A,
      generation: 3,
      xwaylandGeneration: null,
    });
    expect(state.update).toBeNull();
    expect(state.upgrade).toBeNull();
    expect(parsePinState("not json")).toEqual(EMPTY_STATE);
  });

  it("reads the image's pin only when its three values agree", () => {
    expect(
      imagePin({
        NIXPKGS_RELEASE: A.release,
        NIXPKGS_SNAPSHOT: A.snapshot,
        NIXPKGS_COMMIT: A.commit,
      }),
    ).toEqual(A);
    expect(imagePin({ NIXPKGS_COMMIT: A.commit })).toBeNull();
  });

  it("installs from the moved pin, unless the image's is at least as new", () => {
    const moved = { ...EMPTY_STATE, current: B };
    expect(effectivePin(A, moved)).toEqual({ pin: B, fromImage: false });
    expect(effectivePin(B, moved)).toEqual({ pin: B, fromImage: true });
    const newer = { ...B, snapshot: "nixos-26.05.13700.c56a87d8e41c" };
    expect(effectivePin(newer, moved)).toEqual({ pin: newer, fromImage: true });
    expect(effectivePin(A, EMPTY_STATE)).toEqual({ pin: A, fromImage: true });
  });
});

describe("the version diff", () => {
  const row = (attr: string, version: string): PackageRow => [attr, attr, version, "", 0];
  it("lists what changes, what stays and what the new list lacks", () => {
    const installed = [
      { name: "firefox", attr: "firefox", version: "159.0" },
      // The store path's name says nothing useful; the lists do.
      { name: "libreoffice", attr: "libreoffice", version: "" },
      { name: "xterm", attr: "xterm", version: "410" },
      { name: "gone", attr: "gone", version: "1" },
    ];
    const from = new Map([
      ["firefox", row("firefox", "159.0")],
      ["libreoffice", row("libreoffice", "25.8.5.2")],
      ["xterm", row("xterm", "410")],
      ["gone", row("gone", "1")],
    ]);
    const to = new Map([
      ["firefox", row("firefox", "159.0.1")],
      ["libreoffice", row("libreoffice", "25.8.5.2")],
      ["xterm", row("xterm", "410")],
    ]);
    expect(diffVersions(installed, from, to)).toEqual({
      changes: [{ name: "firefox", from: "159.0", to: "159.0.1" }],
      missing: ["gone"],
      rebuilt: 2,
    });
  });
});

describe("the channel check", () => {
  const fake = (routes: Record<string, () => Response>) =>
    jest.fn((url: string) => {
      const route = routes[url];
      return Promise.resolve(route ? route() : new Response("", { status: 404 }));
    }) as unknown as typeof fetch;
  const redirect = (to: string) => () => new Response(null, { status: 302, headers: { location: to } });

  it("follows the channel to its snapshot and checks the commit", async () => {
    const f = fake({
      "https://channels.nixos.org/nixos-26.05": redirect(`https://releases.nixos.org/nixos/26.05/${B.snapshot}`),
      [`https://releases.nixos.org/nixos/26.05/${B.snapshot}/git-revision`]: () => new Response(B.commit + "\n"),
    });
    await expect(newestSnapshot("nixos-26.05", f)).resolves.toEqual(B);
    // No channel yet: nothing to offer.
    await expect(newestSnapshot("nixos-26.11", f)).resolves.toBeNull();
  });

  it("refuses a redirect elsewhere, and a revision that is not the name", async () => {
    await expect(
      newestSnapshot(
        "nixos-26.05",
        fake({
          "https://channels.nixos.org/nixos-26.05": redirect(`https://example.org/nixos/26.05/${B.snapshot}`),
        }),
      ),
    ).rejects.toThrow(/didn't point at a snapshot/);
    await expect(
      newestSnapshot(
        "nixos-26.05",
        fake({
          "https://channels.nixos.org/nixos-26.05": redirect(`https://releases.nixos.org/nixos/26.05/${B.snapshot}`),
          [`https://releases.nixos.org/nixos/26.05/${B.snapshot}/git-revision`]: () => new Response(A.commit),
        }),
      ),
    ).rejects.toThrow(/git-revision/);
  });
});

describe("profile generations", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "generations-"));
    mkdirSync(join(root, "profiles"));
    for (const n of [1, 2, 3, 4]) symlinkSync(join(root, `store-${n}`), join(root, "profiles", `profile-${n}-link`));
    symlinkSync("profile-3-link", join(root, "profiles", "profile"));
    // $NIX_STATE_HOME/profile, one more link in front.
    symlinkSync(join(root, "profiles", "profile"), join(root, "profile"));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("reads the current generation through the links", async () => {
    expect(await currentGeneration(join(root, "profile"))).toEqual({
      dir: join(root, "profiles"),
      name: "profile",
      current: 3,
    });
    expect(await hasGeneration(join(root, "profile"), 2)).toBe(true);
    expect(await hasGeneration(join(root, "profile"), 9)).toBe(false);
    expect(await currentGeneration(join(root, "none"))).toBeNull();
  });

  it("deletes every generation but the current one and the one kept", async () => {
    expect(await deleteGenerationsExcept(join(root, "profile"), [1])).toEqual([2, 4]);
    expect(readdirSync(join(root, "profiles")).sort()).toEqual(["profile", "profile-1-link", "profile-3-link"]);
  });
});
