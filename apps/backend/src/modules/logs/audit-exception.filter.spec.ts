import { NotFoundException, type ArgumentsHost } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

import { AuditExceptionFilter, loggablePath } from './audit-exception.filter';
import type { LogService } from './log.service';

const TOKEN = 'Abc_-0123456789abcdefghijklmnopqrstuvwxyzAB';

function hostFor(method: string, url: string): ArgumentsHost {
  return {
    switchToHttp: () => ({ getRequest: () => ({ method, url }) }),
  } as unknown as ArgumentsHost;
}

describe('AuditExceptionFilter — sandbox tokens stay out of the log (brief 158)', () => {
  let record: jest.Mock;
  let filter: AuditExceptionFilter;

  beforeEach(() => {
    record = jest.fn();
    filter = new AuditExceptionFilter({ record } as unknown as LogService);
    // Only what is logged is under test, not Nest's reply.
    jest
      .spyOn(BaseExceptionFilter.prototype, 'catch')
      .mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it.each([
    [
      `/api/marketplace/sandbox/${TOKEN}/app/dist/x.mjs?v=1`,
      '/api/marketplace/sandbox/<redacted>/app/dist/x.mjs',
    ],
    [
      `/api/marketplace/sandbox/${TOKEN}/runtime.js`,
      '/api/marketplace/sandbox/<redacted>/runtime.js',
    ],
    [
      `/api/marketplace/sandbox/${TOKEN}/`,
      '/api/marketplace/sandbox/<redacted>/',
    ],
    [
      `/api/marketplace/sandbox/${TOKEN}`,
      '/api/marketplace/sandbox/<redacted>',
    ],
    [
      `/api/Marketplace//SANDBOX/${TOKEN}/app/x`,
      '/api/Marketplace//SANDBOX/<redacted>/app/x',
    ],
    ['/api/marketplace?q=secret', '/api/marketplace'],
    [
      '/api/marketplace/apps/x-0123456789ab/sandbox',
      '/api/marketplace/apps/x-0123456789ab/sandbox',
    ],
  ])('logs %s as %s', (url, path) => {
    expect(loggablePath(url)).toBe(path);
    filter.catch(new Error('boom'), hostFor('GET', url));
    expect(record).toHaveBeenCalledTimes(1);
    const [level, event, msg, meta] = record.mock.calls[0] as [
      string,
      string,
      string,
      Record<string, unknown>,
    ];
    expect([level, event]).toEqual(['error', 'server.error']);
    expect(msg).toBe(`GET ${path} failed`);
    expect(meta.path).toBe(path);
    expect(JSON.stringify([msg, meta])).not.toContain(TOKEN);
    expect(JSON.stringify([msg, meta])).not.toContain('secret');
  });

  it('still logs nothing below 500', () => {
    filter.catch(
      new NotFoundException(),
      hostFor('GET', `/api/marketplace/sandbox/${TOKEN}/`),
    );
    expect(record).not.toHaveBeenCalled();
  });
});
