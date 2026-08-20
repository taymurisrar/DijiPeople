import { buildForwardedClientHeaders } from "@repo/config";

/**
 * Headers that carry the visitor's address across this app's proxy hop.
 *
 * Route handlers under `app/api/` run on the server, so the API sees this app's
 * egress address rather than the visitor's. Public endpoints are rate limited
 * per client IP, so without this every visitor shares one bucket and the limit
 * becomes a switch that any one of them can flip for everybody (BUG-0032).
 *
 * Spread this into the outbound `fetch()` headers of every route handler that
 * proxies to the API. `forwarded-headers.invariant.spec.ts` beside this file
 * fails the build if a handler forgets — the guarantee is mechanical rather
 * than a convention, because this same convention has already been broken
 * three times.
 *
 * That sentence used to name `forwarded-headers.invariant.test.ts`, which did
 * not exist in any of the three apps. The convention happened to be intact, so
 * nothing was broken — but the claim was doing the work of a check while a
 * reviewer read it and stopped looking.
 */
export function forwardedClientHeaders(
  request: Request,
): Record<string, string> {
  return buildForwardedClientHeaders(request.headers);
}
