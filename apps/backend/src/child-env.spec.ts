import { childEnv } from './child-env';

describe('childEnv', () => {
  it('drops SETUP_TOKEN and every ignored WARD_* name, keeps the rest, and leaves the input alone', () => {
    const env = {
      PATH: '/usr/bin',
      EDITOR: 'nano',
      SETUP_TOKEN: 'claim-me',
      WARD_APP_KEY: 'secret',
      WARD_PUBLIC_ORIGIN: 'https://estate.example',
    };
    expect(childEnv(env)).toEqual({ PATH: '/usr/bin', EDITOR: 'nano' });
    expect(env.WARD_APP_KEY).toBe('secret');
    expect(env.SETUP_TOKEN).toBe('claim-me');
  });
});
