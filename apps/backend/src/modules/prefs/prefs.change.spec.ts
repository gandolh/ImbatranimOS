import * as fs from 'node:fs';
import * as os from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import { DbService } from '../../db/db.service';
import { PrefsService } from './prefs.service';

describe('PrefsService change listeners', () => {
  let dir: string;
  let db: DbService;
  let prefs: PrefsService;

  beforeEach(() => {
    dir = fs.mkdtempSync(join(os.tmpdir(), 'imb-prefs-change-'));
    const config = {
      get: (key: string) => (key === 'DB_PATH' ? join(dir, 'db.sqlite') : 24),
    } as unknown as ConfigService<never, true>;
    db = new DbService(config);
    db.onModuleInit();
    prefs = new PrefsService(db);
  });

  afterEach(() => {
    db.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('tells a listener each key written, and null for a reset', () => {
    const seen: [string, string | null][] = [];
    prefs.onChange((k, v) => seen.push([k, v]));
    prefs.put([
      { key: 'a', value: '1' },
      { key: 'imbatranimos:appearance', value: '{}' },
    ]);
    prefs.remove('a');
    expect(seen).toEqual([
      ['a', '1'],
      ['imbatranimos:appearance', '{}'],
      ['a', null],
    ]);
  });

  it('stops telling a listener that unsubscribed, and survives one that throws', () => {
    const seen: string[] = [];
    prefs.onChange(() => {
      throw new Error('boom');
    });
    const off = prefs.onChange((k) => seen.push(k));
    expect(prefs.put([{ key: 'a', value: '1' }]).written).toBe(1);
    off();
    prefs.put([{ key: 'b', value: '1' }]);
    expect(seen).toEqual(['a']);
    expect(prefs.get('b')).toBe('1');
  });
});
