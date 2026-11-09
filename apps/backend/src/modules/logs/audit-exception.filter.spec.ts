import { NotFoundException, type ArgumentsHost } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

import { AuditExceptionFilter, loggablePath } from './audit-exception.filter';
import type { LogService } from './log.service';

function hostFor(method: string, url: string): ArgumentsHost {
  return {
    switchToHttp: () => ({ getRequest: () => ({ method, url }) }),
  } as unknown as ArgumentsHost;
}

describe('AuditExceptionFilter — what reaches the log', () => {
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
    ['/api/marketplace?q=secret', '/api/marketplace'],
    ['/api/files/read?path=/home/secret&x=1', '/api/files/read'],
    [
      '/api/marketplace/apps/x-0123456789ab/install',
      '/api/marketplace/apps/x-0123456789ab/install',
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
    expect(JSON.stringify([msg, meta])).not.toContain('secret');
  });

  it('still logs nothing below 500', () => {
    filter.catch(
      new NotFoundException(),
      hostFor('GET', '/api/marketplace/apps/x-0123456789ab/b/b1/x.mjs'),
    );
    expect(record).not.toHaveBeenCalled();
  });
});
