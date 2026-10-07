import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Request } from 'express';
import { LogService } from './log.service';

/**
 * Record backend errors, then let Nest respond exactly as it always did
 * (brief 84).
 *
 * Two things this is careful about:
 *
 * - **Only 5xx.** A 404 or a 400 is the system working — refusing bad input is
 *   what the DTOs are for — and logging them would bury real incidents under
 *   routine noise within minutes. A 5xx is the machine failing at something it
 *   agreed to do, which is the definition of an incident.
 * - **It changes no response.** It extends `BaseExceptionFilter` and delegates,
 *   so the status codes, bodies and existing filters are untouched. An audit
 *   trail that alters behaviour is a liability, not a record.
 *
 * The 401s that matter are logged at the auth call sites instead, where the
 * outcome is known — here they are indistinguishable from an expired tab.
 */
@Catch()
export class AuditExceptionFilter extends BaseExceptionFilter {
  constructor(private readonly logs: LogService) {
    super();
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= 500) {
      const req = host.switchToHttp().getRequest<Request>();
      // The path only: a query string can carry a search term, and the log is
      // not the place to accumulate what the user has been looking for.
      const path = loggablePath(req.url);
      this.logs.record(
        'error',
        'server.error',
        `${req.method} ${path} failed`,
        {
          status,
          method: req.method,
          path,
          error: exception instanceof Error ? exception : String(exception),
        },
      );
    }
    super.catch(exception, host);
  }
}

/**
 * A sandboxed app's window token (brief 158) is a capability: its URL
 * `marketplace/sandbox/<token>/…` serves the app's files with no session at
 * all, so it is never written to the log. Matched without regard to case,
 * as the router matches, and across doubled slashes, to be safe.
 */
const SANDBOX_TOKEN = /(\/marketplace\/+sandbox\/+)[^/?#]*/gi;

/** A request URL as the log may keep it: no query string, no sandbox token. */
export function loggablePath(url: string): string {
  return url.split('?')[0].replace(SANDBOX_TOKEN, '$1<redacted>');
}
