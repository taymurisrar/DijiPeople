#!/usr/bin/env node
/**
 * INVARIANT — a link or fetch aimed at an internal route uses a method that
 * route exports.
 *
 * ITEM-0012. BUG-0008 was an `<a href>` pointing at `/api/auth/logout`, which
 * exported only `POST`. A browser issues `GET` for a link, Next answered 405,
 * and every admin operator whose session expired was stranded on an error page
 * with no route back to the login screen.
 *
 * Nothing cross-referenced the two sides. Each was individually correct: the
 * route legitimately exported POST, and the link was legitimately a link. Only
 * the pair was wrong, and no tool looked at pairs.
 *
 * Scope is deliberately narrow, for the reason ITEM-0011 gives about checks
 * nobody trusts: only same-app `/api/...` targets are resolved, because those
 * are the ones whose handler file can be located with certainty from the path.
 * An external URL, a dynamic segment built at runtime, or a route in another app
 * is skipped rather than guessed at.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const APPS = ["landing", "web", "admin"];

function walk(dir, match) {
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
    if (statSync(full).isDirectory()) found.push(...walk(full, match));
    else if (match.test(entry)) found.push(full);
  }
  return found;
}

/** Which HTTP methods a route handler file exports. */
function exportedMethods(routeFile) {
  const source = readFileSync(routeFile, "utf8");
  const methods = new Set();
  for (const m of source.matchAll(
    /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g,
  )) {
    methods.add(m[1]);
  }
  return methods;
}

/** The route handler file serving an `/api/...` path in a given app, if any. */
function routeFileFor(app, apiPath) {
  const segments = apiPath.replace(/^\/+/, "").split("/").filter(Boolean);
  // A path segment we cannot resolve statically makes the whole lookup a guess.
  if (segments.some((s) => s.includes("${") || s.startsWith("["))) return null;

  const dir = join(ROOT, "apps", app, "app", ...segments);
  for (const name of ["route.ts", "route.tsx"]) {
    const candidate = join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const offenders = [];
let checkedPairs = 0;

for (const app of APPS) {
  const appDir = join(ROOT, "apps", app);
  for (const file of walk(appDir, /\.tsx?$/)) {
    const rel = relative(ROOT, file).split(sep).join("/");
    // A route handler linking to itself is not a caller.
    if (/\/route\.tsx?$/.test(rel)) continue;

    const lines = readFileSync(file, "utf8").split(/\r?\n/);

    lines.forEach((line, index) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;

      // <a href="/api/..."> or <Link href="/api/...">  → the browser sends GET.
      const link = /href=["'](\/api\/[^"'?#]+)/.exec(line);
      if (link) {
        const routeFile = routeFileFor(app, link[1]);
        if (!routeFile) return;
        checkedPairs += 1;
        const methods = exportedMethods(routeFile);
        if (methods.size > 0 && !methods.has("GET")) {
          offenders.push(
            `${rel}:${index + 1} links to ${link[1]}, which exports only ` +
              `${[...methods].join(", ")} — a link is always a GET`,
          );
        }
        return;
      }

      // fetch("/api/...", { method: "X" }) — method may be on a nearby line.
      const call = /fetch\(\s*["'](\/api\/[^"'?#]+)/.exec(line);
      if (!call) return;
      const routeFile = routeFileFor(app, call[1]);
      if (!routeFile) return;

      const window = lines.slice(index, index + 6).join("\n");
      const declared = /method:\s*["'](GET|POST|PUT|PATCH|DELETE)["']/.exec(
        window,
      );
      // No explicit method means GET, which is what fetch defaults to.
      const method = declared?.[1] ?? "GET";

      checkedPairs += 1;
      const methods = exportedMethods(routeFile);
      if (methods.size > 0 && !methods.has(method)) {
        offenders.push(
          `${rel}:${index + 1} calls ${call[1]} with ${method}, which exports ` +
            `only ${[...methods].join(", ")}`,
        );
      }
    });
  }
}

if (offenders.length > 0) {
  console.error(
    `check-route-method-callers: ${offenders.length} caller(s) target a route ` +
      `method that does not exist. See BUG-0008.\n`,
  );
  for (const offender of offenders) console.error(`  ${offender}`);
  process.exit(1);
}

console.log(
  `check-route-method-callers: ${checkedPairs} caller/route pair(s) agree on method.`,
);
