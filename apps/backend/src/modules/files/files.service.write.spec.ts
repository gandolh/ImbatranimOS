import * as os from 'os';
import { join } from 'path';
import { ServiceUnavailableException } from '@nestjs/common';

/*
 * Brief 140: a save that fails part-way must leave the original file alone.
 *
 * The other atomicity tests use real filesystem conditions, but no real
 * condition fails `writeFile`'s own write without root (a full tmpfs) or
 * failing the old in-place write too. So this file mocks `fs/promises` (its
 * exports cannot be spied on in Node 24) with the real module plus a
 * `writeFile` a test can make fail after writing part of its data: a disk that
 * fills mid-save.
 */
jest.mock('fs/promises', () => {
  const actual =
    jest.requireActual<typeof import('fs/promises')>('fs/promises');
  return { ...actual, writeFile: jest.fn(actual.writeFile) };
});

import * as fs from 'fs/promises';
import { FilesService } from './files.service';

const actual = jest.requireActual<typeof import('fs/promises')>('fs/promises');
const writeFile = fs.writeFile as unknown as jest.Mock;

describe('FilesService.writeFile when the disk fills mid-save', () => {
  let service: FilesService;
  let jail: string;
  const prevEnv = process.env.FILES_ROOT;

  beforeEach(async () => {
    jail = await actual.mkdtemp(join(os.tmpdir(), 'imb-write-'));
    process.env.FILES_ROOT = jail;
    service = new FilesService();
  });

  afterEach(async () => {
    writeFile.mockReset();
    writeFile.mockImplementation(actual.writeFile);
    process.env.FILES_ROOT = prevEnv;
    await actual.rm(jail, { recursive: true, force: true });
  });

  it('keeps the original bytes and leaves no staging file', async () => {
    await actual.writeFile(join(jail, 'notes.txt'), 'the only copy', 'utf-8');
    writeFile.mockImplementationOnce(async (path: string, data: string) => {
      // Half the new content lands, then the disk is full.
      await actual.writeFile(path, data.slice(0, 4), 'utf-8');
      throw Object.assign(new Error('ENOSPC: no space left on device'), {
        code: 'ENOSPC',
      });
    });

    await expect(
      service.writeFile('home', 'notes.txt', 'a much longer replacement'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(await actual.readFile(join(jail, 'notes.txt'), 'utf-8')).toBe(
      'the only copy',
    );
    expect(await actual.readdir(jail)).toEqual(['notes.txt']);
  });
});
