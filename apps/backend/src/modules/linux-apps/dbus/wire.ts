/**
 * The D-Bus wire format, as much of it as the session bus's one service here
 * needs: every type in the marshalling spec, the message header and the
 * framing. Values are plain JS: numbers (bigint for 64-bit integers),
 * booleans, strings, arrays, structs as arrays, dict entries as `[key,
 * value]` pairs and variants as {@link Variant}. Unix fds aren't passed.
 *
 * https://dbus.freedesktop.org/doc/dbus-specification.html#message-protocol
 */

export class Variant {
  constructor(
    readonly signature: string,
    readonly value: unknown,
  ) {}
}

export const MessageType = {
  MethodCall: 1,
  MethodReturn: 2,
  Error: 3,
  Signal: 4,
} as const;
export type MessageType = (typeof MessageType)[keyof typeof MessageType];

/** Flag: the caller wants no reply. */
export const NO_REPLY_EXPECTED = 0x1;

export type Message = {
  type: MessageType;
  flags: number;
  serial: number;
  path?: string;
  interface?: string;
  member?: string;
  errorName?: string;
  replySerial?: number;
  destination?: string;
  sender?: string;
  signature?: string;
  body: unknown[];
};

/** A message past this is refused, as the reference daemon refuses 128 MiB. */
export const MAX_MESSAGE = 128 * 1024 * 1024;

const FIELD = {
  path: 1,
  interface: 2,
  member: 3,
  errorName: 4,
  replySerial: 5,
  destination: 6,
  sender: 7,
  signature: 8,
} as const;
const FIELD_TYPE: Record<number, string> = {
  1: "o",
  2: "s",
  3: "s",
  4: "s",
  5: "u",
  6: "s",
  7: "s",
  8: "g",
  9: "u",
};

export class WireError extends Error {}

// ── Signatures ───────────────────────────────────────────────────────────────

/** Split a signature into its complete types: `"a{sv}is"` → `["a{sv}", "i", "s"]`. */
export function splitSignature(signature: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < signature.length) {
    const end = completeTypeEnd(signature, i);
    out.push(signature.slice(i, end));
    i = end;
  }
  return out;
}

function completeTypeEnd(sig: string, i: number): number {
  const c = sig[i];
  if (c === undefined) throw new WireError("signature ends early");
  if ("ybnqiuxtdhsogv".includes(c)) return i + 1;
  if (c === "a") return completeTypeEnd(sig, i + 1);
  if (c === "(" || c === "{") {
    const close = c === "(" ? ")" : "}";
    let j = i + 1;
    while (sig[j] !== close) {
      if (j >= sig.length) throw new WireError(`unclosed ${c} in ${sig}`);
      j = completeTypeEnd(sig, j);
    }
    return j + 1;
  }
  throw new WireError(`unknown type ${c} in ${sig}`);
}

function alignmentOf(type: string): number {
  switch (type[0]) {
    case "y":
    case "g":
    case "v":
      return 1;
    case "n":
    case "q":
      return 2;
    case "x":
    case "t":
    case "d":
    case "(":
    case "{":
      return 8;
    default:
      return 4;
  }
}

/** The member types of a struct `(…)` or dict entry `{…}`. */
const innerTypes = (type: string) => splitSignature(type.slice(1, -1));

// ── Writing ──────────────────────────────────────────────────────────────────

class Writer {
  private buf = Buffer.alloc(256);
  length = 0;

  private room(n: number): void {
    if (this.length + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.length + n) size *= 2;
    const next = Buffer.alloc(size);
    this.buf.copy(next, 0, 0, this.length);
    this.buf = next;
  }

  align(n: number): void {
    const pad = (n - (this.length % n)) % n;
    this.room(pad);
    this.buf.fill(0, this.length, this.length + pad);
    this.length += pad;
  }

  u8(v: number): void {
    this.room(1);
    this.buf.writeUInt8(v, this.length);
    this.length += 1;
  }

  setU32(at: number, v: number): void {
    this.buf.writeUInt32LE(v, at);
  }

  bytes(b: Buffer): void {
    this.room(b.length);
    b.copy(this.buf, this.length);
    this.length += b.length;
  }

