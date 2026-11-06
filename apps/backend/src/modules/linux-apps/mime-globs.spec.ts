import { claimOfGlob, claimsOf, loadGlobs, parseGlobs } from './mime-globs';
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const GLOBS2 = [
  '# This file was automatically generated',
  '50:application/vnd.oasis.opendocument.text:*.odt',
  '50:application/vnd.oasis.opendocument.text-template:*.ott',
  '50:application/rtf:*.rtf',
  '50:application/x-tar:*.tar.gz',
  '50:text/x-makefile:Makefile',
  '50:image/x-xcf:*.XCF',
  '50:text/x-case:*.cs:cs',
  '50:image/jpeg:*.jp[e]g',
  'garbage',
].join('\n');

describe('shared-mime-info globs', () => {
  it('reads an extension, or a whole name, as the claim a glob makes', () => {
    expect(claimOfGlob('*.odt')).toBe('odt');
    expect(claimOfGlob('*.ODT')).toBe('odt');
    expect(claimOfGlob('Makefile')).toBe('makefile');
    expect(claimOfGlob('*.jp[e]g')).toBeNull();
    expect(claimOfGlob('*.cs', true)).toBeNull();
  });

  it('parses globs2, skipping what a name cannot match', () => {
    const g = parseGlobs(GLOBS2);
    expect(g.get('application/vnd.oasis.opendocument.text')).toEqual(['odt']);
    expect(g.get('text/x-makefile')).toEqual(['makefile']);
    expect(g.get('image/x-xcf')).toEqual(['xcf']);
    expect(g.has('text/x-case')).toBe(false);
    expect(g.has('image/jpeg')).toBe(false);
    expect(g.has('application/x-tar')).toBe(false);
  });

  it('parses the older globs file, with no weights', () => {
    expect(
      parseGlobs('application/rtf:*.rtf\n').get('application/rtf'),
    ).toEqual(['rtf']);
  });

  it("turns an entry's MIME types into the claims it makes", () => {
    const g = parseGlobs(GLOBS2);
    expect(
      claimsOf(g, [
        'application/vnd.oasis.opendocument.text',
        'application/rtf',
        'x/unknown',
      ]),
    ).toEqual(['odt', 'rtf']);
  });

  it("loads the profile's database, or says it is not there", async () => {
    const profile = mkdtempSync(join(tmpdir(), 'globs-'));
    const noImage = join(profile, 'no-image-mime');
    expect(await loadGlobs(profile, noImage)).toMatchObject({
      missing: expect.stringContaining('globs2') as string,
    });
    mkdirSync(join(profile, 'share', 'mime'), { recursive: true });
    writeFileSync(join(profile, 'share', 'mime', 'globs2'), GLOBS2);
    const found = await loadGlobs(profile, noImage);
    expect('globs' in found && found.globs.get('application/rtf')).toEqual([
      'rtf',
    ]);
  });

  it("falls back to the image's database when the profile has none", async () => {
    const profile = mkdtempSync(join(tmpdir(), 'globs-'));
    const image = join(profile, 'image-mime');
    mkdirSync(image, { recursive: true });
    writeFileSync(join(image, 'globs2'), GLOBS2);
    const found = await loadGlobs(profile, image);
    expect('globs' in found && found.globs.get('application/rtf')).toEqual([
      'rtf',
    ]);
  });
});
