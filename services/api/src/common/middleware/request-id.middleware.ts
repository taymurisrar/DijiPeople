import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { TraceContextService } from '../request-context/trace-context.service';

export const REQUEST_ID_HEADER = 'x-request-id';

export type RequestWithId = Request & {
  requestId?: string;
};

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  constructor(
    private readonly configService: ConfigService,
    private readonly traceContext: TraceContextService,
  ) {}

  use(req: RequestWithId, res: Response, next: NextFunction) {
    const traceHeader =
      this.configService
        .get<string>('ERROR_TRACE_HEADER')
        ?.trim()
        .toLowerCase() || 'x-trace-id';
    const incoming = req.header(traceHeader) ?? req.header(REQUEST_ID_HEADER);
    const requestId =
      incoming && incoming.trim().length > 0
        ? incoming.trim().slice(0, 128)
        : `req_${randomUUID()}`;

    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('X-Trace-Id', requestId);
    /*
     * BUG-3227. Everything downstream of `next()` — guards, interceptors, the
     * controller, and every service and job it calls synchronously or via an
     * awaited promise — runs inside this ALS scope, so `AuditService.log()`
     * can read the trace id back without a caller having to pass it through
     * ten layers of function signatures.
     */
    this.traceContext.runWithContext({ traceId: requestId }, () => next());
  }
}
