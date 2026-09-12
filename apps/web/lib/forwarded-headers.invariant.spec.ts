import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { forwardedClientHeaders } from "./forwarded-headers";

/**
 * Every route handler that calls the API directly must carry the visitor's
 * address across the proxy hop.
 *
 * **This test is the guarantee `lib/forwarded-headers.ts` has been claiming.**
 * That file's comment said "`forwarded-headers.invariant.test.ts` fails the
 * build if a handler forgets — the guarantee is mechanical rather than a
 * convention". No such file existed, in this app or the other two that carry
 * the identical comment. The convention happened to be intact when this was
 * written, which is the most dangerous shape a missing check can take: nothing
 * to find, and a reviewer who reads the comment and stops looking.
 *
 * What it protects, concretely: route handlers run on the server, so without a
 * forwarded address the API sees this app's egress IP for every visitor on
 * earth. `PublicRateLimitGuard` keys on that address. One handler that forgets
 * turns the public rate limit from a per-visitor budget into a switch any
 * single visitor can flip for everybody — which is BUG-0032, filed after it
 * happened, and the reason the comment was written in the first place.
 *
 * Scoped to handlers that name `getApiBaseUrl`, because that is what marks a
 * direct fetch to the API. Handlers that go through `server-api.ts` are *not*
 * covered, and not because they are safe: `server-api.ts` does not forward the
 * address either. It is out of this check's scope because the endpoints it
 * reaches are authenticated and `PublicRateLimitGuard` does not run on them, so
 * the gap there is attribution rather than a bypass. Recorded separately —
 * widening this check to cover it without first deciding what should carry the
 * address would just fail the build with nothing to do about it.
 */

const API_ROUTES_DIR = join(__dirname, "..", "app", "api");

function routeHandlers(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...routeHandlers(path));
    } else if (entry.name === "route.ts" || entry.name === "route.tsx") {
      found.push(path);
    }
  }
  return found;
}

describe("client address forwarding across the proxy hop", () => {
  const handlers = routeHandlers(API_ROUTES_DIR).map((path) => ({
    path,
    source: readFileSync(path, "utf8"),
  }));

  const directApiCallers = handlers.filter(
    (handler) =>
      handler.source.includes("getApiBaseUrl") &&
      handler.source.includes("fetch("),
  );

  /*
   * A guard that finds nothing to guard is not passing, it is inert — the exact
   * failure this repository has hit before, where a check asserted a file
   * merely *mentioned* something and kept passing after the behaviour was
   * deleted. If the scan stops finding handlers, the scan is broken.
   */
  it("finds the handlers it is supposed to be checking", () => {
    expect(directApiCallers.length).toBeGreaterThanOrEqual(10);
  });

  it.each(directApiCallers.map((handler) => [handler.path, handler.source]))(
    "%s forwards the client address",
    (_path, source) => {
      expect(source).toContain("forwardedClientHeaders(request)");
    },
  );
});

/*
 * BUG-3360 — a browser sign-in used to produce a `RefreshToken` row whose
 * `userAgent` was always `"node"`, because this app's server-side fetch never
 * carried the visitor's own `User-Agent` across the proxy hop. Every route
 * handler above forwards through `forwardedClientHeaders`, so this is what
 * actually pins the fix: the header this wrapper produces now carries the
 * visitor's `User-Agent`, not only the address.
 */
describe("forwardedClientHeaders carries the visitor's User-Agent too", () => {
  /*
   * `user-agent` is a forbidden header per the Fetch spec, so Node's real
   * `Request`/`Headers` constructors silently drop it when it is supplied as
   * an *incoming* header this way — proven the hard way when this test first
   * asserted against a real `new Request(...)` and the header vanished. A
   * `Request`-shaped stub is what `forwardedClientHeaders` actually needs: it
   * only ever calls `.headers.get(name)`.
   */
  function incomingRequest(headers: Record<string, string>): Request {
    return {
      headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    } as unknown as Request;
  }

  it("forwards a real browser User-Agent alongside the forwarded address", () => {
    const request = incomingRequest({
      "x-forwarded-for": "203.0.113.7",
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    });

    expect(forwardedClientHeaders(request)).toMatchObject({
      "x-forwarded-for": "203.0.113.7",
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    });
  });

  it("forwards nothing for a header that was never sent", () => {
    const request = incomingRequest({});

    expect(forwardedClientHeaders(request)).toEqual({});
  });
});
