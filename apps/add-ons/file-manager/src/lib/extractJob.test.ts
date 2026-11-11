import { describe, expect, it, vi } from "vitest";
import type { SystemHttp } from "@imbatranim/ui";
import type { ArchiveJob } from "../types";
import { runExtractJob } from "./extractJob";

function fakeHttp(jobs: Partial<ArchiveJob>[]) {
  const post = vi.fn(async () => ({ data: { id: "j1" } }));
  const get = vi.fn(async () => ({ data: jobs.shift() }));
  return { http: { post, get } as unknown as SystemHttp, post, get };
}

const noWait = async () => {};

describe("runExtractJob", () => {
  it("sends the request and reports progress until the job is done", async () => {
    const { http, post } = fakeHttp([
      { state: "running", percent: 20 },
      { state: "running", percent: 70 },
      { state: "done", percent: 100, result: { dest: "out", entries: 2, totalBytes: 9 } },
    ]);
    const seen: number[] = [];
    const result = await runExtractJob(
      http,
      { root: "home", path: "a.zip", dest: "out", entries: ["x"] },
      (p) => seen.push(p),
      noWait,
    );
    expect(result).toEqual({ dest: "out", entries: 2, totalBytes: 9 });
    expect(seen).toEqual([20, 70, 100]);
    expect(post).toHaveBeenCalledWith("/archive/extract-job", {
      root: "home",
      path: "a.zip",
      dest: "out",
      entries: ["x"],
    });
  });

  it("rejects with the backend's message when the job fails", async () => {
    const { http } = fakeHttp([{ state: "failed", percent: 40, error: "Unsafe entry ../x" }]);
    await expect(runExtractJob(http, { root: "home", path: "a.zip" }, () => {}, noWait)).rejects.toThrow(
      "Unsafe entry ../x",
    );
  });
});
