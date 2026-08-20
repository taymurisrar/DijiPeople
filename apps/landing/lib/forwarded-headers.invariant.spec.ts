import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
 * direct fetch to the API. Handlers that go through `server-api.ts` inherit the
 * forwarding from there and are not the failure mode.
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
    expect(directApiCallers.length).toBeGreaterThanOrEqual(9);
  });

  it.each(directApiCallers.map((handler) => [handler.path, handler.source]))(
    "%s forwards the client address",
    (_path, source) => {
      expect(source).toContain("forwardedClientHeaders(request)");
    },
  );
});
