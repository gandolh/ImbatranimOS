import { readFileSync } from "fs";
import { join } from "path";
import {
  Decoder,
  encodeJson,
  frameToplevel,
  isValidSessionId,
  KIND_JSON,
  MAX_MESSAGE,
  ProtocolError,
} from "./wayland.protocol";

/** Written by the Rust encoder's tests (apps/wayland-host). */
const fixture = (name: string) => readFileSync(join(__dirname, "../../../../wayland-host/protocol-fixtures", name));

describe("the Wayland host control protocol", () => {
  it("decodes the host's frame fixture", () => {
    const [d] = new Decoder().push(fixture("frame.bin"));
    expect(d.kind).toBe("frame");
    if (d.kind !== "frame") return;
    expect(d.session).toBe("abcdefghijklmnop");
    expect(frameToplevel(d.body)).toBe(7);
    expect(d.body.readUInt32LE(4)).toBe(640);
    expect(d.body.readUInt32LE(8)).toBe(480);
    expect(d.body.readUInt16LE(12)).toBe(1);
    // x, y, w, h, then the encoding byte and the length
    expect([0, 1, 2, 3].map((i) => d.body.readUInt32LE(14 + i * 4))).toEqual([1, 2, 3, 4]);
    expect(d.body[30]).toBe(1);
    expect(d.body.readUInt32LE(31)).toBe(4);
    expect([...d.body.subarray(35)]).toEqual([0xde, 0xad, 0xbe, 0xef]);
  });

  it("decodes the host's sound fixture", () => {
    const [d] = new Decoder().push(fixture("audio.bin"));
    expect(d.kind).toBe("audio");
    if (d.kind !== "audio") return;
    expect(d.session).toBe("abcdefghijklmnop");
    // The sequence number, then the Opus packet.
    expect(d.body.readUInt32LE(0)).toBe(513);
    expect([...d.body.subarray(4)]).toEqual([0xfc, 0xff, 0xfe]);
  });

  it("decodes the host's JSON fixture, one byte at a time", () => {
    const bytes = fixture("toplevel-created.bin");
    const decoder = new Decoder();
    const out = [];
    for (const b of bytes) out.push(...decoder.push(Buffer.from([b])));
    expect(out).toEqual([
      {
        kind: "json",
        message: {
          type: "toplevel_created",
          session: "abcdefghijklmnop",
          toplevel: 7,
          title: "foot",
          app_id: "foot",
          width: 640,
          height: 480,
          scale: 1,
          geometry: { x: 0, y: 0, width: 640, height: 480 },
          decorations: "server",
          min_width: 0,
          min_height: 0,
          max_width: 0,
          max_height: 0,
        },
      },
    ]);
  });

  it("decodes the host's popup fixture", () => {
    const [d] = new Decoder().push(fixture("popup-created.bin"));
    expect(d).toEqual({
      kind: "json",
      message: {
        type: "popup_created",
        session: "abcdefghijklmnop",
        popup: 9,
        parent: 7,
        x: 12,
        y: -4,
        width: 200,
        height: 120,
        scale: 2,
        geometry: { x: 8, y: 8, width: 184, height: 104 },
        grab: true,
      },
    });
  });

  it("decodes the host's clipboard fixture", () => {
    const [d] = new Decoder().push(fixture("clipboard.bin"));
    expect(d).toEqual({
      kind: "json",
      message: {
        type: "clipboard",
        session: "abcdefghijklmnop",
        text: 'copied ș\n"x"',
      },
    });
  });

  it("decodes the host's cursor image fixture", () => {
    const [d] = new Decoder().push(fixture("cursor-image.bin"));
    expect(d).toEqual({
      kind: "json",
      message: {
        type: "cursor",
        session: "abcdefghijklmnop",
        name: "default",
        image: {
          png: "iVBORw0KGgo=",
          width: 48,
          height: 48,
          scale: 2,
          hotspot_x: 4,
          hotspot_y: 20,
        },
      },
    });
  });

  it("decodes the host's text input fixture", () => {
    const [d] = new Decoder().push(fixture("text-input.bin"));
    expect(d).toEqual({
      kind: "json",
      message: {
        type: "text_input",
        session: "abcdefghijklmnop",
        toplevel: 7,
        enabled: true,
        purpose: "email",
        hints: ["completion", "spellcheck"],
        text: "ana@ex ș",
        cursor: 6,
        anchor: 4,
        rect: { x: 40, y: -2, width: 1, height: 18 },
        cause: "other",
      },
    });
  });

  it("frames JSON for the host with a length and a kind byte", () => {
    const bytes = encodeJson({
      type: "session_close",
      session: "abcdefghijklmnop",
    });
    expect(bytes.readUInt32LE(0)).toBe(bytes.length - 4);
    expect(bytes[4]).toBe(KIND_JSON);
    expect(JSON.parse(bytes.subarray(5).toString("utf8"))).toEqual({
      type: "session_close",
      session: "abcdefghijklmnop",
    });
  });

  it("refuses oversized, empty and unknown messages", () => {
    const big = Buffer.alloc(4);
    big.writeUInt32LE(MAX_MESSAGE + 1, 0);
    expect(() => new Decoder().push(big)).toThrow(ProtocolError);
    expect(() => new Decoder().push(Buffer.from([0, 0, 0, 0]))).toThrow(ProtocolError);
    expect(() => new Decoder().push(Buffer.from([2, 0, 0, 0, 9, 0]))).toThrow(ProtocolError);
  });

  it("accepts only file-name-safe session ids", () => {
    expect(isValidSessionId("abcdefghijklmnop")).toBe(true);
    expect(isValidSessionId("Ab-_0123456789abcdef")).toBe(true);
    expect(isValidSessionId("short")).toBe(false);
    expect(isValidSessionId("abcdefghijklmnop/..")).toBe(false);
    expect(isValidSessionId("a".repeat(65))).toBe(false);
    expect(isValidSessionId(null)).toBe(false);
  });
});
