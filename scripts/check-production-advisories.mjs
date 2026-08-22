#!/usr/bin/env node
/*
 * INVARIANT — the production dependency graph carries no critical advisory, and
 * no high or moderate one that has not been dispositioned in writing.
 *
 * BUG-0052 opened with 17 production advisories, one critical. Getting to zero
 * critical took three corrections to the record, because each disposition had
 * rested on a reachability claim that turned out to be wrong:
 *
 *   - `xlsx` was "export only". The file named contained a `XLSX.read` call
 *     reachable from two authenticated upload endpoints. A reachability claim
 *     must name the **call sites**, not the file.
 *   - `active-win`'s chain "does not ship in the packaged app". The packaged
 *     archive was extracted: all of it shipped, at exactly the advisory
 *     versions. A claim about what ships must name the **artifact**, not the
 *     manifest.
 *
 * So this check does not evaluate reachability at all — it cannot, and the
 * attempts to do so by inspection are what produced two wrong dispositions. It
 * asserts something a machine can actually decide: **nothing is critical, and
 * every survivor is one this repository has written down and can defend.**
 *
 * That is deliberately not a blanket zero-advisory gate, which the record warns
 * against: dev dependencies are noisy and a gate that fires constantly gets
 * disabled. `--omit=dev` and a reasoned allowlist is the version that stays on.
 *
 *   node scripts/check-production-advisories.mjs [--json]
 *
 * Exit codes: 0 clean · 1 an undocumented or critical advisory · 2 audit failed
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const asJson = process.argv.includes('--json');

/**
 * Advisories that survive, why they survive, and what would make us look again.
 *
 * A critical is never allowed here, whatever the reason — the entry would be
 * rejected below. Every one of these is a `--omit=dev` finding whose npm-offered
 * "fix" costs more than the advisory, and each names the record that argues it.
 */
const DISPOSITIONED = new Map([
  [
    'prisma',
    "devDependency (the CLI, not shipped runtime code). npm's fix is a downgrade to prisma@6, which cannot run the @prisma/adapter-pg driver-adapter data layer this product is built on — it would break every query to silence a build-tool advisory. BUG-0052.",
  ],
  [
    '@prisma/config',
    'Transitive through the prisma CLI. Same disposition as `prisma`. BUG-0052.',
  ],
  [
    'deepmerge-ts',
    'Transitive through the prisma CLI. Same disposition as `prisma`. BUG-0052.',
  ],
  [
    'xlsx',
    'Present but unreachable: every XLSX.read call site moved to ExcelJS in TASK-0010, and no read call remains anywhere in the repository. Only the write path still uses SheetJS, and it consumes data this application produced. Removing the dependency means moving the writer too, which changes the bytes of payroll workbooks that go to banks — deferred as ITEM-0070, not forgotten. BUG-0052.',
  ],
  [
    'exceljs',
    "Moderate. npm's fix is a major downgrade from 4.4.0 to 3.4.0 — four majors back, on the library the xlsx containment migrated *toward*. BUG-0052.",
  ],
  [
    'uuid',
    'Moderate, transitive through exceljs. Same disposition. BUG-0052.',
  ],
]);

/** Locate `npm-cli.js` beside the running Node, falling back to `npm_execpath`. */
function npmCliPath() {
  const fromEnv = process.env.npm_execpath;
  if (fromEnv && fromEnv.endsWith('.js') && existsSync(fromEnv)) return fromEnv;

  const nodeDir = dirname(process.execPath);
  const candidates = [
    join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(
    'could not locate npm-cli.js beside node — set npm_execpath, or run this through npm',
  );
}

let report;
try {
  // npm's own cli.js under this Node, rather than the `npm` shim. On Windows the
  // shim is a `.cmd` that Node refuses to spawn directly since the EINVAL
  // hardening in 18.20/20.12, and the `shell: true` workaround emits DEP0190 on
  // every run. Running the cli directly avoids both and pins the npm that ships
  // with the Node this repository declares.
  const stdout = execFileSync(
    process.execPath,
    [npmCliPath(), 'audit', '--omit=dev', '--package-lock-only', '--json'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  report = JSON.parse(stdout);
} catch (error) {
  // `npm audit` exits non-zero whenever it finds anything, so a non-zero exit is
  // the normal case and its stdout is still the report. Only an unparseable
  // stdout is a real failure.
  const stdout = error?.stdout;
  try {
    report = JSON.parse(String(stdout));
  } catch {
    console.error('check-production-advisories: npm audit produced no report.');
    console.error(error?.message ?? error);
    process.exit(2);
  }
}

const found = Object.entries(report.vulnerabilities ?? {});
const criticals = [];
const undocumented = [];

for (const [name, entry] of found) {
  if (entry.severity === 'critical') {
    criticals.push(name);
    continue;
  }
  if (!DISPOSITIONED.has(name)) undocumented.push(`${entry.severity} ${name}`);
}

// A disposition that no longer matches anything is worse than none: it reads as
// a live risk acceptance for a package that has since been fixed or removed,
// and it hides the fact that the argument was never revisited.
const stale = [...DISPOSITIONED.keys()].filter(
  (name) => !found.some(([found_]) => found_ === name),
);

if (asJson) {
  console.log(
    JSON.stringify(
      {
        totals: report.metadata?.vulnerabilities ?? {},
        criticals,
        undocumented,
        stale,
      },
      null,
      2,
    ),
  );
}

let failed = false;

if (criticals.length > 0) {
  failed = true;
  console.error(
    'check-production-advisories: a CRITICAL advisory is present in the\n' +
      'production dependency graph. There is no disposition for a critical —\n' +
      'fix it, or remove the dependency.\n',
  );
  for (const name of criticals) console.error(`  ${name}`);
}

if (undocumented.length > 0) {
  failed = true;
  console.error(
    `\ncheck-production-advisories: ${undocumented.length} production advisory(ies)\n` +
      'with no written disposition. Either fix it, or add it to DISPOSITIONED in\n' +
      'this file with the reason and the record that argues it. An advisory with\n' +
      'no argument behind it is an advisory nobody decided about.\n',
  );
  for (const entry of undocumented) console.error(`  ${entry}`);
}

if (stale.length > 0) {
  failed = true;
  console.error(
    `\ncheck-production-advisories: ${stale.length} disposition(s) no longer match\n` +
      'any advisory. Remove them — a risk acceptance for a package that is no\n' +
      'longer vulnerable reads as a live one.\n',
  );
  for (const name of stale) console.error(`  ${name}`);
}

if (failed) process.exit(1);

const totals = report.metadata?.vulnerabilities ?? {};
if (!asJson) {
  console.log(
    `check-production-advisories: 0 critical, ${found.length} dispositioned ` +
      `(${totals.high ?? 0} high, ${totals.moderate ?? 0} moderate).`,
  );
}
