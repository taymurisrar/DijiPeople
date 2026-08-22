#!/usr/bin/env node
/**
 * INVARIANT — a route handler under `app/api/**` forwards, and decides nothing.
 *
 * BUG-0041. `apps/web/AGENTS.md` says a route handler "forwards the request,
 * forwards the response, and decides nothing. No business logic. **No
 * authorization decisions.**" Both halves were violated, repeatedly, and each
 * violation was individually reasonable — a lookup that returned noise, a
 * payload the API wanted differently shaped — which is exactly why nothing
 * accumulated the cost.
 *
 * Two shapes are detected, and they are deliberately narrow:
 *
 * 1. **A permission or role read.** `api/teams/route.ts` read `permissionKeys`
 *    off the session, decided the caller could not read teams, and returned a
 *    fabricated `200 { items: [] }` without calling the API at all. It was
 *    fail-closed, so nothing leaked — but it was a second source of truth on
 *    `teams.read` that the authority could never correct, audit, or even see.
 *
 * 2. **A monetary derivation.** `api/payroll/compensations/route.ts` derived
 *    `basicSalary` as "the first component with a non-empty amount", a payroll
 *    rule no domain service ever agreed to, living in a layer with no tests, no
 *    audit trail and no server-side validation, over a number that decides what
 *    an employee is paid.
 *
 * Reading the session to *forward* it is fine and is what these handlers are
 * for; reading it to *branch* is not. So the rule is not "never import auth" —
 * it is "no permission/role/elevation value is read here".
 *
 * Sibling checks: `check-proxies-forward-refusals.mjs` (BUG-0039) and
 * `check-proxy-forwards-client-ip.mjs` (BUG-0032).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const APPS = ["landing", "web", "admin"];

/**
 * Reading an authorization fact. Importing the module is not enough on its own
 * — a handler may legitimately import `getSessionUser` to read `tenantId` for a
 * path segment — so these match the *values that only exist to gate*.
 */
const AUTHORIZATION_READS = [
  { pattern: /\bpermissionKeys\b/, what: "reads permissionKeys" },
  { pattern: /\broleKeys\b/, what: "reads roleKeys" },
  { pattern: /\brolePrivileges\b/, what: "reads rolePrivileges" },
  { pattern: /\bhasElevatedTenantRole\b/, what: "checks elevated role" },
  { pattern: /\bhasPermission\b/, what: "evaluates a permission" },
  { pattern: /from\s+["']@\/lib\/permissions["']/, what: "imports lib/permissions" },
  { pattern: /from\s+["']@\/lib\/security-keys["']/, what: "imports lib/security-keys" },
  { pattern: /from\s+["']@\/lib\/elevated-roles["']/, what: "imports lib/elevated-roles" },
];

/**
 * Deriving money. Named fields rather than arithmetic in general: a handler
 * that builds a query string containing `amount` is not computing pay, and a
 * regex for `*` would find nothing but noise.
 */
const MONETARY_DERIVATIONS = [
  { pattern: /\bbasicSalary\s*=/, what: "assigns basicSalary" },
  { pattern: /\bgrossEarnings\s*=/, what: "assigns grossEarnings" },
  { pattern: /\bnetPay\s*=/, what: "assigns netPay" },
  { pattern: /\btotalDeductions\s*=/, what: "assigns totalDeductions" },
];

/**
 * Handlers permitted to do one of the above, each with the reason it is not the
 * defect this check describes. A stale entry fails the check, so the list
 * cannot quietly outlive its justification.
 */
const ALLOWLIST = new Map();

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
    else if (/^route\.tsx?$/.test(entry)) found.push(full);
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
      // A comment explaining why the decision was removed is not the decision.
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join("\n");

    const hits = [];
    for (const { pattern, what } of AUTHORIZATION_READS) {
      if (pattern.test(source)) hits.push(what);
    }
    for (const { pattern, what } of MONETARY_DERIVATIONS) {
      if (pattern.test(source)) hits.push(what);
    }

    if (hits.length === 0) continue;
    seen.add(rel);
    if (ALLOWLIST.has(rel)) continue;
    offenders.push(`${rel} — ${hits.join(", ")}`);
  }
}

if (scanned < 15) {
  console.error(
    `check-proxies-decide-nothing: only ${scanned} route handlers scanned — the walk is wrong.`,
  );
  process.exit(1);
}

for (const entry of ALLOWLIST.keys()) {
  if (!seen.has(entry)) {
    console.error(`check-proxies-decide-nothing: stale allowlist entry: ${entry}`);
    process.exit(1);
  }
}

if (offenders.length > 0) {
  console.error(
    `check-proxies-decide-nothing: ${offenders.length} route handler(s) read an\n` +
      "authorization fact or derive a monetary value. A handler under app/api/**\n" +
      "forwards the request, forwards the response, and decides nothing — the API\n" +
      "is the authority, and a second one it cannot see, correct or audit is a\n" +
      "governance defect even when it is fail-closed. See BUG-0041.\n",
  );
  for (const offender of offenders) console.error(`  ${offender}`);
  process.exit(1);
}

console.log(
  `check-proxies-decide-nothing: ${scanned} route handler(s) decide nothing.`,
);
