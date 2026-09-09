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
    'mysql2',
    "Transitive through the prisma CLI (@prisma/client -> prisma -> mysql2), which bundles a driver per supported database. This product never opens a MySQL connection: the datasource provider is `postgresql` (schema.prisma), the runtime adapter is `PrismaPg` from @prisma/adapter-pg (common/prisma/prisma.service.ts), and the only occurrence of the string 'mysql' in application source is a CV skill keyword in recruitment/document-parsing.service.ts. Both advisories require connecting to a MySQL server — an auth-plugin downgrade that leaks the password to a malicious server, and unbounded zlib inflate in the compressed protocol — so neither is reachable without a connection this product cannot make. npm's only fix is a downgrade to prisma@6.19.3, which cannot run the driver-adapter data layer, exactly as for `prisma` above. ITEM-0122.",
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
  /*
   * multer and the two @nestjs packages that carry it.
   *
   * These three are one advisory set: `@nestjs/platform-express` pins
   * `multer: 2.2.0` exactly, and `@nestjs/core` is dragged in beside it, so all
   * three are reported for the same underlying vulnerability in multer.
   *
   * This is a REACHABLE high, not a build-tool finding, and it is dispositioned
   * anyway. The argument is below rather than in a commit message, because a
   * disposition nobody can audit later is the failure mode BUG-0052 recorded
   * three times over.
   */
  [
    'multer',
    "REACHABLE, and accepted deliberately until upstream ships a bump. Three high DoS advisories in versions <=2.2.0: crafted multipart field names (GHSA-wc9g-mqfw-jrwm), a file-descriptor leak on aborted uploads (GHSA-qfvm-cv95-jqjf), and an oversized array index in field names (GHSA-535w-7cp7-47q4). multer is the multipart parser behind every authenticated upload this API accepts, so the code path is live — no reachability claim is being made here. What is claimed is this: (1) the fixed 2.3.0 cannot be reached. @nestjs/platform-express pins multer at exactly 2.2.0 and NO published version bumps it — checked 2026-09-09: 11.2.3, the newest of the 11.x line this product is on, and 12.0.1, the latest overall, both pin 2.2.0. npm's own offered fix is @nestjs/core@7.5.5, a downgrade from v11, which is not a fix. (2) A root override to ^2.3.0 does resolve, but npm honours it only when no lockfile exists; forcing that by regenerating from scratch produced multer 2.3.0 together with a CRITICAL tar advisory, four further highs and 294 unrelated version changes — strictly worse, and reverted. (3) The risk is NOT introduced by the release this unblocks. multer 2.2.0 is already in production: it is in main's lockfile at fe1cd3dd, serving traffic today. Holding the release protects nobody from multer while delaying 37 advisories it genuinely fixes, two of them high (@xmldom/xmldom, fast-uri). (4) The impact is denial of service against an authenticated endpoint, not data disclosure, tenant crossing or remote code execution. REMOVE THIS ENTRY the moment @nestjs/platform-express ships a multer >2.2.0 — one line checks it: `npm view @nestjs/platform-express@latest dependencies.multer`. ITEM-0123.",
  ],
  [
    '@nestjs/platform-express',
    'Reported for the multer pin it carries, not for a defect of its own. See the `multer` entry above, including its removal trigger. ITEM-0123.',
  ],
  [
    '@nestjs/core',
    'Reported alongside @nestjs/platform-express for the same multer pin. See the `multer` entry above. ITEM-0123.',
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
