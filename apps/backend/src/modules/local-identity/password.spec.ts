import { hashPassword, verifyPassword } from './password';

describe('local password hashing (brief 152)', () => {
  it('verifies the password it was made from and nothing else', async () => {
    const stored = await hashPassword('correct horse battery');
    expect(stored).toMatch(/^scrypt\$15\$8\$1\$[\w-]+\$[\w-]+$/);
    await expect(verifyPassword('correct horse battery', stored)).resolves.toBe(
      true,
    );
    await expect(verifyPassword('correct horse batterY', stored)).resolves.toBe(
      false,
    );
  });

  it('salts: the same password hashes differently twice', async () => {
    expect(await hashPassword('same password')).not.toBe(
      await hashPassword('same password'),
    );
  });

  it('refuses a stored value that is not one of its hashes', async () => {
    await expect(
      verifyPassword('anything', 'argon2id$v=19$m=65536'),
    ).resolves.toBe(false);
  });
});
