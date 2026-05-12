import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

export const REQUEST_ID_HEADER = 'x-request-id';

export type RequestWithId = Request & {
  requestId?: string;
};

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  constructor(private readonly configService: ConfigService) {}

  use(req: RequestWithId, res: Response, next: NextFunction) {
    const traceHeader =
      this.configService.get<string>('ERROR_TRACE_HEADER')?.trim().toLowerCase() ||
      'x-trace-id';
    const incoming = req.header(traceHeader) ?? req.header(REQUEST_ID_HEADER);
    const requestId =
      incoming && incoming.trim().length > 0
        ? incoming.trim().slice(0, 128)
        : `req_${randomUUID()}`;

    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('X-Trace-Id', requestId);
    next();
  }
}
