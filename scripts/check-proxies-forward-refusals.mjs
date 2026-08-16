#!/usr/bin/env node
/**
 * INVARIANT — a route proxy forwards a refusal; it never answers around one.
 *
 * BUG-0039. Two `apps/web` proxies re-requested `/me/*` when the API answered
 * `403` and returned that as `200`. A refusal became a success containing a
 * **different employee's** payslips and bank accounts, under a URL naming the
 * employee that had been asked for. The caller could not distinguish it from a
 * genuine answer and nothing logged the substitution.
 *
 * `apps/web/AGENTS.md` already stated the rule — "No authorization decisions…
 * A proxy that filters or permits is a second source of truth and a security
 * hole" — and the rule was broken twice in the same shape. A stated rule that
 * nothing enforces is how BUG-0013, BUG-0031 and BUG-0033 also happened.
 *
 * What is detected is narrow and unambiguous: a proxy that *branches on an
 * auth-failure status and issues another upstream request*. Forwarding a 401 to
 * a refresh-and-retry of **the same** request is legitimate and is what
 * `server-api.ts` does centrally; substituting a **different** endpoint is not.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const APPS = ["landing", "web", "admin"];

/** `if (response.status === 403)` / `=== 401` / `.includes(403)` etc. */
const AUTH_STATUS_BRANCH = /\b(40[13])\b/;
/** A second upstream call — the substitution itself. */
const UPSTREAM_CALL = /\b(apiRequest|fetch)\s*\(/;

/**
 * Handlers that branch on an auth status legitimately, each with the reason.
 *
 * The distinction that matters: refreshing a token and retrying **the same**
 * request is correct and is what the central client does. Substituting a
 * **different** endpoint is the defect.
 */
const ALLOWLIST = new Map([
  [
    "apps/web/app/api/partner/portal/[[...path]]/route.ts",
    "Refreshes the partner token on 401 and retries the SAME upstream call via callApi(); it substitutes no other endpoint and makes no authorization decision.",
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

    const lines = readFileSync(file, "utf8")
      .split(/\r?\n/)
      // A comment explaining the removed fallback is not the fallback.
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line));

    let hit = null;
    lines.forEach((line, index) => {
      if (hit) return;
      if (!AUTH_STATUS_BRANCH.test(line)) return;
      // The substitution is an upstream call inside the branch it opens.
      const block = lines.slice(index, index + 5).join("\n");
      if (UPSTREAM_CALL.test(block)) hit = line.trim().slice(0, 90);
    });

    if (!hit) continue;
    seen.add(rel);
    if (ALLOWLIST.has(rel)) continue;
    offenders.push(`${rel} — ${hit}`);
  }
}

if (scanned < 15) {
  console.error(
    `check-proxies-forward-refusals: only ${scanned} route handlers scanned — the walk is wrong.`,
  );
  process.exit(1);
}

for (const entry of ALLOWLIST.keys()) {
  if (!seen.has(entry)) {
    console.error(
      `check-proxies-forward-refusals: stale allowlist entry: ${entry}`,
    );
    process.exit(1);
  }
}

if (offenders.length > 0) {
  console.error(
    `check-proxies-forward-refusals: ${offenders.length} proxy handler(s) branch on\n` +
      "a 401/403 and issue another upstream request. A proxy forwards a refusal;\n" +
      "answering around one returns somebody else's data under the caller's URL.\n" +
      "See BUG-0039.\n",
  );
  for (const offender of offenders) console.error(`  ${offender}`);
  process.exit(1);
}

console.log(
  `check-proxies-forward-refusals: ${scanned} route handler(s) forward refusals.`,
);
