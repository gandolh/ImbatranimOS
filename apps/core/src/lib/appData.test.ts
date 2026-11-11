import { describe, expect, it, vi } from "vitest";
import { FileConflictError, type SystemHttp } from "@imbatranim/ui";
import { createSystemData } from "./appData";

const httpError = (status: number, data: unknown = {}) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data },
  });

function fakeHttp(over: Partial<Record<keyof SystemHttp, ReturnType<typeof vi.fn>>> = {}) {
  const ok = (data: unknown) => vi.fn().mockResolvedValue({ data, status: 200, headers: {} });
  const http = {
    get: ok({ path: "a.json", content: "{}", version: "v1" }),
    put: ok({ path: "a.json", version: "v2" }),
    delete: ok(undefined),
    post: ok(undefined),
    patch: ok(undefined),
    ...over,
  };
  return http as typeof http & SystemHttp;
}

describe("system.data over an app’s client", () => {
  it("reads from the kind’s route, the data folder by default", async () => {
    const http = fakeHttp();
    const data = createSystemData(http);
    expect(await data.read("a.json")).toEqual({ content: "{}", version: "v1" });
    expect(http.get).toHaveBeenCalledWith("/system/data/data/file", { params: { path: "a.json" } });
    await data.read("b.json", { kind: "config" });
    expect(http.get).toHaveBeenLastCalledWith("/system/data/config/file", {
      params: { path: "b.json" },
    });
  });

  it("reads a missing file as null, and passes any other failure on", async () => {
    const missing = createSystemData(fakeHttp({ get: vi.fn().mockRejectedValue(httpError(404)) }));
    expect(await missing.read("a.json")).toBeNull();
    const refused = createSystemData(fakeHttp({ get: vi.fn().mockRejectedValue(httpError(403)) }));
    await expect(refused.read("a.json")).rejects.toThrow("403");
  });

  it("sends the version it read, null for none, and nothing for a blind write", async () => {
    const http = fakeHttp();
    const data = createSystemData(http);
    expect(await data.write("a.json", "x", { expected: "v1" })).toEqual({ version: "v2" });
    await data.write("a.json", "x", { expected: null, kind: "state" });
    await data.write("a.json", "x");
    expect(http.put.mock.calls).toEqual([
      ["/system/data/data/file", { path: "a.json", content: "x", expected: "v1" }],
      ["/system/data/state/file", { path: "a.json", content: "x", expected: null }],
      ["/system/data/data/file", { path: "a.json", content: "x" }],
    ]);
  });

  it("turns a 409 into FileConflictError carrying the current version", async () => {
    const data = createSystemData(fakeHttp({ put: vi.fn().mockRejectedValue(httpError(409, { current: "v9" })) }));
    const err = await data.write("a.json", "x", { expected: "v1" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FileConflictError);
    expect((err as FileConflictError).current).toBe("v9");
  });

  it("lists and removes on the kind’s routes", async () => {
    const http = fakeHttp({
      get: vi.fn().mockResolvedValue({ data: [], status: 200, headers: {} }),
    });
    const data = createSystemData(http);
    expect(await data.list()).toEqual([]);
    expect(http.get).toHaveBeenCalledWith("/system/data/data/list", { params: { path: "" } });
    await data.remove("old", { kind: "cache" });
    expect(http.delete).toHaveBeenCalledWith("/system/data/cache/file", { params: { path: "old" } });
  });

  it("removes only the version it read, a 409 as FileConflictError", async () => {
    const http = fakeHttp({ delete: vi.fn().mockRejectedValue(httpError(409, { current: "v3" })) });
    const data = createSystemData(http);
    const err = await data.remove("a.json", { expected: "v1" }).catch((e: unknown) => e);
    expect(http.delete).toHaveBeenCalledWith("/system/data/data/file", {
      params: { path: "a.json", expected: "v1" },
    });
    expect(err).toBeInstanceOf(FileConflictError);
    expect((err as FileConflictError).current).toBe("v3");
  });
});
