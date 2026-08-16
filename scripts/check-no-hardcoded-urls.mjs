#!/usr/bin/env node
/**
 * Refuse to ship a loopback URL baked into application source.
 *
 * The public "Login" button pointed at http://localhost:3001/dashboard in
 * production because apps/landing/app/_components/site-shell.tsx resolved the
 * workspace URL itself and fell back to a loopback literal. Nothing required
 * the variable, so the build succeeded and Next inlined the fallback into the
 * shipped HTML. Six other call sites carried the same pattern.
 *
 * validateDeploymentEnv now fails a production build when a canonical app URL
 * is missing or loopback — but that only helps for URLs that go through it.
 * This check closes the other half: a literal that never consults an env var
 * at all, and a re-derived origin with its own `|| "http://localhost:…"`
 * fallback, are both invisible to environment validation.
 *
 * Scope is deliberately narrow — shipped application source only. Tests,
 * examples, docs, scripts and local tooling legitimately name loopback hosts.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

// Directories whose contents are compiled into something a customer loads.
const SCANNED_ROOTS = [
  "apps/landing",
  "apps/web",
  "apps/admin",
  "services/api/src",
  "packages/config",
];

const SCANNED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);

const SKIPPED_DIRECTORIES = new Set([
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "build",
  "coverage",
  "generated",
]);

// Files that may legitimately contain a loopback literal, each with the reason.
const ALLOWLIST = new Map([
  [
    "packages/config/index.js",
    "Defines the development defaults and the loopback detection itself.",
  ],
  [
    "packages/config/platform-domains.js",
    "Parses hostnames, including loopback, to resolve the local environment.",
  ],
  [
    "apps/web/lib/tenant-resolution.ts",
    "Classifies an incoming request host; must be able to name loopback to detect it.",
  ],
  [
    "apps/web/lib/workspace-routing.ts",
    "Same: recognises a loopback request host when routing workspaces.",
  ],
  [
    "apps/admin/lib/tenant-url.ts",
    "Detects a loopback workspace host to switch to query-param tenant addressing.",
  ],
  [
    "services/api/src/common/config/public-site-url.config.ts",
    "Rejects loopback origins in production; must name them to reject them.",
  ],
  [
    "services/api/src/common/config/tenant-url.config.ts",
    "Detects a loopback workspace host to switch to query-param tenant addressing.",
  ],
]);

const LOOPBACK_LITERAL =
  /["'`]https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?[^"'`]*["'`]/;

function isTestFile(path) {
  return (
    path.includes(".spec.") ||
    path.includes(".test.") ||
    path.includes(`${sep}test${sep}`) ||
    path.includes(`${sep}__tests__${sep}`) ||
    path.includes(`${sep}e2e${sep}`)
  );
}

function* walk(directory) {
  let entries;
  try {
    entries = readdirSync(directory);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (SKIPPED_DIRECTORIES.has(entry)) continue;
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      yield* walk(fullPath);
      continue;
    }

    const extension = entry.slice(entry.lastIndexOf("."));
    if (SCANNED_EXTENSIONS.has(extension)) yield fullPath;
  }
}

const violations = [];

for (const root of SCANNED_ROOTS) {
  for (const filePath of walk(join(repoRoot, root))) {
    const relativePath = relative(repoRoot, filePath).split(sep).join("/");

    if (ALLOWLIST.has(relativePath)) continue;
    if (isTestFile(filePath)) continue;

    const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      // Comments describing the defect are not the defect. Line comments and
      // block-comment bodies are skipped; a literal on a code line is not.
      const trimmed = line.trim();
      if (
        trimmed.startsWith("//") ||
        trimmed.startsWith("*") ||
        trimmed.startsWith("/*")
      ) {
        return;
      }

      if (LOOPBACK_LITERAL.test(line)) {
        violations.push({
          file: relativePath,
          line: index + 1,
          text: line.trim().slice(0, 140),
        });
      }
    });
  }
}

if (violations.length > 0) {
  console.error(
    "Loopback URL literals found in shipped application source.\n" +
      "Resolve cross-app URLs through @repo/config (resolveAppUrls / getAppOrigin /\n" +
      "buildAppUrl) so a missing production variable fails the build instead of\n" +
      "shipping a dead link. If a literal is genuinely required, add it to the\n" +
      "allowlist in scripts/check-no-hardcoded-urls.mjs with a reason.\n",
  );
  for (const violation of violations) {
    console.error(`  ${violation.file}:${violation.line}  ${violation.text}`);
  }
  console.error(`\n${violations.length} violation(s).`);
  process.exit(1);
}

console.log(
  `No loopback URL literals in shipped source (${SCANNED_ROOTS.length} roots scanned, ` +
    `${ALLOWLIST.size} allowlisted files).`,
);
