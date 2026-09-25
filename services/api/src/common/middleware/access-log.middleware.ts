import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Response } from 'express';
import type { AuthenticatedUser } from '../interfaces/authenticated-request.interface';
import type { RequestWithId } from './request-id.middleware';

type RequestForAccessLog = RequestWithId & { user?: AuthenticatedUser };

/**
 * BUG-3227. The only log line in the whole request lifecycle used to be the
 * one the exception filter writes on failure — a request that succeeds, or
 * one that is merely slow, left nothing to find by trace id. This writes
 * exactly one structured line per request, on `finish`, whatever the outcome.
 *
 * Registered after `RequestIdMiddleware` and `BusinessUnitAccessMiddleware` in
 * `app.module.ts` so `req.requestId` already exists; `req.user` is set later
 * still, by `JwtAuthGuard` inside the Nest pipeline, but a guard always runs
 * before the response it gates is sent — so by the time `finish` fires for an
 * authenticated route, `req.user` is already populated. A public route simply
 * logs `tenantId`/`userId` as null, which is the true answer, not a fabricated
 * one.
 *
 * Deliberately excludes the request body, headers and query string: those are
 * exactly where a token or password ends up, and this line has no sanitizer in
 * front of it the way `ErrorLog` does. Only route shape, outcome and identity.
 *
 * Gated on `REQUEST_LOGGING_ENABLED` (declared in every committed `.env*`
 * example already; this is what makes it do something) rather than always on,
 * because a request that never errors is by far the common case and an
 * operator who has not opted in should not get a line per request added to
 * their log volume unannounced.
 */
@Injectable()
export class AccessLogMiddleware implements NestMiddleware {
  private readonly logger = new Logger('AccessLog');

  constructor(private readonly configService: ConfigService) {}

  use(req: RequestForAccessLog, res: Response, next: NextFunction) {
    if (!this.isEnabled()) {
      next();
      return;
    }

    const startedAtNs = process.hrtime.bigint();

    res.on('finish', () => {
      const durationMs =
        Number(process.hrtime.bigint() - startedAtNs) / 1_000_000;
      const route =
        (req.route as { path?: string } | undefined)?.path ?? req.path;

      this.logger.log(
        JSON.stringify({
          method: req.method,
          route,
          statusCode: res.statusCode,
          durationMs: Math.round(durationMs),
          traceId: req.requestId ?? null,
          tenantId: req.user?.tenantId ?? null,
          userId: req.user?.userId ?? null,
        }),
      );
    });

    next();
  }

  private isEnabled() {
    return (
      this.configService.get<string>('REQUEST_LOGGING_ENABLED') === 'true'
    );
  }
}
