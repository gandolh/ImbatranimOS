import {
  FileConflictError,
  type DataEntry,
  type DataFile,
  type DataKind,
  type SystemData,
  type SystemHttp,
} from "@imbatranim/ui";

/** The status of an axios-style error, if it carries one. */
function statusOf(err: unknown): number | undefined {
  const status = (err as { response?: { status?: unknown } } | null)?.response?.status;
  return typeof status === "number" ? status : undefined;
}

/** The 409 body's `current` version (null when the file is gone). */
function conflictCurrent(err: unknown): string | null {
  const current = (err as { response?: { data?: { current?: unknown } } }).response?.data?.current;
  return typeof current === "string" ? current : null;
}

function route(kind: DataKind | undefined, what: "file" | "list"): string {
  return `/system/data/${encodeURIComponent(kind ?? "data")}/${what}`;
}

/**
 * `system.data` over a copy's own client: `http` is the app's
 * `AppInstance.http`, so every call carries its token and the backend names
 * the folder from it. An app that acts as the user (Settings, Files, the
 * Terminal) has no token, and the backend refuses it: the user has no data
 * folder.
 */
export function createSystemData(http: SystemHttp): SystemData {
  return {
    async read(path, opts) {
      try {
        const res = await http.get<DataFile>(route(opts?.kind, "file"), { params: { path } });
        return { content: res.data.content, version: res.data.version };
      } catch (err) {
        if (statusOf(err) === 404) return null;
        throw err;
      }
    },

    async write(path, content, opts) {
      try {
        const res = await http.put<{ version: string }>(route(opts?.kind, "file"), {
          path,
          content,
          // Left out when absent, so the write goes over whatever is there.
          ...(opts?.expected !== undefined ? { expected: opts.expected } : {}),
        });
        return { version: res.data.version };
      } catch (err) {
        if (statusOf(err) === 409) {
          throw new FileConflictError(conflictCurrent(err), "It changed since it was read, in another window or tab.");
        }
        throw err;
      }
    },

    async list(path = "", opts) {
      const res = await http.get<DataEntry[]>(route(opts?.kind, "list"), { params: { path } });
      return res.data;
    },

    async remove(path, opts) {
      try {
        await http.delete(route(opts?.kind, "file"), {
          params: { path, ...(opts?.expected !== undefined ? { expected: opts.expected } : {}) },
        });
      } catch (err) {
        if (statusOf(err) === 409) {
          throw new FileConflictError(conflictCurrent(err), "It changed since it was read, in another window or tab.");
        }
        throw err;
      }
    },
  };
}
