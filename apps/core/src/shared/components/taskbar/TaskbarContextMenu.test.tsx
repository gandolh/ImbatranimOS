// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TaskbarContextMenu } from "./TaskbarContextMenu";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

describe("TaskbarContextMenu workspace buttons", () => {
  it("are 24 px on a desktop and a 44 by 44 px target on a phone", () => {
    act(() =>
      root.render(
        <TaskbarContextMenu
          x={10}
          y={10}
          windowTitle="Notes"
          currentWorkspace={1}
          isMaximized={false}
          onMoveToWorkspace={() => {}}
          onToggleMaximize={() => {}}
          onMinimize={() => {}}
          onClose={() => {}}
          onDismiss={() => {}}
        />,
      ),
    );
    const buttons = document.querySelectorAll<HTMLElement>('[aria-label^="Move to workspace"]');
    expect(buttons).toHaveLength(4);
    for (const b of buttons) {
      expect(b.className).toContain("h-[24px]");
      expect(b.className).toContain("phone:h-target");
      expect(b.className).toContain("phone:min-w-target");
    }
  });
});
