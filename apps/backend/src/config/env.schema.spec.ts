import { envSchema, ignoredEnvNotice } from './env.schema';

describe('ignoredEnvNotice (brief 157)', () => {
  it('is null when no WARD_* variable is set', () => {
    expect(ignoredEnvNotice({ PATH: '/usr/bin', SETUP_TOKEN: 't' })).toBeNull();
  });

  it('names every WARD_* variable in one line', () => {
    const notice = ignoredEnvNotice({
      WARD_APP_KEY: 'k',
      WARD_PUBLIC_ORIGIN: 'https://estate.example',
      PATH: '/usr/bin',
    });
    expect(notice).toContain('WARD_APP_KEY, WARD_PUBLIC_ORIGIN');
    expect(notice).not.toContain('PATH');
    expect(notice).not.toContain('\n');
  });

  it('does not stop the schema from parsing an old environment', () => {
    const parsed = envSchema.safeParse({
      WARD_PUBLIC_ORIGIN: 'https://estate.example',
      WARD_APP_KEY: 'k',
    });
    expect(parsed.success).toBe(true);
  });
});
