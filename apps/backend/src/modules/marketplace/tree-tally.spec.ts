import { TreeTally } from './tree-tally';

const OID = 'a'.repeat(40);

/** One `git ls-tree -r -l -z` record. */
const record = (mode: string, type: string, size: string, path: string) =>
  `${mode} ${type} ${OID} ${size.padStart(7)}\t${path}\0`;

function tally(output: string, chunkSize = output.length || 1): TreeTally {
  const t = new TreeTally();
  const bytes = Buffer.from(output, 'utf8');
  for (let i = 0; i < bytes.length; i += chunkSize) {
    t.push(bytes.subarray(i, i + chunkSize));
  }
  return t;
}

describe('TreeTally (brief 158)', () => {
  const output = [
    record('100644', 'blob', '1048576', 'dist/zeros-1.bin'),
    // The same blob under another name: checkout writes it again.
    record('100644', 'blob', '1048576', 'dist/zeros-2.bin'),
    record('100755', 'blob', '12', 'tools/run'),
    record('120000', 'blob', '8', 'dist/link'),
    // A submodule link: no size, nothing written but an empty directory.
    record('160000', 'commit', '-', 'vendor/lib'),
    // A path holding a tab, a space and a newline: -z keeps it unquoted.
    record('100644', 'blob', '3', 'odd\tname with\nnewline'),
  ].join('');

  it("counts every path, and every path's blob, duplicates included", () => {
    const t = tally(output);
    expect(t.entries).toBe(6);
    expect(t.bytes).toBe(2 * 1048576 + 12 + 8 + 3);
    expect(t.malformed).toBe(false);
    expect(t.partial).toBe(false);
  });

  it('counts the same however the output is cut into chunks', () => {
    for (const size of [1, 2, 3, 7, 50, 51, 64]) {
      const t = tally(output, size);
      expect([size, t.entries, t.bytes]).toEqual([
        size,
        6,
        2 * 1048576 + 12 + 8 + 3,
      ]);
    }
  });

  it('says whether it is within the limits', () => {
    const t = tally(output);
    expect(t.within({ bytes: 3 * 1048576, entries: 6 })).toBe(true);
    expect(t.within({ bytes: 3 * 1048576, entries: 5 })).toBe(false);
    expect(t.within({ bytes: 2 * 1048576, entries: 100 })).toBe(false);
  });

  it('notices output cut off mid-record', () => {
    expect(tally(output.slice(0, -1)).partial).toBe(true);
    expect(tally(output.slice(0, 20)).partial).toBe(true);
    expect(tally('').partial).toBe(false);
  });

  it.each([
    ['a record head with no tab', 'x'.repeat(300)],
    ['a blob with no size', `100644 blob ${OID} -\tp\0`],
    ['a head with too few fields', `100644 blob\tp\0`],
    ['a head with too many fields', `100644 blob ${OID} 1 2\tp\0`],
    ['a size that is not a number', `100644 blob ${OID} 1e9\tp\0`],
  ])('refuses %s as malformed', (_label, text) => {
    const t = tally(text);
    expect(t.malformed).toBe(true);
    expect(t.within({ bytes: Infinity, entries: Infinity })).toBe(false);
  });
});
