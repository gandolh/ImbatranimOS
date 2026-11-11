import { BadRequestException } from "@nestjs/common";
import { join, resolve } from "path";
import * as os from "os";

import { SYSTEM_GROUP } from "../app-identity/app-identity.types";

/**
 * Where an app's data folders live, the XDG way: one folder per app under
 * `imbatranim/` in each of four places in the home, by what the files are.
 */

/** The four kinds an app keeps files of. */
export const DATA_KINDS = ["config", "data", "state", "cache"] as const;
export type DataKind = (typeof DATA_KINDS)[number];

/** The kind a call names when it names none. */
export const DEFAULT_DATA_KIND: DataKind = "data";

/** Each kind's place in the home, as XDG's base directories lay it out. */
export const KIND_DIRS: Readonly<Record<DataKind, string>> = Object.freeze({
  config: ".config",
  data: ".local/share",
  state: ".local/state",
  cache: ".cache",
});

/**
 * The level between a kind's place and the app's folder. It keeps an app id
 * from clashing with a Linux program's folder, as Windows' vendor folder does.
 */
export const VENDOR_DIR = "imbatranim";

/** The longest path an app may name inside its folder. */
export const MAX_DATA_PATH = 512;

/** The largest file `system.data` reads or writes: it travels as one JSON string. */
export const MAX_DATA_BYTES = 5 * 1024 * 1024;

/** An app id as the tokens carry it; the same rule the token route checks. */
const APP_ID = /^[a-z][a-z0-9-]{1,39}$/;

export function isDataKind(value: unknown): value is DataKind {
  return typeof value === "string" && (DATA_KINDS as readonly string[]).includes(value);
}

/** A kind from a route, or a 400. */
export function kindOf(raw: string | undefined): DataKind {
  if (raw === undefined || raw === "") return DEFAULT_DATA_KIND;
  if (!isDataKind(raw)) {
    throw new BadRequestException(`Unknown data kind: ${raw.slice(0, 40)}. It is one of ${DATA_KINDS.join(", ")}`);
  }
  return raw;
}

/**
 * The home the folders sit in: FILES_ROOT, else the process user's home, read
 * per call as the files module reads it, so a test can point it elsewhere.
 */
export function homeRoot(): string {
  return resolve(process.env.FILES_ROOT || os.homedir());
}

/**
 * An app's folder of one kind. The name comes from the caller's identity,
 * never from a path the app sends, so an id that could leave the vendor
 * folder (or the group every built-in shares) is refused outright.
 */
export function folderOf(appId: string, kind: DataKind, home = homeRoot()): string {
  if (!APP_ID.test(appId) || appId === SYSTEM_GROUP) {
    throw new Error(`Not an app id: ${appId}`);
  }
  return join(home, KIND_DIRS[kind], VENDOR_DIR, appId);
}

/**
 * A path inside an app's folder, as the app sends it, made relative and
 * plain: slashes at either end and `.` segments go, while `..`, a backslash
 * or a NUL is refused rather than resolved. `''` is the folder itself, which
 * only a listing may name.
 */
/** The longest name one path segment may have, in UTF-8 bytes. */
export const MAX_DATA_NAME_BYTES = 200;

export function normaliseDataPath(raw: unknown, allowRoot = false): string {
  if (typeof raw !== "string" || raw.length > MAX_DATA_PATH) {
    throw new BadRequestException(`A data path is a string of at most ${MAX_DATA_PATH} characters`);
  }
  if (raw.includes("\0") || raw.includes("\\")) {
    throw new BadRequestException("A data path has no NUL or backslash");
  }
  const segments = raw.split("/").filter((s) => s !== "" && s !== ".");
  if (segments.includes("..")) {
    throw new BadRequestException("A data path can't leave the app's folder");
  }
  // A write stages `.<name>.imbatranim-<uuid>.part` beside the file, 54 bytes
  // longer than the name, and Linux allows 255 bytes per name: a longer name
  // would pass here and then fail as an error from the file system.
  if (segments.some((s) => Buffer.byteLength(s) > MAX_DATA_NAME_BYTES)) {
    throw new BadRequestException(`A name in a data path is at most ${MAX_DATA_NAME_BYTES} bytes`);
  }
  const path = segments.join("/");
  if (path === "" && !allowRoot) {
    throw new BadRequestException("Name a file inside the folder");
  }
  return path;
}

/** The staged copy a write renames into place; never listed. */
export const STAGED_NAME = /^\..+\.imbatranim-[0-9a-f-]{36}\.part$/;
