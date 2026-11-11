import { describe, expect, it, vi } from "vitest";
import type { SystemHttp } from "@imbatranim/ui";
import type { RecentFile } from "../../lib/recentFiles";

const rows: RecentFile[] = [
  { id: 1, root: "home", path: "code/repo", appId: "git-gui", kind: "folder", lastOpened: "" },
  { id: 2, root: "home", path: "notes/a.txt", appId: "notepad", kind: "file", lastOpened: "" },
];

vi.mock("../../lib/recentFiles", () => ({
  fetchRecentFiles: () => Promise.resolve(rows),
}));

const { recentFilesSource } = await import("./recentFilesSource");

describe("recentFilesSource", () => {
  it("leaves out what no app here would open: a repository with Git GUI not installed", async () => {
    const items = await recentFilesSource.search("", { http: {} as SystemHttp });
    expect(items.map((i) => i.id)).toEqual(["recent:home:notepad:notes/a.txt"]);
  });
});
