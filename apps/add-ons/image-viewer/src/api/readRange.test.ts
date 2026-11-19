import type { SystemHttp } from "@imbatranim/ui";
import { describe, expect, it } from "vitest";
import { MAX_RANGE_BYTES, readRange } from "./readRange";

function fakeHttp(status: number, file: Uint8Array) {
  const seen: Array<{ url: string; headers?: Record<string, string> }> = [];
  const http = {
    get: async (url: string, config?: { headers?: Record<string, string> }) => {
      seen.push({ url, headers: config?.headers });
      const m = /bytes=(\d+)-(\d+)/.exec(config?.headers?.Range ?? "");
      const body = status === 206 && m ? file.slice(Number(m[1]), Number(m[2]) + 1) : file;
      return { data: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength), status, headers: {} };
    },
  } as unknown as SystemHttp;
  return { http, seen };
}
const file = Uint8Array.from({ length: 200_000 }, (_, i) => i % 251);

describe("readRange", () => {
  it("sends a Range header and returns the 206 body", async () => {
    const { http, seen } = fakeHttp(206, file);
    const got = await readRange(http, "home", "a/b.jpg", 100, 50);
    expect(seen[0]).toMatchObject({ url: "/files/download", headers: { Range: "bytes=100-149" } });
    expect(Array.from(got)).toEqual(Array.from(file.subarray(100, 150)));
  });
  it("cuts the window out of a 200 whole-file answer", async () => {
    const { http } = fakeHttp(200, file);
    const got = await readRange(http, "home", "a.jpg", 10, 20);
    expect(Array.from(got)).toEqual(Array.from(file.subarray(10, 30)));
  });
  it("never asks for more than 64 KB", async () => {
    const { http, seen } = fakeHttp(206, file);
    const got = await readRange(http, "home", "a.jpg", 0, 1_000_000);
    expect(got.length).toBe(MAX_RANGE_BYTES);
    expect(seen[0]!.headers!.Range).toBe(`bytes=0-${MAX_RANGE_BYTES - 1}`);
  });
  it("makes no request for an empty window", async () => {
    const { http, seen } = fakeHttp(206, file);
    expect((await readRange(http, "home", "a.jpg", 0, 0)).length).toBe(0);
    expect(seen).toHaveLength(0);
  });
});
