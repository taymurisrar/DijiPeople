#!/usr/bin/env node
/**
 * INVARIANT — a route handler forwards the API's status, it does not flatten it.
 *
 * ITEM-0035. `apps/web/AGENTS.md` requires handlers to "forward the API's error
 * contract through rather than flattening it", and 134 `catch` blocks across
 * 123 handlers did the opposite: `{ status: 500 }`, hardcoded, carrying the
 * message string and nothing else. Every upstream refusal — 400, 403, 404, 409,
 * 422, 429, 503 — reached the browser as a generic server error.
 *
 * Three things went missing at each site:
 *
 *   - the **status**, so a 403 rendered "something went wrong" instead of the
 *     access-denied state the app already has, and a 422 looked like an outage;
 *   - **`fieldErrors`**, so a validation failure could not highlight the field
 *     it was about;
 *   - **`traceId`**, so a user-reported error could not be matched to the API's
 *     error log — the only mechanism the platform has for that.
 *
 * Nothing was missing from the capability: `ApiRequestError`,
 * `isApiRequestError` and `proxyApiJsonResponse` were all already there. It was
 * adoption, and prose does not achieve adoption across 123 files.
 *
 * What is detected is narrow, and the narrowing is the point. The defect only
 * exists where an API *refusal* can arrive as a thrown error — which is to say
 * in handlers that call `apiRequest`/`apiRequestJson`, the client that throws
 * `ApiRequestError` on a non-2xx. `apps/landing`'s handlers use raw `fetch` and
 * forward `response.status` directly; their `catch` fires only when the fetch
 * itself fails, which is genuinely this proxy's own failure and not a refusal
 * being swallowed. Flagging those would be noise, and a check that cries wolf
 * gets switched off.
 *
 * So: a literal `status: 500` in a handler that uses the throwing client and
 * does not forward. The one remaining legitimate literal lives in
 * `proxyErrorResponse`, where the error is genuinely not an `ApiRequestError`.
 *
 * Sibling checks: `check-proxies-decide-nothing.mjs` (BUG-0041),
 * `check-proxies-forward-refusals.mjs` (BUG-0039).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const APPS = ["landing", "web", "admin"];

const HARDCODED_500 = /status:\s*500\b/;
const FORWARDS = /\bisApiRequestError\b|\bproxyErrorResponse\b|\berror\.status\b/;
/** The client that turns an API refusal into a thrown `ApiRequestError`. */
const THROWING_CLIENT = /\bapiRequest(?:Json)?\b/;

/**
 * Files allowed a literal 500, each with the reason. A stale entry fails the
 * check, so an exemption cannot outlive its justification.
 */
const ALLOWLIST = new Map([
  [
    "apps/web/app/api/_lib/proxy-error.ts",
    "The forwarding helper itself. Its 500 is the genuine case: the error is not an ApiRequestError, so this handler broke rather than the API refusing.",
  ],
]);

function walk(dir) {
  const found = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) found.push(full);
  }
  return found;
}

const offenders = [];
const seen = new Set();
let scanned = 0;

for (const app of APPS) {
  for (const file of walk(join(ROOT, "apps", app, "app", "api"))) {
    scanned += 1;
    const rel = relative(ROOT, file).split(sep).join("/");

    const source = readFileSync(file, "utf8")
      .split(/\r?\n/)
      // A comment describing the flattening that was removed is not flattening.
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join("\n");

    if (!HARDCODED_500.test(source)) continue;

    seen.add(rel);
    if (ALLOWLIST.has(rel)) continue;
    if (FORWARDS.test(source)) continue;
    // No throwing client: a refusal never reaches this catch, so the 500 is
    // about reaching the API at all.
    if (!THROWING_CLIENT.test(source)) continue;

    offenders.push(rel);
  }
}

if (scanned < 100) {
  console.error(
    `check-proxies-forward-status: only ${scanned} handler files scanned — the walk is wrong.`,
  );
  process.exit(1);
}

for (const entry of ALLOWLIST.keys()) {
  if (!seen.has(entry)) {
    console.error(`check-proxies-forward-status: stale allowlist entry: ${entry}`);
    process.exit(1);
  }
}

if (offenders.length > 0) {
  console.error(
    `check-proxies-forward-status: ${offenders.length} handler(s) hardcode a 500\n` +
      "without forwarding the upstream status. A refusal from the API is not a\n" +
      "server error: flattening it loses the status, fieldErrors and traceId, so\n" +
      "a validation failure looks like an outage and a user-reported error cannot\n" +
      "be found in the log. Use proxyErrorResponse from app/api/_lib/proxy-error.\n" +
      "See ITEM-0035.\n",
  );
  for (const offender of offenders) console.error(`  ${offender}`);
  process.exit(1);
}

console.log(
  `check-proxies-forward-status: ${scanned} handler file(s) forward the upstream status.`,
);
