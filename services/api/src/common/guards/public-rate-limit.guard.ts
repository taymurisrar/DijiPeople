import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { resolveClientIp } from '../security/client-ip';

const windows = new Map<string, { count: number; resetsAt: number }>();

/** Every budget below is per (client IP, path) over this window. */
const WINDOW_MS = 10 * 60_000;

/**
 * The default budgets: a credential-submission allowance.
 *
 * Twenty writes in ten minutes is generous for a human typing a password and
 * deliberately mean for anything trying passwords in bulk. That is the right
 * shape for `login`, `forgot-password`, `activate-account`, `public/subscribe`
 * and `public/leads` — see BUG-0013, BUG-0031, BUG-0033 and BUG-0075, which are
 * the records that put this guard on those routes. Do not raise these.
 */
const DEFAULT_WRITE_LIMIT = 20;
const DEFAULT_READ_LIMIT = 120;

/**
 * Routes whose traffic is machine-driven, with the budget each one needs.
 *
 * `POST /auth/refresh` is not a credential submission. It is issued by every
 * open tab on a timer, by three client applications, and — because the key is
 * per IP — by everyone sharing an office NAT or a corporate proxy at once. Held
 * to the credential budget it returned `429` in production 52 times in a single
 * day, and a client that cannot refresh treats the session as dead and signs
 * the user out of a session that was perfectly valid (BUG-2458).
 *
 * 600 in ten minutes is one refresh per second sustained from a single address.
 * Far above any plausible fleet of real tabs, far below what an abuser would
 * need for the endpoint to be worth attacking — and the endpoint still requires
 * a valid refresh token, so the limit is a backstop rather than the control.
 */
const ROUTE_LIMITS: ReadonlyArray<{ suffix: string; limit: number }> = [
  { suffix: '/auth/refresh', limit: 600 },
];

@Injectable()
export class PublicRateLimitGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const now = Date.now();
    // Not `request.ip`: behind the Next route handlers that proxy every public
    // form, that is one address for the whole world. See client-ip.ts.
    const key = `${resolveClientIp(request)}:${request.path}`;
    const current = windows.get(key);
    const limit = resolveLimit(request.method, request.path);
    if (!current || current.resetsAt <= now) {
      windows.set(key, { count: 1, resetsAt: now + WINDOW_MS });
      this.cleanup(now);
      return true;
    }
    if (current.count >= limit) {
      throw new HttpException(
        {
          code: 'PUBLIC_RATE_LIMITED',
          message: 'Too many requests. Wait a few minutes and try again.',
        },
        429,
      );
    }
    current.count += 1;
    return true;
  }

  private cleanup(now: number) {
    if (windows.size < 5_000) return;
    for (const [key, value] of windows)
      if (value.resetsAt <= now) windows.delete(key);
  }
}

/**
 * The budget for one request.
 *
 * Matched on a path *suffix* because the guard sees the path after Nest has
 * stripped the global `/api` prefix on some mounts and not others; a suffix
 * match is true for both without the caller having to know which.
 */
function resolveLimit(method: string, path: string): number {
  const override = ROUTE_LIMITS.find((route) => path.endsWith(route.suffix));
  if (override) return override.limit;
  return method === 'GET' ? DEFAULT_READ_LIMIT : DEFAULT_WRITE_LIMIT;
}

/** Exported for the regression spec; not part of the guard's runtime API. */
export const __rateLimitInternals = {
  resolveLimit,
  DEFAULT_WRITE_LIMIT,
  DEFAULT_READ_LIMIT,
  WINDOW_MS,
};
