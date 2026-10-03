import { zipSync, type Zippable } from 'fflate';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as os from 'os';
import { join } from 'path';
import { FilesService } from '../files/files.service';
import { ArchiveService } from './archive.service';

const execFileAsync = promisify(execFile);

/**
 * Brief 148 — extracting never deletes what is already there.
 *
 * Extracting `project.tar.gz` a second time used to `rm -rf` the existing
 * `project/` folder (every edit, every new file) and rename the archive's copy
 * into its place.
 */
describe('ArchiveService — extracting over existing files (brief 148)', () => {
  let service: ArchiveService;
  let jail: string;
  const prevEnv = process.env.FILES_ROOT;

  beforeEach(async () => {
    jail = await fs.mkdtemp(join(os.tmpdir(), 'imb-a148-'));
    process.env.FILES_ROOT = jail;
    service = new ArchiveService(new FilesService());
  });

  afterEach(async () => {
    process.env.FILES_ROOT = prevEnv;
    await fs.rm(jail, { recursive: true, force: true });
  });

  const bytes = (text: string) => new TextEncoder().encode(text);
  const read = (rel: string) => fs.readFile(join(jail, rel), 'utf-8');
  const exists = (rel: string) =>
    fs.access(join(jail, rel)).then(
      () => true,
      () => false,
    );

  /** A tar.gz of `tree` (relative path → contents) at `name` in the jail. */
  async function writeTarGz(name: string, tree: Record<string, string>) {
    const src = await fs.mkdtemp(join(os.tmpdir(), 'imb-a148-src-'));
    try {
      for (const [rel, text] of Object.entries(tree)) {
        await fs.mkdir(join(src, rel, '..'), { recursive: true });
        await fs.writeFile(join(src, rel), text);
      }
      await execFileAsync('tar', [
        '-czf',
        join(jail, name),
        '-C',
        src,
        ...Object.keys(tree),
      ]);
    } finally {
      await fs.rm(src, { recursive: true, force: true });
    }
    return name;
  }

  async function writeZip(name: string, tree: Zippable) {
    await fs.writeFile(join(jail, name), zipSync(tree));
    return name;
  }

  /** What a user did after the first extraction: an edit and a new file. */
  async function workInside(dir: string) {
    await fs.writeFile(join(jail, dir, 'project/readme.txt'), 'my edits');
    await fs.writeFile(join(jail, dir, 'project/notes.txt'), 'a new file');
  }

  describe.each([
    ['tar.gz', 'project.tar.gz'],
    ['zip', 'project.zip'],
  ])('%s, extracted again with no destination', (kind, archive) => {
    it('goes to "project (2)" and leaves "project/" byte-identical', async () => {
      if (kind === 'zip') {
        await writeZip(archive, { 'project/readme.txt': bytes('pristine') });
      } else {
        await writeTarGz(archive, { 'project/readme.txt': 'pristine' });
      }

      const first = await service.extract('home', archive);
      expect(first.dest).toBe('project');
      await workInside('project');

      const second = await service.extract('home', archive);
      expect(second.dest).toBe('project (2)');
      expect(await read('project/project/readme.txt')).toBe('my edits');
      expect(await read('project/project/notes.txt')).toBe('a new file');
      expect(await read('project (2)/project/readme.txt')).toBe('pristine');

      const third = await service.extract('home', archive);
      expect(third.dest).toBe('project (3)');
    });
  });

  describe.each([
    ['tar.gz', 'project.tar.gz'],
    ['zip', 'project.zip'],
  ])('%s, extracted into an explicit existing destination', (kind, archive) => {
    it('overwrites same-path files and keeps every other file', async () => {
      const tree = {
        'project/readme.txt': 'pristine',
        'project/src/main.c': 'int main(){}',
      };
      if (kind === 'zip') {
        await writeZip(archive, {
          'project/readme.txt': bytes(tree['project/readme.txt']),
          'project/src/main.c': bytes(tree['project/src/main.c']),
        });
      } else {
        await writeTarGz(archive, tree);
      }
      await fs.mkdir(join(jail, 'work/project/src'), { recursive: true });
      await fs.writeFile(join(jail, 'work/project/readme.txt'), 'my edits');
      await fs.writeFile(join(jail, 'work/project/notes.txt'), 'keep me');
      await fs.writeFile(join(jail, 'work/project/src/extra.c'), 'keep me too');
      await fs.writeFile(join(jail, 'work/elsewhere.txt'), 'untouched');

      const result = await service.extract('home', archive, 'work');
      expect(result.dest).toBe('work');

      expect(await read('work/project/readme.txt')).toBe('pristine');
      expect(await read('work/project/src/main.c')).toBe('int main(){}');
      expect(await read('work/project/notes.txt')).toBe('keep me');
      expect(await read('work/project/src/extra.c')).toBe('keep me too');
      expect(await read('work/elsewhere.txt')).toBe('untouched');
    });
  });

  it('leaves no staging directory behind after a merge', async () => {
    await writeTarGz('project.tar.gz', { 'project/a.txt': 'a' });
    await fs.mkdir(join(jail, 'work/project'), { recursive: true });
    await service.extract('home', 'project.tar.gz', 'work');
    const leftovers = (await fs.readdir(jail)).filter((n) =>
      n.startsWith('.archive-tmp-'),
    );
    expect(leftovers).toEqual([]);
    expect(await exists('work/project/a.txt')).toBe(true);
  });
});
