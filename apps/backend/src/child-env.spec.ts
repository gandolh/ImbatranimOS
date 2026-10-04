import { childEnv } from './child-env';

describe('childEnv', () => {
  it('drops every WARD_* name and keeps the rest, without touching the input', () => {
    const env = {
      PATH: '/usr/bin',
      EDITOR: 'nano',
      WARD_APP_KEY: 'secret',
      WARD_PUBLIC_ORIGIN: 'https://estate.example',
    };
    expect(childEnv(env)).toEqual({ PATH: '/usr/bin', EDITOR: 'nano' });
    expect(env.WARD_APP_KEY).toBe('secret');
  });
});
