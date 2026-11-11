import { required } from "../../lib/required";
import { ConflictException, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { execFile } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { promisify } from "util";
import { childEnv } from "../../child-env";
import { downloadRaw, downloadSnapshotIndex, newestSnapshot, type Download, type Fetch } from "./channel";
import { currentGeneration, deleteGenerationsExcept, hasGeneration } from "./generations";
import { pinIndexDir, pinStateFile, xwaylandBinary, type LinuxAppsPaths } from "./linux-apps.paths";
import { LinuxAppsService, type Job, type JobSteps, type PinsNow } from "./linux-apps.service";
import {
  compareSnapshots,
  diffVersions,
  nextRelease,
  rowsByAttr,
  writePinState,
  type KeptPin,
  type Pin,
  type VersionDiff,
} from "./pins";

const run = promisify(execFile);

/** Newer releases looked for past the current one, at most. */
const RELEASES_AHEAD = 4;

export interface PinView {
  release: string;
  snapshot: string;
  commit: string;
}

/** A newer pin a check found, and what moving to it does to the installed apps. */
export interface Offer extends PinView, VersionDiff {}

export interface UpdatesStatus {
  /** Linux apps are here and the image's pin names its snapshot. */
  available: boolean;
  current: (PinView & { fromImage: boolean }) | null;
  /** The pin Go back returns to, while its apps are still on disk. */
  previous: PinView | null;
  checkedAt: number | null;
  /** A newer snapshot of the current release: fixes. */
  update: Offer | null;
  /** A newer release, which the owner takes when they choose. */
  upgrade: Offer | null;
}

function view(pin: Pin): PinView {
  return { release: pin.release, snapshot: pin.snapshot, commit: pin.commit };
}

/** What the registry entry points `nixpkgs` at, as the image writes it. */
function flakeRef(commit: string): string {
  return `github:NixOS/nixpkgs/${commit}`;
}

/**
 * Settings → Updates for Linux apps: Check asks the release's channel (and
 * the next release's) for a newer snapshot; Update or Upgrade moves the pin
 * and rebuilds every installed app on it; Go back returns to the pin before.
 *
 * The pin moves in the user flake registry ($NIX_CONFIG_HOME/registry.json,
 * on the /nix volume), which Nix reads before the image's system registry,
 * so `nixpkgs#…` follows it everywhere, the Terminal included. A move keeps
 * the profile generation that holds the old pin's apps, and deletes every
 * older one, so the machine keeps two pins and never three. Everything here
 * runs as a job, one at a time with installs and removals, and only from a
 * button: boot never downloads.
 */
@Injectable()
export class LinuxAppUpdatesService implements OnModuleInit {
  private readonly logger = new Logger(LinuxAppUpdatesService.name);
  /** A test swaps these. */
  fetch: Fetch = (input, init) => fetch(input, init);
  download: Download = downloadRaw;
  /** The last diffs worked out, by what they depend on. */
  private readonly diffs = new Map<string, VersionDiff>();

  constructor(private readonly apps: LinuxAppsService) {}

  async onModuleInit(): Promise<void> {
    await this.reconcile().catch((err: Error) => this.logger.warn(`Reading the moved pin failed: ${err.message}`));
  }

  private get paths(): LinuxAppsPaths | null {
    return this.apps.paths;
  }

  /**
   * An image whose pin is at least as new as the moved one wins: the move
   * and its Go back are forgotten, and `nixpkgs` means the image's pin
   * again. Its apps stay as they are until the next Update, as they always
   * did after a new image.
   */
  async reconcile(): Promise<void> {
    const p = this.paths;
    const pins = await this.apps.pins();
    if (!p || !pins) return;
    const moved = pins.state.current;
    if (moved && pins.fromImage && pins.image) {
      this.logger.log(
        `The image's pin ${pins.image.snapshot} is not older than the moved ${moved.snapshot}; Linux apps install from the image's pin again`,
      );
      await writePinState(pinStateFile(p), {
        ...pins.state,
        current: null,
        previous: null,
      });
      await run("nix", ["registry", "remove", "nixpkgs"], {
        env: childEnv(),
        timeout: 60_000,
      }).catch((err: Error) => this.logger.warn(`nix registry remove failed: ${err.message}`));
    }
    await this.apps.pruneIndexes();
  }

  /** Whether Go back can return to `prev`: its apps are on disk, and the image's pin isn't newer. */
  private async restorable(pins: PinsNow, prev: KeptPin): Promise<boolean> {
    const p = required(this.paths, "the Linux apps paths");
    const image = pins.image;
    if (image && prev.commit !== image.commit && compareSnapshots(prev.snapshot, image.snapshot) < 0) return false;
    return prev.generation === null || hasGeneration(p.profile, prev.generation);
  }

  async status(): Promise<UpdatesStatus> {
    const pins = await this.apps.pins();
    const current = pins?.effective;
    if (!pins || !current)
      return {
        available: false,
        current: null,
        previous: null,
        checkedAt: null,
        update: null,
        upgrade: null,
      };
    const newer = (pin: Pin | null) => (pin && compareSnapshots(pin.snapshot, current.snapshot) > 0 ? pin : null);
    const prev = pins.state.previous;
    const update = newer(pins.state.update);
    const upgrade = newer(pins.state.upgrade);
    return {
      available: true,
      current: { ...view(current), fromImage: pins.fromImage },
      previous: prev && (await this.restorable(pins, prev)) ? view(prev) : null,
      checkedAt: pins.state.checkedAt,
      update: update && (await this.offer(current, update)),
      upgrade: upgrade && (await this.offer(current, upgrade)),
    };
  }

  /** The installed apps' versions on `from` and on `to`; null when `to`'s list is gone. */
  private async offer(from: Pin, to: Pin): Promise<Offer | null> {
    const installed = (await this.apps.installed()).filter((a) => a.nixpkgs);
    const key = [from.commit, to.commit, ...installed.map((a) => `${a.name}=${a.attr}@${a.version}`)].join("|");
    let diff = this.diffs.get(key);
    if (!diff) {
      const attrs = new Set(installed.map((a) => a.attr));
      try {
        diff = diffVersions(
          installed,
          rowsByAttr(await this.apps.rowsFor(from.commit), attrs),
          rowsByAttr(await this.apps.rowsFor(to.commit), attrs),
        );
      } catch (err) {
        this.logger.warn(`Comparing ${from.snapshot} with ${to.snapshot} failed: ${(err as Error).message}`);
        return null;
      }
      // An update and an upgrade can be on offer at once: room for both.
      if (this.diffs.size >= 4) this.diffs.clear();
      this.diffs.set(key, diff);
    }
    return { ...view(to), ...diff };
  }

  /** Check for updates: the newest snapshot of this release, and any newer release. */
  check(): Job {
    this.apps.requireNoJob();
    const p = this.paths;
    if (!p) throw new ConflictException("Linux apps are not available here");
    return this.apps.runJob("check", "", async (steps) => {
      const pins = await this.apps.pins();
      const current = pins?.effective;
      if (!current) throw new Error("This image's pin file names no snapshot, so there is nothing to compare with");
      steps.phase(`Asking channels.nixos.org about ${current.release}`);
      const head = await newestSnapshot(current.release, this.fetch);
      const update = head && compareSnapshots(head.snapshot, current.snapshot) > 0 ? head : null;
      steps.log(
        !head
          ? `There is no channel for ${current.release}.\n`
          : update
            ? `${head.snapshot} is newer than ${current.snapshot}.\n`
            : `${current.snapshot} is the newest.\n`,
      );
      let upgrade: Pin | null = null;
      let release = nextRelease(current.release);
      for (let i = 0; release && i < RELEASES_AHEAD; i++) {
        steps.phase(`Looking for ${release}`);
        const found = await newestSnapshot(release, this.fetch);
        if (!found) {
          steps.log(`${release} isn't out yet.\n`);
          break;
        }
        steps.log(`${found.snapshot} is out.\n`);
        upgrade = found;
        release = nextRelease(release);
      }
      for (const pin of [update, upgrade]) if (pin) await this.fetchList(steps, pin);
      const state = required(await this.apps.pins(), "the pins").state;
      await writePinState(pinStateFile(p), {
        ...state,
        checkedAt: Date.now(),
        update,
        upgrade,
      });
      await this.apps.pruneIndexes();
    });
  }

  /** A pin's package list, unless the machine has it already. */
  private async fetchList(steps: JobSteps, pin: Pin): Promise<void> {
    const dir = pinIndexDir(required(this.paths, "the Linux apps paths"), pin.commit);
    if (!existsSync(join(dir, "packages.json.br"))) {
      steps.phase(`Getting ${pin.snapshot}'s package list`);
      await downloadSnapshotIndex(pin, dir, this.download);
    }
    await this.apps.rowsFor(pin.commit);
  }

  /** The pin being left, with the generations that hold its apps. */
  private async keep(pin: Pin): Promise<KeptPin> {
    const p = required(this.paths, "the Linux apps paths");
    return {
      ...view(pin),
      generation: (await currentGeneration(p.profile))?.current ?? null,
      xwaylandGeneration: (await currentGeneration(p.xwaylandProfile))?.current ?? null,
    };
  }

  /** `nixpkgs` → `pin`: the image's own pin needs no entry of its own. */
  private pointAt(steps: JobSteps, pin: Pin, image: Pin | null): Promise<void> {
    return pin.commit === image?.commit
      ? steps.run("nix", ["registry", "remove", "nixpkgs"])
      : steps.run("nix", ["registry", "add", "nixpkgs", flakeRef(pin.commit)]);
  }

  /** After a failed move: the registry and the profiles as they were. */
  private async undo(steps: JobSteps, leaving: KeptPin, image: Pin | null): Promise<void> {
    const p = required(this.paths, "the Linux apps paths");
    steps.phase("Putting things back as they were");
    try {
      await this.pointAt(steps, leaving, image);
      for (const [profile, gen] of [
        [p.profile, leaving.generation],
        [p.xwaylandProfile, leaving.xwaylandGeneration],
      ] as const) {
        const now = await currentGeneration(profile);
        if (gen !== null && now && now.current !== gen)
          await steps.run("nix", ["profile", "rollback", "--profile", profile, "--to", String(gen)]);
      }
    } catch (err) {
      steps.log(`Not everything went back: ${(err as Error).message}\n`);
    }
  }

  /**
   * Update (a newer snapshot of this release) or Upgrade (a newer release):
   * the pin moves and every installed app is rebuilt on it, Xwayland too.
   * The old pin's apps stay on disk for Go back; anything older goes.
   */
  async move(kind: "update" | "upgrade", commit: string, session: unknown): Promise<Job> {
    this.apps.requireSession(session);
    this.apps.requireNoJob();
    const p = this.paths;
    const pins = await this.apps.pins();
    const from = pins?.effective;
    const target = pins?.state[kind];
    if (
      !p ||
      !pins ||
      !from ||
      !target ||
      target.commit !== commit ||
      compareSnapshots(target.snapshot, from.snapshot) <= 0
    )
      throw new ConflictException("That update is no longer on offer. Check for updates again.");
    return this.apps.runJob(kind, target.snapshot, async (steps) => {
      await this.fetchList(steps, target);
      const installed = (await this.apps.installed()).filter((a) => a.nixpkgs);
      const rows = rowsByAttr(await this.apps.rowsFor(target.commit), new Set(installed.map((a) => a.attr)));
      const moving = installed.filter((a) => rows.has(a.attr));
      for (const a of installed)
        if (!rows.has(a.attr)) steps.log(`${a.name} isn't in ${target.snapshot}'s list, so it stays as it is.\n`);
      const leaving = await this.keep(from);
      steps.phase(`Moving the pin to ${target.snapshot}`);
      await steps.run("nix", ["registry", "add", "nixpkgs", flakeRef(target.commit)]);
      try {
        if (moving.length) {
          steps.phase(
            `Rebuilding ${moving.length === 1 ? "your app" : `your ${moving.length} apps`} on ${target.snapshot}`,
          );
          const args = ["profile", "upgrade"];
          // Unfree packages need the environment's permission, read only when impure.
          if (moving.some((a) => required(rows.get(a.attr), a.attr)[4] === 1)) args.push("--impure");
          await steps.run("nix", [...args, ...moving.map((a) => a.name)]);
        }
        if (existsSync(xwaylandBinary(p))) {
          steps.phase("Rebuilding Xwayland");
          await steps.run("nix", ["profile", "upgrade", "--profile", p.xwaylandProfile, "--all"]);
        }
      } catch (err) {
        await this.undo(steps, leaving, pins.image);
        throw err;
      }
      // Recorded before the clean-up, so a failed clean-up leaves the move standing.
      const state = required(await this.apps.pins(), "the pins").state;
      await writePinState(pinStateFile(p), {
        ...state,
        current: view(target),
        previous: leaving,
        update: null,
        upgrade: kind === "upgrade" ? null : state.upgrade,
      });
      this.apps.invalidateIndex();
      steps.phase("Deleting older releases");
      try {
        const gone = [
          ...(await deleteGenerationsExcept(p.profile, leaving.generation === null ? [] : [leaving.generation])),
          ...(await deleteGenerationsExcept(
            p.xwaylandProfile,
            leaving.xwaylandGeneration === null ? [] : [leaving.xwaylandGeneration],
          )),
        ];
        if (gone.length) steps.log(`Deleted ${gone.length} older generation${gone.length === 1 ? "" : "s"}.\n`);
        await steps.run("nix", ["store", "gc"]);
      } catch (err) {
        steps.log(`The clean-up stopped (${(err as Error).message}); Free space finishes it.\n`);
      }
      await this.apps.pruneIndexes();
    });
  }

  /** Go back: the previous pin and the apps it had, the current pin kept in its place. */
  async goBack(session: unknown): Promise<Job> {
    this.apps.requireSession(session);
    this.apps.requireNoJob();
    const p = this.paths;
    const pins = await this.apps.pins();
    const from = pins?.effective;
    const prev = pins?.state.previous;
    if (!p || !pins || !from || !prev || !(await this.restorable(pins, prev)))
      throw new ConflictException("There is no earlier release to go back to.");
    return this.apps.runJob("go-back", prev.snapshot, async (steps) => {
      const leaving = await this.keep(from);
      steps.phase(`Moving the pin back to ${prev.snapshot}`);
      await this.pointAt(steps, prev, pins.image);
      try {
        if (prev.generation !== null && prev.generation !== leaving.generation) {
          steps.phase("Bringing back its apps");
          await steps.run("nix", ["profile", "rollback", "--to", String(prev.generation)]);
        }
        const xw = prev.xwaylandGeneration;
        if (xw !== null && xw !== leaving.xwaylandGeneration && (await hasGeneration(p.xwaylandProfile, xw)))
          await steps.run("nix", ["profile", "rollback", "--profile", p.xwaylandProfile, "--to", String(xw)]);
        else await this.apps.xwaylandSteps(steps);
      } catch (err) {
        await this.undo(steps, leaving, pins.image);
        throw err;
      }
      const state = required(await this.apps.pins(), "the pins").state;
      await writePinState(pinStateFile(p), {
        ...state,
        current: prev.commit === pins.image?.commit ? null : view(prev),
        previous: leaving,
      });
      this.apps.invalidateIndex();
      await this.apps.pruneIndexes();
    });
  }
}
