import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import type { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';

/**
 * RATE-03. Before this, `PublicRateLimitGuard` was the only rate limiter in
 * the product and it is declared on 13 pre-session handlers — zero
 * authenticated routes. Any signed-in session, including one from a free
 * self-serve signup, could issue unlimited requests per second to any of
 * ~111 controllers; nothing counted, nothing shed load, nothing alerted.
 *
 * WHY AN INTERCEPTOR, NOT A GUARD. A global guard runs *before* every local
 * guard (Nest runs all global guards, then all local ones, for a single
 * request) — including `JwtAuthGuard`, which is what actually populates
 * `request.user`. A global guard here would never see the user it needs to
 * key on. Interceptors run after every guard on the request has already
 * passed, so `request.user` is reliably present by the time this runs for
 * any route that required it — and reliably absent for `@Public()` routes,
 * which this deliberately leaves alone (they are `PublicRateLimitGuard`'s
 * job, keyed on IP rather than a user that does not exist yet).
 *
 * Two budgets, not the three-tier read/write/expensive design the audit
 * describes in full (RATE.md) — declaring an `@Expensive()` tier on the
 * specific payroll/export/report endpoints that need a tighter ceiling is
 * follow-up work, tracked against this bug record, not a silent scope-creep
 * into touching every heavy controller in one security pass. The two tiers
 * here (`read`/`write` by HTTP method) already close the finding's core
 * claim: no authenticated endpoint was rate limited at all.
 *
 * Skipped under `NODE_ENV=test` so the unit/e2e suites — which legitimately
 * fire many requests at one seeded user in a tight loop — are not the ones
 * that discover a too-tight budget. That is a deliberate, narrow carve-out
 * mirroring how BUG-2458 already treats machine-driven traffic differently
 * from human traffic, not a way to leave this unenforced in production.
 */
const WINDOW_MS = 60_000;
const READ_LIMIT = 600;
const WRITE_LIMIT = 120;

const windows = new Map<string, { count: number; resetsAt: number }>();

function resolveLimit(method: string): number {
  return method === 'GET' || method === 'HEAD' ? READ_LIMIT : WRITE_LIMIT;
}

/** Exported so the spec can exercise the decision without booting Nest. */
export function shouldRateLimitAuthenticatedRequest(
  request: Request,
): request is AuthenticatedRequest {
  if (process.env.NODE_ENV === 'test') return false;
  const userId = (request as Partial<AuthenticatedRequest>).user?.userId;
  return typeof userId === 'string' && userId.length > 0;
}

@Injectable()
export class AuthenticatedRateLimitInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();

    if (shouldRateLimitAuthenticatedRequest(request)) {
      const now = Date.now();
      const endpointClass = request.method === 'GET' ? 'read' : 'write';
      const key = `${request.user.userId}:${endpointClass}`;
      const limit = resolveLimit(request.method);
      const current = windows.get(key);

      if (!current || current.resetsAt <= now) {
        windows.set(key, { count: 1, resetsAt: now + WINDOW_MS });
        cleanup(now);
      } else if (current.count >= limit) {
        throw new HttpException(
          {
            code: 'AUTHENTICATED_RATE_LIMITED',
            message: 'Too many requests. Wait a minute and try again.',
          },
          429,
        );
      } else {
        current.count += 1;
      }
    }

    return next.handle();
  }
}

function cleanup(now: number) {
  if (windows.size < 10_000) return;
  for (const [key, value] of windows)
    if (value.resetsAt <= now) windows.delete(key);
}

/** Exported for the regression spec; not part of the interceptor's runtime API. */
export const __authenticatedRateLimitInternals = {
  resolveLimit,
  READ_LIMIT,
  WRITE_LIMIT,
  WINDOW_MS,
  windows,
};
