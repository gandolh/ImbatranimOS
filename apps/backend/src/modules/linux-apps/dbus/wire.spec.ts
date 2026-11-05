import {
  decodeMessage,
  encodeMessage,
  marshal,
  messageLength,
  MessageType,
  splitSignature,
  unmarshal,
  Variant,
  WireError,
} from './wire';

const bytes = (b: Buffer) => [...b];

describe('D-Bus signatures', () => {
  it('split into complete types', () => {
    expect(splitSignature('susssasa{sv}i')).toEqual([
      's',
      'u',
      's',
      's',
      's',
      'as',
      'a{sv}',
      'i',
    ]);
    expect(splitSignature('a(ia{sv})v')).toEqual(['a(ia{sv})', 'v']);
    expect(splitSignature('')).toEqual([]);
  });

  it('refuse broken ones', () => {
    expect(() => splitSignature('(ii')).toThrow(WireError);
    expect(() => splitSignature('a')).toThrow(WireError);
    expect(() => splitSignature('z')).toThrow(WireError);
  });
});

describe('D-Bus marshalling', () => {
  it('pads each value to its alignment, as the spec lays out', () => {
    expect(bytes(marshal('yu', [1, 2]))).toEqual([1, 0, 0, 0, 2, 0, 0, 0]);
    expect(bytes(marshal('ys', [1, 'ab']))).toEqual([
      1, 0, 0, 0, 2, 0, 0, 0, 0x61, 0x62, 0,
    ]);
    // An empty array of structs still pads to the struct's 8 after its length.
    expect(bytes(marshal('ya(yy)', [7, []]))).toEqual([7, 0, 0, 0, 0, 0, 0, 0]);
    // A signature is a byte length, the text and a nul.
    expect(bytes(marshal('g', ['as']))).toEqual([2, 0x61, 0x73, 0]);
    // A boolean is four bytes.
    expect(bytes(marshal('b', [true]))).toEqual([1, 0, 0, 0]);
  });

  it('counts an array by its elements, without the padding before them', () => {
    const b = marshal('at', [[1n, 2n]]);
    expect(b.readUInt32LE(0)).toBe(16);
    expect(b.length).toBe(4 + 4 + 16);
  });

  it('round-trips every type', () => {
    const sig = 'ybnqiuxtdsogasv(si)a{sv}';
    const values = [
      255,
      true,
      -2,
      65535,
      -70000,
      4000000000,
      -(2n ** 40n),
      2n ** 63n,
      1.5,
      'ș ț',
      '/org/freedesktop/Notifications',
      'a{sv}',
      ['one', 'two'],
      new Variant('u', 7),
      ['pair', 3],
      [
        ['urgency', new Variant('y', 1)],
        [
          'image-data',
          new Variant('(iiibiiay)', [1, 1, 4, true, 8, 4, [1, 2, 3, 4]]),
        ],
      ],
    ];
    expect(unmarshal(sig, marshal(sig, values))).toEqual(values);
  });

  it('refuses values of the wrong shape and trailing bytes', () => {
    expect(() => marshal('u', ['x'])).toThrow(WireError);
    expect(() => marshal('v', [7])).toThrow(WireError);
    expect(() => marshal('(ii)', [[1]])).toThrow(WireError);
    expect(() => unmarshal('u', Buffer.from([1, 0, 0, 0, 9]))).toThrow(
      WireError,
    );
    expect(() => unmarshal('s', Buffer.from([9, 0, 0, 0, 0x61]))).toThrow(
      WireError,
    );
  });
});

describe('D-Bus messages', () => {
  const call = {
    type: MessageType.MethodCall,
    flags: 0,
    serial: 7,
    path: '/org/freedesktop/Notifications',
    interface: 'org.freedesktop.Notifications',
    member: 'Notify',
    destination: 'org.freedesktop.Notifications',
    signature: 'susssasa{sv}i',
    body: ['Firefox', 0, '', 'Hi', 'from a page', [], [], -1],
  };

  it('frame with the fixed header, the fields and an 8-aligned body', () => {
    const b = encodeMessage(call);
    expect(b[0]).toBe(0x6c);
    expect(b[1]).toBe(MessageType.MethodCall);
    expect(b[3]).toBe(1);
    expect(b.readUInt32LE(8)).toBe(7);
    expect(messageLength(b)).toBe(b.length);
    const bodyLength = b.readUInt32LE(4);
    expect((b.length - bodyLength) % 8).toBe(0);
    expect(decodeMessage(b)).toEqual(call);
  });

  it('need the whole message before they decode', () => {
    const b = encodeMessage(call);
    expect(messageLength(b.subarray(0, 10))).toBeNull();
    expect(messageLength(b.subarray(0, 20))).toBe(b.length);
  });

  it('carry no body without a signature', () => {
    const hello = {
      type: MessageType.MethodCall,
      flags: 0,
      serial: 1,
      path: '/org/freedesktop/DBus',
      interface: 'org.freedesktop.DBus',
      member: 'Hello',
      destination: 'org.freedesktop.DBus',
      body: [],
    };
    const b = encodeMessage(hello);
    expect(b.readUInt32LE(4)).toBe(0);
    expect(decodeMessage(b)).toEqual(hello);
  });
});
