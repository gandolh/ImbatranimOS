// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { FileConflictError, queryClient, SystemProvider, type SystemHandle } from "@imbatranim/ui";
import { NoteEditor } from "./NoteEditor";

/**
 * A save over a file that changed on disk since it was opened asks
 * Overwrite / Reload from disk / Cancel instead of destroying the change.
 * `react-dom/client` plus `act`, as in apps/core; no testing library.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no Web Animations or ResizeObserver; the kit's ScrollArea and the split
// divider's size hook ask for them.
Element.prototype.getAnimations ??= () => [];
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

type Disk = { content: string; version: string };

let container: HTMLDivElement;
let root: Root;
let disk: Disk;
let put: ReturnType<typeof vi.fn>;

const conflict = (current: string) =>
  Object.assign(new Error("Request failed with status code 409"), {
    response: { status: 409, data: { statusCode: 409, current } },
  });

/** A folder's listing, as `GET /files` answers it; throw to answer with a status. */
let listing: (path: string) => Promise<{ name: string; type: "file" | "directory" }[]>;
let upload: ReturnType<typeof vi.fn>;
let pickSave: ReturnType<typeof vi.fn>;

const failed = (status: number) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data: { statusCode: status } },
  });

function makeSystem(): SystemHandle {
  return {
    http: {
      get: async (url: string, opts?: { params?: { path?: string } }) =>
        url === "/files"
          ? { data: await listing(opts?.params?.path ?? ""), status: 200, headers: {} }
          : { data: { path: "notes.txt", ...disk }, status: 200, headers: {} },
      put,
    },
    fs: {
      upload,
      pickSave,
      downloadUrl: (root: string, path: string) => `/download/${root}/${path}`,
    },
    notify: vi.fn(),
    window: {
      setTitle: vi.fn(),
      onCloseRequest: () => () => undefined,
      isFocused: () => true,
    },
  } as unknown as SystemHandle;
}

/** Let the scripted promises settle and React commit. */
const settle = () => act(async () => new Promise((r) => setTimeout(r, 0)));

async function mount(path = "notes.txt") {
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <SystemProvider system={makeSystem()}>
          <NoteEditor windowId="w1" doc={{ root: "home", path }} onBack={() => {}} />
        </SystemProvider>
      </QueryClientProvider>,
    );
  });
  await settle();
}

const textarea = () => container.querySelector("textarea")!;

function type(value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  act(() => {
    setter.call(textarea(), value);
    textarea().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Buttons anywhere in the document: the dialog renders in a portal. */
function button(text: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
  if (!found) throw new Error(`button "${text}" not found`);
  return found;
}

async function click(text: string) {
  await act(async () => {
    button(text).click();
  });
  await settle();
}

/** The conflict question is up (a closing dialog lingers for its exit animation). */
const dialogOpen = () =>
  [...document.querySelectorAll('[role="dialog"]:not([data-closed])')].some((d) =>
    d.textContent!.includes("changed on disk since you opened it"),
  );

/** Open v1, type, and let the Terminal append a line before Save. */
async function saveOverExternalChange() {
  await mount();
  type("mine");
  disk = { content: "theirs\nterminal", version: "v2" };
  put.mockRejectedValueOnce(conflict("v2"));
  await click("Save");
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  disk = { content: "theirs", version: "v1" };
  listing = async () => [];
  upload = vi.fn(async () => ({ version: "v-new" }));
  pickSave = vi.fn(async () => null);
  put = vi.fn(async (_url: string, body: { content: string }) => ({
    data: { path: "notes.txt", version: `saved-${body.content}` },
    status: 200,
    headers: {},
  }));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  queryClient.clear();
});

describe("a save over a file that changed on disk", () => {
  it("sends the version it read, and asks on a 409", async () => {
    await saveOverExternalChange();
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0][1]).toMatchObject({ content: "mine", expected: "v1" });
    expect(dialogOpen()).toBe(true);
  });

  it("Overwrite writes mine without a precondition", async () => {
    await saveOverExternalChange();
    await click("Overwrite");
    expect(put).toHaveBeenCalledTimes(2);
    expect(put.mock.calls[1][1]).toMatchObject({ content: "mine", expected: undefined });
    expect(dialogOpen()).toBe(false);
    expect(textarea().value).toBe("mine");
    expect(button("Save").disabled).toBe(true);
  });

  it("Reload from disk discards mine and shows the file as it is now", async () => {
    await saveOverExternalChange();
    await click("Reload from disk");
    expect(put).toHaveBeenCalledTimes(1);
    expect(textarea().value).toBe("theirs\nterminal");
    expect(button("Save").disabled).toBe(true);

    // The next save builds on the version just reloaded.
    type("theirs\nterminal\nmine");
    await click("Save");
    expect(put.mock.calls[1][1]).toMatchObject({ expected: "v2" });
  });

  it("Cancel writes nothing and keeps my text", async () => {
    await saveOverExternalChange();
    await click("Cancel");
    expect(put).toHaveBeenCalledTimes(1);
    expect(dialogOpen()).toBe(false);
    expect(textarea().value).toBe("mine");
    expect(button("Save").disabled).toBe(false);
  });

  it("a save after a save sends the version the first one wrote", async () => {
    await mount();
    type("one");
    await click("Save");
    type("two");
    await click("Save");
    expect(put.mock.calls[1][1]).toMatchObject({ content: "two", expected: "saved-one" });
  });
});