  value(type: string, v: unknown): void {
    this.align(alignmentOf(type));
    const at = this.length;
    switch (type[0]) {
      case "y":
        return this.u8(num(v, type));
      case "b":
        this.room(4);
        this.buf.writeUInt32LE(v ? 1 : 0, at);
        this.length += 4;
        return;
      case "n":
        this.room(2);
        this.buf.writeInt16LE(num(v, type), at);
        this.length += 2;
        return;
      case "q":
        this.room(2);
        this.buf.writeUInt16LE(num(v, type), at);
        this.length += 2;
        return;
      case "i":
        this.room(4);
        this.buf.writeInt32LE(num(v, type), at);
        this.length += 4;
        return;
      case "u":
      case "h":
        this.room(4);
        this.buf.writeUInt32LE(num(v, type), at);
        this.length += 4;
        return;
      case "x":
        this.room(8);
        this.buf.writeBigInt64LE(BigInt(v as number | bigint), at);
        this.length += 8;
        return;
      case "t":
        this.room(8);
        this.buf.writeBigUInt64LE(BigInt(v as number | bigint), at);
        this.length += 8;
        return;
      case "d":
        this.room(8);
        this.buf.writeDoubleLE(num(v, type), at);
        this.length += 8;
        return;
      case "s":
      case "o": {
        const b = Buffer.from(str(v, type), "utf8");
        this.room(4);
        this.buf.writeUInt32LE(b.length, this.length);
        this.length += 4;
        this.bytes(b);
        return this.u8(0);
      }
      case "g": {
        const b = Buffer.from(str(v, type), "ascii");
        if (b.length > 255) throw new WireError("signature too long");
        this.u8(b.length);
        this.bytes(b);
        return this.u8(0);
      }
      case "v": {
        if (!(v instanceof Variant)) throw new WireError("a v needs a Variant");
        this.value("g", v.signature);
        const [inner, ...rest] = splitSignature(v.signature);
        if (!inner || rest.length) throw new WireError("a variant holds one type");
        return this.value(inner, v.value);
      }
      case "a": {
        const element = type.slice(1);
        const items = v instanceof Map ? [...v.entries()] : (v as unknown[] | undefined);
        if (!Array.isArray(items)) throw new WireError(`${type} needs an array`);
        this.room(4);
        const lengthAt = this.length;
        this.length += 4;
        this.align(alignmentOf(element));
        const start = this.length;
        for (const item of items) this.value(element, item);
        this.setU32(lengthAt, this.length - start);
        return;
      }
      case "(":
      case "{": {
        const members = innerTypes(type);
        const values = v as unknown[];
        if (!Array.isArray(values) || values.length !== members.length) {
          throw new WireError(`${type} needs ${members.length} values`);
        }
        members.forEach((m, i) => this.value(m, values[i]));
        return;
      }
    }
    throw new WireError(`cannot write ${type}`);
  }

  take(): Buffer {
    return Buffer.from(this.buf.subarray(0, this.length));
  }
}

function num(v: unknown, type: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new WireError(`${type} needs a number`);
  return v;
}

function str(v: unknown, type: string): string {
  if (typeof v !== "string") throw new WireError(`${type} needs a string`);
  return v;
}

/** Marshal values of a signature, starting 8-aligned (as a body does). */
export function marshal(signature: string, values: unknown[]): Buffer {
  const types = splitSignature(signature);
  if (types.length !== values.length) {
    throw new WireError(`signature ${signature} has ${types.length} types, got ${values.length} values`);
  }
  const w = new Writer();
  types.forEach((t, i) => w.value(t, values[i]));
  return w.take();
}

// ── Reading ──────────────────────────────────────────────────────────────────

class Reader {
  offset: number;

  constructor(
    private readonly buf: Buffer,
    private readonly little: boolean,
    start = 0,
    /** Where alignment counts from: the message's first byte. */
    private readonly base = 0,
  ) {
    this.offset = start;
  }

  private need(n: number): void {
    if (this.offset + n > this.buf.length) throw new WireError("message ends early");
  }

  align(n: number): void {
    const rel = this.offset - this.base;
    this.offset += (n - (rel % n)) % n;
  }

  u32(): number {
    this.need(4);
    const v = this.little ? this.buf.readUInt32LE(this.offset) : this.buf.readUInt32BE(this.offset);
    this.offset += 4;
    return v;
  }

