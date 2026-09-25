import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export type TraceContext = {
  traceId: string;
};

/**
 * BUG-3227. Carries the request's trace id across the async call tree so code
 * that has no `Request` object in hand — `AuditService.log()`, a service four
 * layers deep, a queue-drained job that started inside the same request — can
 * still tag what it writes with the trace id that opened the request.
 *
 * Deliberately a separate store from `RequestContextService`
 * (`request-context.service.ts`): that one carries `BuAccessRequestContext`,
 * a business-unit access-scoping shape resolved by
 * `BusinessUnitAccessMiddleware` well after routing starts. This one is set by
 * `RequestIdMiddleware`, the very first middleware in the chain, before
 * authentication has even run — broadening the existing store's type to fit
 * both concerns would make an unrelated access-scoping type carry an
 * observability field it has nothing to do with, and would tie this store's
 * lifetime to auth resolution succeeding, which a trace id must not depend on.
 */
@Injectable()
export class TraceContextService {
  private readonly storage = new AsyncLocalStorage<TraceContext | null>();

  runWithContext<T>(context: TraceContext | null, callback: () => T) {
    return this.storage.run(context, callback);
  }

  getContext() {
    return this.storage.getStore() ?? null;
  }
}
