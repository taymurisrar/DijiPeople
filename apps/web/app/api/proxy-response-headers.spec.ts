import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/*
 * BUG-1649. Nine route handlers returned the upstream response's headers
 * verbatim onto a body `fetch` had already decompressed:
 *
 *   return new NextResponse(response.body, {
 *     status: response.status,
 *     headers: response.headers,     // <- Content-Encoding comes with it
 *   });
 *
 * The response then claimed `Content-Encoding: br` while carrying plain JSON,
 * and the browser failed with ERR_CONTENT_DECODING_FAILED. On the tenant
 * workspace that surfaced as a modal reading "Server unavailable" — which also
 * intercepted pointer events, so the first screen of a new workspace was inert
 * until it was dismissed, on every navigation.
 *
 * The correct helpers already existed. `proxyApiJsonResponse` rebuilds the
 * response through `NextResponse.json`, and `proxyApiFileResponse` copies an
 * explicit allowlist of headers and documents why `Content-Length` must not be
 * among them — the same reasoning, written down for the file path and not
 * applied to the JSON one.
 *
 * This is a structural test rather than a behavioural one on purpose. The
 * defect was not that any single route was wrong; it was that the same wrong
 * line existed nine times, so fixing the nine without stopping the tenth would
 * leave the actual fault in place.
 */

const API_ROOT = path.join(__dirname);

function routeFiles(dir: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);

    if (statSync(full).isDirectory()) {
      found.push(...routeFiles(full));
      continue;
    }

    if (entry === "route.ts" || entry === "route.tsx") found.push(full);
  }

  return found;
}

/*
 * Matches the shape regardless of formatting, and deliberately not the exact
 * source line: prettier moves it around, and a reformatted copy of the bug is
 * still the bug.
 */
const FORWARDS_UPSTREAM_HEADERS = /headers:\s*response\.headers/;

describe("API proxy routes do not forward upstream response headers", () => {
  const files = routeFiles(API_ROOT);

  it("finds route handlers to check", () => {
    // Guards the guard: a walker that silently finds nothing would pass for
    // the wrong reason, which is how a structural test rots.
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files.map((f) => [path.relative(API_ROOT, f), f] as const))(
    "%s rebuilds its response instead of copying upstream headers",
    (_label, file) => {
      const source = readFileSync(file, "utf8");

      /*
       * `fetch` decodes the body; the upstream headers describe the encoded
       * one. Use proxyApiJsonResponse for JSON and proxyApiFileResponse for a
       * download — both build a header set that matches the bytes actually
       * being sent.
       */
      expect(source).not.toMatch(FORWARDS_UPSTREAM_HEADERS);
    },
  );
});
