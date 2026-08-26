#!/usr/bin/env node
/**
 * Remove a task worktree without destroying the primary checkout.
 *
 * `git worktree remove` deletes the directory recursively. On Windows a
 * *junction* is a directory to that recursion, so the delete walks straight
 * through it and destroys whatever it points at. In this repository that is not
 * hypothetical: a worktree's `node_modules` is routinely junctioned to the
 * primary's, because a fresh `npm ci` per worktree costs minutes, and npm
 * workspaces puts its own links *inside* `node_modules` —
 * `node_modules/admin -> apps/admin`, `node_modules/web -> apps/web`,
 * `node_modules/api -> services/api`, `node_modules/@repo/* -> packages/*`.
 *
 * So the recursion chains through two levels of link and lands in the real
 * source tree. On 2026-08-26 that deleted 3,072 tracked files out of the user's
 * primary checkout — `apps/admin`, `apps/web`, `docs` and every workspace npm
 * had linked — plus every installed dependency. The tracked files came back
 * with `git restore .`; `node_modules` needed a full reinstall.
 *
 * This script unlinks every reparse point inside the worktree *first*, using a
 * call that cannot follow one, and only then hands the directory to Git. It
 * verifies each target still exists afterwards, because the whole failure mode
 * is a delete that silently succeeds against the wrong directory.
 *
 * Usage:
 *   node scripts/remove-worktree.mjs <path> [--branch <name>] [--dry-run]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const branchIndex = args.indexOf('--branch');
const branch = branchIndex === -1 ? null : args[branchIndex + 1];
const target = args.find((a) => !a.startsWith('--') && a !== branch);

if (!target) {
  console.error('Usage: node scripts/remove-worktree.mjs <path> [--branch <name>] [--dry-run]');
  process.exit(2);
}

const worktree = resolve(target);
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();

if (!existsSync(worktree)) {
  console.log(`${worktree} does not exist — nothing to remove.`);
  console.log('Running `git worktree prune` to clear any stale registration.');
  if (!dryRun) git('worktree', 'prune');
  process.exit(0);
}

/*
 * Refuse to operate on a registered worktree's *primary*. `git worktree list`
 * puts the main working tree first; removing it is never what anyone means, and
 * this script exists because a delete hit the primary once already.
 */
const listed = git('worktree', 'list', '--porcelain')
  .split('\n')
  .filter((l) => l.startsWith('worktree '))
  .map((l) => resolve(l.slice('worktree '.length)));

if (listed.length && listed[0] === worktree) {
  console.error(`REFUSING: ${worktree} is the PRIMARY worktree, not a task worktree.`);
  process.exit(1);
}
if (listed.length && !listed.includes(worktree)) {
  console.error(`REFUSING: ${worktree} is not a registered worktree of this repository.`);
  console.error('Registered:');
  for (const w of listed) console.error(`  ${w}`);
  process.exit(1);
}

/** Every reparse point under `dir`, without descending *into* one. */
function findLinks(dir, found = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    let stat;
    try {
      stat = lstatSync(full);
    } catch {
      continue;
    }
    if (stat.isSymbolicLink()) {
      // A junction reports as a symlink to lstat. Record it and DO NOT recurse:
      // descending is the exact mistake this script prevents.
      found.push(full);
      continue;
    }
    if (stat.isDirectory()) findLinks(full, found);
  }
  return found;
}

const links = findLinks(worktree);
console.log(`Reparse points inside the worktree: ${links.length}`);
for (const l of links) console.log(`  ${l}`);

/*
 * Unlink each one. `rmdirSync` on a link removes the link itself and cannot
 * traverse it; `unlinkSync` covers file symlinks. Never `rm -rf`, and never
 * `rmSync(..., { recursive: true })` — both follow.
 */
let unlinked = 0;
for (const link of links) {
  if (dryRun) {
    console.log(`  [dry-run] would unlink ${link}`);
    continue;
  }
  try {
    rmdirSync(link);
  } catch {
    try {
      unlinkSync(link);
    } catch (error) {
      console.error(`FAILED to unlink ${link}: ${error.message}`);
      console.error('Stopping. Removing the worktree now could delete the link target.');
      process.exit(1);
    }
  }
  if (existsSync(link)) {
    console.error(`FAILED: ${link} still exists after unlinking. Stopping.`);
    process.exit(1);
  }
  unlinked += 1;
}
console.log(`Unlinked ${unlinked} reparse point(s).`);

// Prove the primary still has what those links pointed at.
const primary = listed[0] ?? git('rev-parse', '--show-toplevel');
const sentinels = ['package.json', 'AGENTS.md', 'apps', 'services', 'packages', 'docs', 'scripts'];
const missing = sentinels.filter((s) => !existsSync(join(primary, s)));
if (missing.length) {
  console.error(`REFUSING to continue: the primary checkout is missing ${missing.join(', ')}.`);
  console.error(`Check ${primary} before going further.`);
  process.exit(1);
}

if (dryRun) {
  console.log(`[dry-run] would run: git worktree remove ${worktree}`);
  if (branch) console.log(`[dry-run] would run: git branch -d ${branch}`);
  process.exit(0);
}

execFileSync('git', ['worktree', 'remove', worktree, '--force'], { stdio: 'inherit' });
console.log(`Removed worktree ${worktree}`);

// And prove it again, because the delete is the dangerous step.
const missingAfter = sentinels.filter((s) => !existsSync(join(primary, s)));
if (missingAfter.length) {
  console.error('');
  console.error(`*** The primary checkout is now missing ${missingAfter.join(', ')}.`);
  console.error(`*** Recover with:  cd "${primary}" && git restore .`);
  console.error('*** Then reinstall dependencies: npm ci');
  process.exit(1);
}
console.log('Primary checkout verified intact.');

if (branch) {
  try {
    execFileSync('git', ['branch', '-d', branch], { stdio: 'inherit' });
    console.log(`Deleted local branch ${branch}`);
  } catch {
    console.log(`Local branch ${branch} not deleted — it is probably unmerged. Left in place.`);
  }
}
