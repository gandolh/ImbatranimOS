// In-memory DB and a scratch home so this e2e never touches real data.
process.env.DB_PATH = ':memory:';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomBytes, randomUUID } from 'crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import type { Server } from 'http';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';

import { ConfigModule } from '../src/config/config.module';
import { DbModule } from '../src/db/db.module';
import { DbService } from '../src/db/db.service';
import { AppIdentityModule } from '../src/modules/app-identity/app-identity.module';
import { APP_TOKEN_HEADER } from '../src/modules/app-identity/app-identity.types';
import { USER_ONLY } from '../src/modules/app-identity/calling-app';
import { ModeStore } from '../src/modules/app-identity/mode-store.service';
import { FILE_NOT_GRANTED } from '../src/modules/files/file-access';
import { FilesModule } from '../src/modules/files/files.module';
import {
  IdentityTestModule,
  TEST_COOKIE,
} from '../src/modules/identity/testing';

const mint = () => randomBytes(32).toString('hex');
const codeOf = (res: request.Response) => (res.body as { code?: string }).code;
const messageOf = (res: request.Response) =>
  (res.body as { message?: string }).message ?? '';

describe('Files by grant (e2e)', () => {
  let app: INestApplication<Server>;
  let http: ReturnType<typeof request>;
  let home: string;
  const prevRoot = process.env.FILES_ROOT;

  beforeEach(async () => {
    home = mkdtempSync(join(tmpdir(), 'imb-grants-e2e-'));
    process.env.FILES_ROOT = home;
    mkdirSync(join(home, 'Documents/sub'), { recursive: true });
    writeFileSync(join(home, 'Documents/plan.txt'), 'the plan');
    writeFileSync(join(home, 'Documents/other.txt'), 'not given');
    writeFileSync(join(home, 'Documents/sub/deep.txt'), 'deep');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule,
        DbModule,
        IdentityTestModule,
        AppIdentityModule,
        FilesModule,
      ],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    http = request(app.getHttpServer());

    // Hollow and Quill are installed apps; anything else is a built-in.
    const insert = app.get(DbService).db.prepare(
      `INSERT INTO marketplace_apps (id, ref, build_id, root, entry, installed_at)
         VALUES (?, 'abc', 'b1', '/x', ?, 1)`,
    );
    insert.run('hollow', 'dist/hollow.js');
    insert.run('quill', 'dist/quill.js');
  });

  afterEach(async () => {
    await app.close();
    process.env.FILES_ROOT = prevRoot;
    rmSync(home, { recursive: true, force: true });
  });

  type Copy = { appId: string; instanceId: string; token: string };

  /** Register a token for a window of `appId`, as core does on its first call. */
  async function open(
    appId: string,
    instanceId: string = randomUUID(),
  ): Promise<Copy> {
    const token = mint();
    await http
      .post('/api/system/app-tokens')
      .set('Cookie', TEST_COOKIE)
      .send({ token, appId, instanceId, windowId: instanceId })
      .expect(201);
    return { appId, instanceId, token };
  }

  /** The OS gives a window a path (an open, or a pick), as core does: as the user. */
  const give = (
    to: Copy,
    path: string,
    expect?: 'file' | 'folder',
    via?: Copy,
  ) => {
    const req = http
      .post('/api/files/grants')
      .set('Cookie', TEST_COOKIE)
      .send({
        instanceId: to.instanceId,
        appId: to.appId,
        root: 'home',
        path,
        ...(expect ? { expect } : {}),
      });
    return via ? req.set(APP_TOKEN_HEADER, via.token) : req;
  };

  const as = (who: Copy | null) => {
    const sign = (req: request.Test) => {
      req.set('Cookie', TEST_COOKIE);
      return who ? req.set(APP_TOKEN_HEADER, who.token) : req;
    };
    return {
      read: (path: string) =>
        sign(http.get('/api/files/content').query({ root: 'home', path })),
      download: (path: string) =>
        sign(http.get('/api/files/download').query({ root: 'home', path })),
      list: (path: string) =>
        sign(http.get('/api/files').query({ root: 'home', path })),
      stat: (path: string) =>
        sign(http.get('/api/files/stat').query({ root: 'home', path })),
      write: (path: string, content: string) =>
        sign(
          http.put('/api/files/content').send({ root: 'home', path, content }),
        ),
      upload: (path: string, bytes: string) =>
        sign(
          http
            .post('/api/files/upload')
            .field('root', 'home')
            .field('path', path)
            .attach('file', Buffer.from(bytes), 'blob'),
        ),
      mkdir: (path: string) =>
        sign(http.post('/api/files/directory').send({ root: 'home', path })),
      remove: (path: string) =>
        sign(http.delete('/api/files').query({ root: 'home', path })),
      search: (query: string, path = '') =>
        sign(
          http
            .get('/api/files/search')
            .query({ root: 'home', query, path, content: '1' }),
        ),
    };
  };

  it('an installed app is refused what it was not given, by name; a built-in still reads anywhere', async () => {
    const hollow = await open('hollow');
    const quill = await open('quill');
    for (const who of [hollow, quill]) {
      const res = await as(who).read('Documents/plan.txt').expect(403);
      expect(codeOf(res)).toBe(FILE_NOT_GRANTED);
      expect(messageOf(res)).toContain('home:Documents/plan.txt');
      expect(messageOf(res)).not.toContain(home);
      await as(who).list('Documents').expect(403);
      await as(who).write('Documents/plan.txt', 'x').expect(403);
      await as(who).upload('Documents/new.txt', 'x').expect(403);
    }
    // The user, and Files acting as the user, reach everything.
    await as(null).read('Documents/plan.txt').expect(200);
    await as(null).list('Documents').expect(200);
    // Built-ins keep their reach until each has a way to be given files.
    const notepad = await open('notepad');
    await as(notepad).read('Documents/plan.txt').expect(200);
    await as(notepad).list('Documents').expect(200);
  });

  it('a window may read and save the file it was opened with, and nothing beside it', async () => {
    const docs = await open('hollow');
    await give(docs, 'Documents/plan.txt').expect(204);

    const read = await as(docs).read('Documents/plan.txt').expect(200);
    expect((read.body as { content: string }).content).toBe('the plan');
    await as(docs).download('Documents/plan.txt').expect(200);
    await as(docs).write('Documents/plan.txt', 'edited').expect(200);
    await as(docs).upload('Documents/plan.txt', 'saved').expect(201);
    expect(readFileSync(join(home, 'Documents/plan.txt'), 'utf8')).toBe(
      'saved',
    );
    const stat = await as(docs).stat('Documents/plan.txt').expect(200);
    expect((stat.body as { size: number }).size).toBe(5);

    await as(docs).read('Documents/other.txt').expect(403);
    await as(docs).list('Documents').expect(403);
    await as(docs).remove('Documents/plan.txt').expect(403);
  });

  it('Save as writes the picked path, which stays the user’s', async () => {
    const docs = await open('hollow');
    await give(docs, 'Documents/new folder/report.txt', 'file').expect(204);
    await as(docs).upload('Documents/new folder/report.txt', 'hi').expect(201);
    expect(
      readFileSync(join(home, 'Documents/new folder/report.txt'), 'utf8'),
    ).toBe('hi');
    expect(
      app.get(ModeStore).stat(join(home, 'Documents/new folder/report.txt')),
    ).toBeNull();
    await as(docs).upload('Documents/new folder/other.txt', 'no').expect(403);
  });

  it('a picked folder gives what is under it, but not the folder itself', async () => {
    const player = await open('hollow');
    await give(player, 'Documents', 'folder').expect(204);

    const listed = await as(player).list('Documents').expect(200);
    expect(
      (listed.body as { name: string }[]).map((e) => e.name).sort(),
    ).toEqual(['other.txt', 'plan.txt', 'sub']);
    await as(player).read('Documents/sub/deep.txt').expect(200);
    await as(player).mkdir('Documents/sub/more').expect(201);
    await as(player).write('Documents/sub/more/a.txt', 'a').expect(200);
    await as(player).remove('Documents/sub/more').expect(204);
    await as(player).remove('Documents').expect(403);
    await as(player).list('').expect(403);

    const found = await as(player).search('deep', 'Documents').expect(200);
    expect(
      (found.body as { items: { path: string }[] }).items.map((i) => i.path),
    ).toEqual(['Documents/sub/deep.txt']);
    await as(player).search('deep').expect(403);
  });

  it('a picked folder stops at another app’s own folder', async () => {
    const editor = await open('code-editor');
    const owned = join(home, 'Documents/sub');
    app.get(ModeStore).set(owned, {
      owner: 'hollow',
      group: 'hollow',
      mode: 0o700,
    });
    await give(editor, 'Documents', 'folder').expect(204);
    await as(editor).list('Documents').expect(200);
    await as(editor).list('Documents/sub').expect(403);
    await as(editor).read('Documents/sub/deep.txt').expect(403);
    const found = await as(editor).search('deep', 'Documents').expect(200);
    expect((found.body as { items: unknown[] }).items).toEqual([]);
  });

  it('a second window of the same app holds nothing until it is given something', async () => {
    const first = await open('hollow');
    const second = await open('hollow');
    await give(first, 'Documents/plan.txt').expect(204);
    await as(first).read('Documents/plan.txt').expect(200);
    await as(second).read('Documents/plan.txt').expect(403);
    await give(second, 'Documents/plan.txt').expect(204);
    await as(second).read('Documents/plan.txt').expect(200);
  });

  it('grants die with the window, and outlive a new token for the same window', async () => {
    const instanceId = randomUUID();
    const before = await open('hollow', instanceId);
    await give(before, 'Documents/plan.txt').expect(204);

    // A backend restart ends every token; core mints the window a new one.
    const after = await open('hollow', instanceId);
    await as(after).read('Documents/plan.txt').expect(200);

    // Closing the window ends its token, and what it was given.
    await http
      .delete('/api/system/app-tokens/self')
      .set('Cookie', TEST_COOKIE)
      .set(APP_TOKEN_HEADER, after.token)
      .expect(204);
    const reopened = await open('hollow', instanceId);
    await as(reopened).read('Documents/plan.txt').expect(403);

    // Core drops them as the user too, for a window that never called.
    await give(reopened, 'Documents/plan.txt').expect(204);
    await http
      .delete(`/api/files/grants/${instanceId}`)
      .set('Cookie', TEST_COOKIE)
      .expect(204);
    await as(reopened).read('Documents/plan.txt').expect(403);
  });

  it('an app hands on what it holds, and nothing more', async () => {
    const client = await open('hollow');
    const quill = await open('quill');

    // It holds nothing: handing on is refused, and gives nothing.
    await give(quill, 'Documents/plan.txt', undefined, client).expect(403);
    await as(quill).read('Documents/plan.txt').expect(403);

    // Its own data file, by its modes.
    const own = join(home, '.local/share/imbatranim/hollow');
    mkdirSync(own, { recursive: true });
    writeFileSync(join(own, 'collections.json'), '{}');
    const store = app.get(ModeStore);
    const asClient = {
      appId: 'hollow',
      instanceId: client.instanceId,
      windowId: null,
      groups: ['hollow'],
    };
    store.create(asClient, own, 'directory');
    store.create(asClient, join(own, 'collections.json'), 'file');
    const doc = '.local/share/imbatranim/hollow/collections.json';
    await as(quill).read(doc).expect(403);
    await give(quill, doc, undefined, client).expect(204);
    await as(quill).read(doc).expect(200);

    // A file given to it hands on as a file, never as its folder.
    await give(client, 'Documents/plan.txt').expect(204);
    await give(quill, 'Documents', 'folder', client).expect(403);
    await give(quill, 'Documents/plan.txt', undefined, client).expect(204);
    await as(quill).read('Documents/plan.txt').expect(200);

    // An app ends no window's grants.
    const ended = await http
      .delete(`/api/files/grants/${quill.instanceId}`)
      .set('Cookie', TEST_COOKIE)
      .set(APP_TOKEN_HEADER, client.token)
      .expect(403);
    expect(codeOf(ended)).toBe(USER_ONLY);
  });

  it('a grant matches what the dialog said it gave', async () => {
    const docs = await open('hollow');
    await give(docs, 'Documents', 'file').expect(400);
    await give(docs, 'Documents/plan.txt', 'folder').expect(400);
    await give(docs, 'Documents/missing', 'folder').expect(404);
    await give(docs, '../outside.txt').expect(400);
    await http
      .post('/api/files/grants')
      .set('Cookie', TEST_COOKIE)
      .send({
        instanceId: docs.instanceId,
        appId: 'system',
        root: 'home',
        path: 'a',
      })
      .expect(400);
  });

  it('an app records, sees and drops only its own recent files, and only what it may read', async () => {
    const docs = await open('hollow');
    const record = (who: Copy | null, path: string, appId: string) => {
      const req = http
        .post('/api/files/recent')
        .set('Cookie', TEST_COOKIE)
        .send({ root: 'home', path, appId });
      return who ? req.set(APP_TOKEN_HEADER, who.token) : req;
    };
    await record(docs, 'Documents/plan.txt', 'hollow').expect(403);
    await give(docs, 'Documents/plan.txt').expect(204);
    await record(docs, 'Documents/plan.txt', 'notepad').expect(403);
    await record(docs, 'Documents/plan.txt', 'hollow').expect(204);
    await record(null, 'Documents/other.txt', 'notepad').expect(204);

    const mine = await http
      .get('/api/files/recent')
      .set('Cookie', TEST_COOKIE)
      .set(APP_TOKEN_HEADER, docs.token)
      .expect(200);
    expect((mine.body as { path: string }[]).map((r) => r.path)).toEqual([
      'Documents/plan.txt',
    ]);
    await http
      .delete('/api/files/recent')
      .query({ root: 'home', path: 'Documents/other.txt' })
      .set('Cookie', TEST_COOKIE)
      .set(APP_TOKEN_HEADER, docs.token)
      .expect(204);
    await http
      .delete('/api/files/recent/all')
      .set('Cookie', TEST_COOKIE)
      .set(APP_TOKEN_HEADER, docs.token)
      .expect(403);
    const all = await http
      .get('/api/files/recent')
      .set('Cookie', TEST_COOKIE)
      .expect(200);
    expect((all.body as unknown[]).length).toBe(2);
  });

  it('the Trash is the user’s alone', async () => {
    const docs = await open('hollow');
    const res = await http
      .get('/api/files/trash')
      .set('Cookie', TEST_COOKIE)
      .set(APP_TOKEN_HEADER, docs.token)
      .expect(403);
    expect(codeOf(res)).toBe(USER_ONLY);
    await http.get('/api/files/trash').set('Cookie', TEST_COOKIE).expect(200);

    // Trashing is deleting: a picked folder's child may go, the rest may not.
    await give(docs, 'Documents/sub', 'folder').expect(204);
    await http
      .delete('/api/files')
      .query({ root: 'home', path: 'Documents/plan.txt', trash: '1' })
      .set('Cookie', TEST_COOKIE)
      .set(APP_TOKEN_HEADER, docs.token)
      .expect(403);
    await http
      .delete('/api/files')
      .query({ root: 'home', path: 'Documents/sub/deep.txt', trash: '1' })
      .set('Cookie', TEST_COOKIE)
      .set(APP_TOKEN_HEADER, docs.token)
      .expect(204);
    expect(existsSync(join(home, 'Documents/sub/deep.txt'))).toBe(false);
  });

  it('an app’s own folder works through the files API by its modes, and what it makes there is its own', async () => {
    const docs = await open('hollow');
    const own = join(home, '.config/imbatranim/hollow');
    mkdirSync(own, { recursive: true });
    const store = app.get(ModeStore);
    store.create(
      {
        appId: 'hollow',
        instanceId: docs.instanceId,
        windowId: null,
        groups: ['hollow'],
      },
      own,
      'directory',
    );
    await as(docs)
      .write('.config/imbatranim/hollow/a/b.json', '{}')
      .expect(200);
    expect(store.stat(join(own, 'a'))?.owner).toBe('hollow');
    expect(store.stat(join(own, 'a/b.json'))?.owner).toBe('hollow');
    await as(docs).read('.config/imbatranim/hollow/a/b.json').expect(200);
    await as(docs).list('.config/imbatranim').expect(403);
  });
});
