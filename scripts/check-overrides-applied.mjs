#!/usr/bin/env node
/*
 * Every `overrides` entry in the root manifest must actually be reflected in
 * `package-lock.json`.
 *
 * This exists because npm can ignore an override in silence. BUG-0163: the
 * lockfile could no longer be re-resolved — a `@tiptap` peer conflict made a
 * fresh resolve fail — so npm reused the existing tree, and every attempt to
 * force `@mapbox/node-pre-gyp` off a version carrying a critical `tar` advisory
 * did nothing at all. `npm pkg get overrides` returned the key; `npm install`
 * reported "up to date"; the resolved version never moved. No warning, no
 * error, and the security fix quietly did not happen.
 *
 * The obvious check — "does the lock record an `overrides` key?" — does not
 * work. npm 11 writes no such key at `packages[""]` even when the overrides are
 * applied and effective, so its absence proves nothing. That was a wrong
 * diagnostic on the way to this one, and it is recorded here so the next person
 * does not repeat it.
 *
 * What is checkable is the outcome: for each override, every resolved instance
 * of that package must satisfy the demanded range. That is the difference
 * between a declared intention and a wired-up one — the `declared-but-unwired-step`
 * pattern, applied to dependency resolution.
 *
 *   node scripts/check-overrides-applied.mjs
 *   node scripts/check-overrides-applied.mjs --json
 *
 * Exit codes: 0 every override applied · 1 at least one ignored · 2 usage error
 *
 * No dependencies. Range matching is deliberately limited to the `^`, `~` and
 * exact forms this repository actually uses; anything else is reported as
 * UNCHECKED rather than guessed at, because a semver parser written in an
 * afternoon is a worse outcome than an honest gap.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
if (argv.includes('--help')) {
  console.error('Usage: node scripts/check-overrides-applied.mjs [--json]');
  process.exit(2);
}
const asJson = argv.includes('--json');

const manifestPath = join(ROOT, 'package.json');
const lockPath = join(ROOT, 'package-lock.json');

if (!existsSync(lockPath)) {
  console.error('package-lock.json is absent — nothing to check.');
  process.exit(2);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const lock = JSON.parse(readFileSync(lockPath, 'utf8'));

const overrides = manifest.overrides ?? {};
const names = Object.keys(overrides);

/** Split "1.2.3" into numbers, ignoring any prerelease tail. */
function parts(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(String(version).trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function gte(a, b) {
  for (let index = 0; index < 3; index += 1) {
    if (a[index] > b[index]) return true;
    if (a[index] < b[index]) return false;
  }
  return true;
}

/**
 * Does `version` satisfy `range`? Returns null when the range form is one this
 * check does not understand, so the caller can report it rather than pass it.
 */
function satisfies(version, range) {
  const spec = String(range).trim();
  const actual = parts(version);
  if (!actual) return null;

  if (/^\d/.test(spec)) {
    const wanted = parts(spec);
    return wanted ? actual.join('.') === wanted.join('.') : null;
  }

  if (spec.startsWith('^')) {
    const wanted = parts(spec.slice(1));
    if (!wanted) return null;
    /* Caret: same leading non-zero, and at least the stated version. */
    return actual[0] === wanted[0] && gte(actual, wanted);
  }

  if (spec.startsWith('~')) {
    const wanted = parts(spec.slice(1));
    if (!wanted) return null;
    return actual[0] === wanted[0] && actual[1] === wanted[1] && gte(actual, wanted);
  }

  return null;
}

const findings = [];

for (const name of names) {
  const range = overrides[name];

  /*
   * Nested overrides — { "pkg": { "dep": "range" } } — are a different shape and
   * are not walked here. This repository uses none, and a check that pretends to
   * validate a form it does not handle is worse than one that says so.
   */
  if (typeof range !== 'string') {
    findings.push({ name, status: 'UNCHECKED', detail: 'nested override form is not validated' });
    continue;
  }

  /* Every instance, including nested copies under other packages. */
  const instances = Object.entries(lock.packages ?? {}).filter(([path]) =>
    path.endsWith(`node_modules/${name}`),
  );

  if (instances.length === 0) {
    findings.push({
      name,
      status: 'ABSENT',
      detail: 'the override names a package that is not in the graph at all',
    });
    continue;
  }

  for (const [path, entry] of instances) {
    const version = entry?.version;
    if (!version) continue;

    const ok = satisfies(version, range);
    if (ok === null) {
      findings.push({ name, status: 'UNCHECKED', detail: `range "${range}" not understood`, path, version });
    } else if (!ok) {
      findings.push({ name, status: 'IGNORED', detail: `resolved ${version}, override demands ${range}`, path, version });
    } else {
      findings.push({ name, status: 'APPLIED', detail: `${version} satisfies ${range}`, path, version });
    }
  }
}

const ignored = findings.filter((finding) => finding.status === 'IGNORED');
const absent = findings.filter((finding) => finding.status === 'ABSENT');
const unchecked = findings.filter((finding) => finding.status === 'UNCHECKED');

if (asJson) {
  console.log(JSON.stringify({ ok: ignored.length === 0 && absent.length === 0, overrides: names, findings }, null, 2));
  process.exit(ignored.length === 0 && absent.length === 0 ? 0 : 1);
}

if (names.length === 0) {
  console.log('No overrides declared — nothing to check.');
  process.exit(0);
}

console.log('');
console.log(`Overrides declared: ${names.length}`);
for (const finding of findings) {
  const where = finding.path ? `  ${finding.path}` : '';
  console.log(`  ${finding.status.padEnd(9)} ${finding.name.padEnd(24)} ${finding.detail}${where}`);
}
console.log('');

if (unchecked.length) {
  console.log(`${unchecked.length} override(s) could not be checked — reported, not assumed to pass.`);
  console.log('');
}

if (ignored.length || absent.length) {
  console.error(
    `Overrides NOT applied — ${ignored.length} ignored, ${absent.length} naming an absent package.`,
  );
  console.error('');
  console.error('An override npm silently ignores is a security fix that did not happen.');
  console.error('Regenerate the lockfile and confirm it resolves: BUG-0163 is the case where');
  console.error('a peer conflict made every fresh resolve fail while npm reported "up to date".');
  process.exit(1);
}

console.log('Every override is reflected in the lockfile.');
