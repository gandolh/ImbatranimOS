// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { setLinuxSender } from "./linuxWindowsStore";
import { attachPointer, wheelMessage } from "./pointerInput";

const wheel = (init: WheelEventInit & { wheelDeltaX?: number; wheelDeltaY?: number }) =>
  Object.assign(new WheelEvent("wheel", init), {
    wheelDeltaX: init.wheelDeltaX ?? 0,
    wheelDeltaY: init.wheelDeltaY ?? 0,
  });

describe("what a wheel event becomes for a Linux app", () => {
  it("reads a mouse wheel as whole notches", () => {
    expect(wheelMessage(wheel({ deltaY: 100, wheelDeltaY: -120 }))).toEqual({
      dx: 0,
      dy: 15,
      v120x: 0,
      v120y: 120,
      wheel: true,
    });
  });

  it("reads lines as a third of a notch each", () => {
    const m = wheelMessage(wheel({ deltaY: 3, deltaMode: WheelEvent.DOM_DELTA_LINE }));
    expect(m).toMatchObject({ dy: 15, v120y: 120, wheel: true });
  });

  it("passes a touchpad through as smooth pixels", () => {
    expect(wheelMessage(wheel({ deltaX: 4, deltaY: -7, wheelDeltaY: 9 }))).toEqual({
      dx: 4,
      dy: -7,
      v120x: 0,
      v120y: 0,
      wheel: false,
    });
  });
});

describe("where the pointer lands in a Linux window", () => {
  afterEach(() => setLinuxSender(null));

  it("is the CSS offset from the canvas's corner, whatever the canvas's pixels", () => {
    const sent: object[] = [];
    setLinuxSender((m) => sent.push(m));
    const el = document.createElement("div");
    // A scale-2 window: 1280×960 pixels laid out at 640×480 CSS pixels.
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 960;
    canvas.getBoundingClientRect = () => ({ left: 100, top: 50, width: 640, height: 480 }) as DOMRect;
    const detach = attachPointer(el, 7, () => canvas);
    el.dispatchEvent(new MouseEvent("pointermove", { clientX: 420, clientY: 290 }));
    detach();
    expect(sent).toEqual([{ type: "pointer_motion", toplevel: 7, x: 320, y: 240 }]);
  });
});