describe("the view a file opens in", () => {
  const pressed = (label: string) => container.querySelector(`[aria-label="${label}"]`)?.getAttribute("aria-pressed");

  it("is split for a Markdown file, with the preview beside the editor", async () => {
    disk = { content: "# Title\n\ntext", version: "v1" };
    await mount("README.md");
    expect(pressed("Split view")).toBe("true");
    expect(textarea()).not.toBeNull();
    expect(container.querySelector(".md-preview h1")?.textContent).toBe("Title");
    expect(container.querySelector('[aria-label="Sync scrolling"]')).not.toBeNull();
  });

  it("is the editor alone for a text file, which has no split view", async () => {
    await mount("notes.txt");
    expect(pressed("Edit")).toBe("true");
    expect(container.querySelector('[aria-label="Split view"]')).toBeNull();
    expect(container.querySelector(".md-preview")).toBeNull();
    expect(container.querySelector('[aria-label="Outline"]')).toBeNull();
  });

  it("still previews a text file as Markdown on request", async () => {
    disk = { content: "# Heading", version: "v1" };
    await mount("notes.txt");
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Preview as Markdown"]')!.click();
    });
    expect(container.querySelector(".md-preview h1")?.textContent).toBe("Heading");
  });

  it("lists the headings in the outline rail", async () => {
    disk = { content: "# One\n\n## Two", version: "v1" };
    await mount("README.md");
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Outline"]')!.click();
    });
    const rail = [...container.querySelectorAll("button")].filter((b) =>
      ["One", "Two"].includes(b.textContent?.trim() ?? ""),
    );
    expect(rail).toHaveLength(2);
  });
});

describe("attaching an image to a note", () => {
  /** Paste an image into the editor, as the clipboard hands one over. */
  async function pasteImage(name = "image.png") {
    // jsdom's File has no arrayBuffer(); the editor needs only these three.
    const bytes = new Uint8Array([137, 80, 78, 71]).buffer;
    const file = { name, type: "image/png", arrayBuffer: async () => bytes };
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { items: [{ type: "image/png", getAsFile: () => file }] },
    });
    await act(async () => {
      textarea().dispatchEvent(event);
    });
    await settle();
  }

  it("writes it into assets/ under a free name and links it, with no dialog", async () => {
    listing = async (path) => {
      if (path === "docs/assets") return [{ name: "image.png", type: "file" }];
      throw failed(404);
    };
    await mount("docs/note.md");
    await pasteImage();
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0].slice(0, 2)).toEqual(["home", "docs/assets/image-2.png"]);
    expect(pickSave).not.toHaveBeenCalled();
    expect(textarea().value).toContain("![image](assets/image-2.png)");
  });

  it("makes assets/ with the first image, and takes the next name when one is taken meanwhile", async () => {
    listing = async () => {
      throw failed(404);
    };
    upload.mockRejectedValueOnce(new FileConflictError("v1"));
    await mount("docs/note.md");
    await pasteImage();
    expect(upload.mock.calls.map((call) => call[1])).toEqual(["docs/assets/image.png", "docs/assets/image-2.png"]);
    expect(textarea().value).toContain("![image](assets/image-2.png)");
  });

  it("asks in the Save dialog when the window may not add to assets/", async () => {
    listing = async (path) => {
      if (path === "docs/assets") throw failed(403);
      return [{ name: "note.md", type: "file" }];
    };
    pickSave.mockResolvedValueOnce({ root: "home", path: "docs/image.png" });
    await mount("docs/note.md");
    await pasteImage();
    expect(pickSave).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestedName: "image.png",
        startIn: { root: "home", path: "docs" },
      }),
    );
    expect(upload.mock.calls.map((call) => call[1])).toEqual(["docs/image.png"]);
    expect(textarea().value).toContain("![image](image.png)");
  });

  it("falls back to the dialog when the write itself is refused", async () => {
    listing = async () => [];
    upload.mockRejectedValueOnce(failed(403));
    await mount("docs/note.md");
    await pasteImage();
    expect(pickSave).toHaveBeenCalledTimes(1);
    // Cancelled: nothing more is written, nothing linked.
    expect(upload).toHaveBeenCalledTimes(1);
    expect(textarea().value).not.toContain("![image]");
  });
});
