import {
  ALLOWED_PORTS,
  EgressRefusedError,
  isPublicAddress,
  resolvePublicTarget,
} from './egress';

describe('isPublicAddress — the relay reaches public unicast only (brief 50)', () => {
  it.each([
    '8.8.8.8',
    '93.184.215.14',
    '2001:4860:4860::8888',
    '::ffff:8.8.8.8',
  ])('allows %s', (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it.each([
    ['127.0.0.1', 'loopback'],
    ['127.255.255.254', 'loopback'],
    ['::1', 'IPv6 loopback'],
    ['10.0.0.1', 'RFC 1918'],
    ['172.16.0.1', 'RFC 1918'],
    ['172.31.255.255', 'RFC 1918'],
    ['192.168.1.1', 'RFC 1918'],
    ['169.254.169.254', 'cloud metadata (link-local)'],
    ['fe80::1', 'IPv6 link-local'],
    ['fd00::1', 'IPv6 unique local'],
    ['100.64.0.1', 'carrier-grade NAT'],
    ['0.0.0.0', 'unspecified'],
    ['::', 'IPv6 unspecified'],
    ['224.0.0.1', 'multicast'],
    ['255.255.255.255', 'broadcast'],
    ['::ffff:127.0.0.1', 'IPv4-mapped loopback'],
    ['::ffff:169.254.169.254', 'IPv4-mapped metadata'],
    ['::ffff:10.0.0.1', 'IPv4-mapped private'],
    ['::7f00:1', 'IPv4-compatible loopback'],
    ['64:ff9b::7f00:1', 'NAT64 of loopback'],
    ['2002:7f00:1::', '6to4 of loopback'],
    ['192.0.2.1', 'documentation'],
    ['not an address', 'garbage'],
  ])('refuses %s (%s)', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });
});

describe('resolvePublicTarget', () => {
  const answers =
    (...addresses: string[]) =>
    () =>
      Promise.resolve(
        addresses.map((address) => ({
          address,
          family: address.includes(':') ? 6 : 4,
        })),
      );

  it('returns the checked address of a public host', async () => {
    await expect(
      resolvePublicTarget('example.com', 443, answers('93.184.215.14')),
    ).resolves.toEqual({ address: '93.184.215.14', family: 4 });
  });

  it('refuses a hostname that resolves to loopback', async () => {
    await expect(
      resolvePublicTarget('localtest.me', 80, answers('127.0.0.1')),
    ).rejects.toBeInstanceOf(EgressRefusedError);
  });

  it('refuses a hostname with ANY non-public answer, whichever comes first', async () => {
    await expect(
      resolvePublicTarget('mixed.test', 443, answers('8.8.8.8', '10.0.0.5')),
    ).rejects.toBeInstanceOf(EgressRefusedError);
    await expect(
      resolvePublicTarget('mixed.test', 443, answers('fd00::5', '8.8.8.8')),
    ).rejects.toBeInstanceOf(EgressRefusedError);
  });

  it('refuses a hostname resolving to an IPv4-mapped private address', async () => {
    await expect(
      resolvePublicTarget('mapped.test', 443, answers('::ffff:192.168.0.1')),
    ).rejects.toBeInstanceOf(EgressRefusedError);
  });

  it('refuses address literals without a lookup, brackets or not', async () => {
    const lookup = jest.fn();
    for (const host of [
      '169.254.169.254',
      '127.0.0.1',
      '[::1]',
      '::ffff:127.0.0.1',
    ]) {
      await expect(resolvePublicTarget(host, 80, lookup)).rejects.toThrow(
        EgressRefusedError,
      );
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  it('refuses a name that does not resolve, or resolves to nothing', async () => {
    await expect(
      resolvePublicTarget('nx.test', 443, () =>
        Promise.reject(new Error('ENOTFOUND')),
      ),
    ).rejects.toBeInstanceOf(EgressRefusedError);
    await expect(
      resolvePublicTarget('empty.test', 443, answers()),
    ).rejects.toBeInstanceOf(EgressRefusedError);
  });

  it('refuses ports that are not web ports, before resolving anything', async () => {
    const lookup = jest.fn();
    for (const port of [22, 25, 3306, 6379, 3001]) {
      expect(ALLOWED_PORTS.has(port)).toBe(false);
      await expect(
        resolvePublicTarget('example.com', port, lookup),
      ).rejects.toBeInstanceOf(EgressRefusedError);
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  it('resolves numeric host spellings through DNS and judges the answer', async () => {
    // "2130706433" and "0x7f.1" are not IP literals to `net.isIP`, but the
    // system resolver turns them into 127.0.0.1. The answer is what is judged.
    await expect(resolvePublicTarget('2130706433', 80)).rejects.toBeInstanceOf(
      EgressRefusedError,
    );
    await expect(resolvePublicTarget('127.1', 80)).rejects.toBeInstanceOf(
      EgressRefusedError,
    );
  });
});