  value(type: string, depth = 0): unknown {
    if (depth > 64) throw new WireError("nested too deeply");
    this.align(alignmentOf(type));
    const b = this.buf;
    const le = this.little;
    const at = this.offset;
    switch (type[0]) {
      case "y":
        this.need(1);
        this.offset += 1;
        return b.readUInt8(at);
      case "b":
        return this.u32() !== 0;
      case "n":
        this.need(2);
        this.offset += 2;
        return le ? b.readInt16LE(at) : b.readInt16BE(at);
      case "q":
        this.need(2);
        this.offset += 2;
        return le ? b.readUInt16LE(at) : b.readUInt16BE(at);
      case "i":
        this.need(4);
        this.offset += 4;
        return le ? b.readInt32LE(at) : b.readInt32BE(at);
      case "u":
      case "h":
        return this.u32();
      case "x":
        this.need(8);
        this.offset += 8;
        return le ? b.readBigInt64LE(at) : b.readBigInt64BE(at);
      case "t":
        this.need(8);
        this.offset += 8;
        return le ? b.readBigUInt64LE(at) : b.readBigUInt64BE(at);
      case "d":
        this.need(8);
        this.offset += 8;
        return le ? b.readDoubleLE(at) : b.readDoubleBE(at);
      case "s":
      case "o": {
        const len = this.u32();
        this.need(len + 1);
        const s = b.toString("utf8", this.offset, this.offset + len);
        this.offset += len + 1;
        return s;
      }
      case "g": {
        this.need(1);
        const len = b.readUInt8(this.offset);
        this.need(len + 2);
        const s = b.toString("ascii", this.offset + 1, this.offset + 1 + len);
        this.offset += len + 2;
        return s;
      }
      case "v": {
        const sig = this.value("g", depth + 1) as string;
        const [inner, ...rest] = splitSignature(sig);
        if (!inner || rest.length) throw new WireError("a variant holds one type");
        return new Variant(sig, this.value(inner, depth + 1));
      }
      case "a": {
        const len = this.u32();
        if (len > 64 * 1024 * 1024) throw new WireError("array too long");
        const element = type.slice(1);
        this.align(alignmentOf(element));
        const end = this.offset + len;
        this.need(len);
        const out: unknown[] = [];
        while (this.offset < end) out.push(this.value(element, depth + 1));
        if (this.offset !== end) throw new WireError("array length mismatch");
        return out;
      }
      case "(":
      case "{":
        return innerTypes(type).map((m) => this.value(m, depth + 1));
    }
    throw new WireError(`cannot read ${type}`);
  }
}

/** Unmarshal a body: its bytes start 8-aligned. */
export function unmarshal(signature: string, body: Buffer, little = true): unknown[] {
  const r = new Reader(body, little);
  const out = splitSignature(signature).map((t) => r.value(t));
  if (r.offset !== body.length) throw new WireError("body has trailing bytes");
  return out;
}

// ── Messages ─────────────────────────────────────────────────────────────────

/** Encode a message, little-endian. */
export function encodeMessage(m: Message): Buffer {
  const signature = m.signature ?? "";
  const body = signature ? marshal(signature, m.body) : Buffer.alloc(0);
  const fields: [number, Variant][] = [];
  const add = (code: number, v: string | number | undefined) => {
    if (v !== undefined) fields.push([code, new Variant(FIELD_TYPE[code], v)]);
  };
  add(FIELD.path, m.path);
  add(FIELD.interface, m.interface);
  add(FIELD.member, m.member);
  add(FIELD.errorName, m.errorName);
  add(FIELD.replySerial, m.replySerial);
  add(FIELD.destination, m.destination);
  add(FIELD.sender, m.sender);
  if (signature) add(FIELD.signature, signature);

  const w = new Writer();
  w.u8(0x6c); // 'l'
  w.u8(m.type);
  w.u8(m.flags);
  w.u8(1);
  w.value("u", body.length);
  w.value("u", m.serial);
  w.value("a(yv)", fields);
  w.align(8);
  w.bytes(body);
  return w.take();
}

/**
 * The length of the whole message at the start of `buf`, or null when not
 * enough of it has arrived to tell.
 */
export function messageLength(buf: Buffer): number | null {
  if (buf.length < 16) return null;
  const little = buf[0] === 0x6c;
  if (!little && buf[0] !== 0x42) throw new WireError("bad endianness byte");
  const bodyLength = little ? buf.readUInt32LE(4) : buf.readUInt32BE(4);
  const fieldsLength = little ? buf.readUInt32LE(12) : buf.readUInt32BE(12);
  const headerEnd = 16 + fieldsLength + ((8 - ((16 + fieldsLength) % 8)) % 8);
  const total = headerEnd + bodyLength;
  if (total > MAX_MESSAGE) throw new WireError("message too large");
  return total;
}

/** Decode one complete message (as long as {@link messageLength} said). */
export function decodeMessage(buf: Buffer): Message {
  const little = buf[0] === 0x6c;
  const r = new Reader(buf, little, 4);
  const bodyLength = r.u32();
  const serial = r.u32();
  const fields = r.value("a(yv)") as [number, Variant][];
  r.align(8);
  const m: Message = {
    type: buf[1] as MessageType,
    flags: buf[2],
    serial,
    body: [],
  };
  for (const [code, v] of fields) {
    const value = v.value;
    switch (code) {
      case FIELD.path:
        m.path = value as string;
        break;
      case FIELD.interface:
        m.interface = value as string;
        break;
      case FIELD.member:
        m.member = value as string;
        break;
      case FIELD.errorName:
        m.errorName = value as string;
        break;
      case FIELD.replySerial:
        m.replySerial = value as number;
        break;
      case FIELD.destination:
        m.destination = value as string;
        break;
      case FIELD.sender:
        m.sender = value as string;
        break;
      case FIELD.signature:
        m.signature = value as string;
        break;
    }
  }
  const body = buf.subarray(r.offset, r.offset + bodyLength);
  if (body.length !== bodyLength) throw new WireError("message ends early");
  m.body = m.signature ? unmarshal(m.signature, body, little) : [];
  return m;
}
