#!/usr/bin/env node
/*
 * Dependency-aware "Ignored Build Step" for the three Vercel projects.
 *
 *   node scripts/vercel-ignore-build.mjs <web|admin|landing>
 *
 * Vercel's ignoreCommand contract: exit 0 = SKIP this build, exit 1 = BUILD.
 * This script is PREPARED, not applied — wiring it to a project is a Vercel
 * dashboard setting, which is a production configuration change reserved for
 * the owner (SESSION-0135, decision D4). Until then nothing calls it.
 *
 * The rule is deliberately one-sided: it may only skip when it can PROVE every
 * changed file is irrelevant to this app. Any doubt builds:
 *   - no previous deployed SHA (first build, force push, new branch)
 *   - the diff cannot be computed (shallow clone, unknown SHA)
 *   - any changed path it does not recognise as irrelevant
 * A wasted build costs minutes; a wrongly skipped one ships a stale app after a
 * shared-package change, which is the failure this exists to avoid.
 *
 * What an app build actually depends on (verified: the three apps import only
 * `@repo/config` from the workspace, and reference `services/api` in comments
 * alone):
 *   - the app's own directory
 *   - every workspace package (`packages/**`), not just the ones an app lists
 *     today — a new dependency should not need this file to be edited
 *   - the root manifest and lockfile (dependency versions), turbo.json
 *     (cache keys/env), and npm/Vercel configuration files
 * Environment-variable changes are not in git; they never trigger a build by
 * themselves and are unaffected by this script.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const APPS = ['web', 'admin', 'landing'];

const ROOT_FILES = new Set([
  'package.json',
  'package-lock.json',
  'turbo.json',
  '.npmrc',
  'vercel.json',
  '.nvmrc',
  '.node-version',
]);

/** Pure: does a change to `file` require rebuilding `app`? */
export function affectsApp(app, file) {
  if (!APPS.includes(app)) return true; // unknown app: build
  const f = file.replaceAll('\\', '/').replace(/^\.\//, '');
  if (f.startsWith(`apps/${app}/`)) return true;
  if (f.startsWith('packages/')) return true;
  if (ROOT_FILES.has(f)) return true;
  // Another app's directory, the API, the gateway, docs, scripts, e2e, CI
  // workflows: none is an input to this app's `next build`.
  const irrelevant =
    /^apps\/(?!.*)/.test(f) || // placeholder to keep the list explicit
    f.startsWith('apps/') ||
    f.startsWith('services/') ||
    f.startsWith('gateway/') ||
    f.startsWith('tools/') ||
    f.startsWith('docs/') ||
    f.startsWith('scripts/') ||
    f.startsWith('e2e/') ||
    f.startsWith('.github/') ||
    f.startsWith('.agent/') ||
    f.startsWith('.claude/') ||
    /\.md$/.test(f);
  return !irrelevant;
}

/** Pure: build unless every changed file is provably irrelevant. */
export function shouldBuild(app, changedFiles) {
  if (!Array.isArray(changedFiles) || changedFiles.length === 0) return true;
  return changedFiles.some((file) => affectsApp(app, file));
}

function changedSince(previousSha) {
  const out = execFileSync(
    'git',
    ['diff', '--name-only', `${previousSha}`, 'HEAD'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  );
  return out.split('\n').map((l) => l.trim()).filter(Boolean);
}

function main() {
  const app = process.argv[2];
  if (!APPS.includes(app)) {
    console.log(`vercel-ignore-build: unknown app "${app}" -> BUILD`);
    process.exit(1);
  }
  const previous = process.env.VERCEL_GIT_PREVIOUS_SHA;
  if (!previous) {
    console.log('vercel-ignore-build: no previous deployed SHA -> BUILD');
    process.exit(1);
  }
  let files;
  try {
    files = changedSince(previous);
  } catch {
    console.log('vercel-ignore-build: diff unavailable -> BUILD');
    process.exit(1);
  }
  const build = shouldBuild(app, files);
  console.log(
    `vercel-ignore-build: ${app}: ${files.length} changed file(s) -> ${build ? 'BUILD' : 'SKIP'}`,
  );
  process.exit(build ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
