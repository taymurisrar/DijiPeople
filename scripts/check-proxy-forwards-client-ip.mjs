#!/usr/bin/env node
/**
 * INVARIANT — every Next route handler that proxies to the API carries the
 * visitor's address forward.
 *
 * A route handler under `app/api/` runs on the server. Its `fetch()` to the API
 * originates from the app's egress address, so unless it forwards the visitor's
 * address the API sees one client for the entire world. Everything the API keys
 * on client identity then silently degrades — the public rate limit above all,
 * which stops distinguishing an attacker from a customer and becomes a switch
 * any single visitor can flip for everybody (BUG-0032).
 *
 * This is checked mechanically rather than left as a convention because the
 * convention has already failed three times (BUG-0013, BUG-0031, BUG-0033) and
 * the failure is invisible in review: the handler looks complete, the feature
 * works, and only the security property is gone.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const APPS = ["landing", "web", "admin"];
const HELPER = "forwardedClientHeaders";

/**
 * Handlers exempt from forwarding, each with the reason.
 *
 * An allowlist rather than a silent skip, so an exemption is a visible act.
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
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...walk(full));
    else if (entry === "route.ts" || entry === "route.tsx") found.push(full);
  }
  return found;
}

const offenders = [];
let checked = 0;

for (const app of APPS) {
  const apiDir = join(ROOT, "apps", app, "app", "api");
  for (const file of walk(apiDir)) {
    const source = readFileSync(file, "utf8");

    // Only handlers that actually call out to the API are in scope.
    const fetches = source.match(/\bfetch\s*\(/g)?.length ?? 0;
    if (fetches === 0) continue;

    const relativePath = relative(ROOT, file).split(sep).join("/");
    checked += 1;

    if (ALLOWLIST.has(relativePath)) continue;

    // Counted, not merely present. Testing for the identifier would be
    // satisfied by the import line alone, so deleting the spread from the one
    // place it matters would leave the check green — which is how this class of
    // defect survives review in the first place.
    const forwards =
      source.match(/\.\.\.forwardedClientHeaders\s*\(/g)?.length ?? 0;
    if (forwards >= fetches) continue;

    offenders.push(`${relativePath} (${forwards}/${fetches} fetches covered)`);
  }
}

if (checked === 0) {
  console.error(
    "check-proxy-forwards-client-ip: found no proxy route handlers to check.\n" +
      "The walk is probably looking in the wrong place — a check that examines\n" +
      "nothing passes for the wrong reason.",
  );
  process.exit(1);
}

for (const allowlisted of ALLOWLIST.keys()) {
  const stillExists = walk(join(ROOT, "apps"))
    .map((file) => relative(ROOT, file).split(sep).join("/"))
    .includes(allowlisted);
  if (!stillExists) {
    console.error(
      `check-proxy-forwards-client-ip: allowlist names a handler that no longer exists: ${allowlisted}`,
    );
    process.exit(1);
  }
}

if (offenders.length > 0) {
  console.error(
    `check-proxy-forwards-client-ip: ${offenders.length} route handler(s) proxy to the API\n` +
      `without forwarding the visitor's address. Each collapses every visitor into\n` +
      `one rate limit bucket (BUG-0032).\n`,
  );
  for (const offender of offenders) console.error(`  ${offender}`);
  console.error(
    `\nFix: spread \`...${HELPER}(request)\` into the outbound fetch headers.\n` +
      `The helper lives at apps/<app>/lib/forwarded-headers.ts.`,
  );
  process.exit(1);
}

console.log(
  `check-proxy-forwards-client-ip: ${checked} proxy route handler(s) forward the visitor's address.`,
);
