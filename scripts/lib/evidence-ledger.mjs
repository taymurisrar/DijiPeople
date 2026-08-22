/*
 * Reusable evidence, and the rule for when it stops being evidence.
 *
 * Two costs pull in opposite directions, which is why they are solved together.
 *
 * Re-running an expensive suite because an unrelated work package moved is pure
 * waste. A database E2E run that took eleven minutes and passed 304 of 304 is
 * still true after somebody edits a Markdown file, and re-running it buys
 * nothing.
 *
 * Reusing a result after the code it covered changed is worse than waste: it is
 * a false PASS with a real command behind it, which is the most convincing kind.
 *
 * So an evidence record names four things — the command, the SHA it ran at, the
 * scope of files it actually covered, and the result — and reuse is legitimate
 * exactly while nothing inside that scope has changed since.
 *
 * INVALIDATION IS BY CONTENT, NEVER BY AGE. A time-to-live would expire a green
 * suite that nothing touched, which reintroduces the cost this exists to remove,
 * and would equally keep a stale result alive for its whole window after the
 * fixture underneath it was rewritten. Both failure modes come from measuring
 * the wrong thing.
 *
 * No dependencies.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const EVIDENCE_DIR = 'docs/evidence';
export const LEDGER_FILE = 'docs/evidence/ledger.json';

/** What an evidence record can say about its run. */
export const EVIDENCE_RESULTS = ['PASS', 'FAIL', 'PARTIAL', 'BLOCKED', 'SKIPPED'];

/**
 * Why a record is no longer usable.
 *
 * `SCOPE_CHANGED` is the ordinary one. `SUPERSEDED` means a newer run of the
 * same id replaced it. `MANUAL` covers the case where somebody knows the result
 * is wrong for a reason the file list cannot see — a flaky infrastructure run,
 * a provider outage — and that is deliberately recorded rather than achieved by
 * deleting the row.
 */
export const INVALIDATION_REASONS = ['SCOPE_CHANGED', 'SUPERSEDED', 'MANUAL'];

export function loadLedger(root) {
  const path = join(root, LEDGER_FILE);
  if (!existsSync(path)) return { version: 1, records: [] };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (!Array.isArray(parsed.records)) return { version: 1, records: [] };
    return parsed;
  } catch (error) {
    throw new Error(`${LEDGER_FILE} is not readable JSON — ${error.message}`);
  }
}

export function saveLedger(root, ledger) {
  const path = join(root, LEDGER_FILE);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
}

/**
 * Does a changed path fall inside a declared scope entry?
 *
 * Scope entries are directory prefixes or simple globs — `services/api/test`,
 * `services/api/**\/*.spec.ts`. Deliberately not a full glob engine: a scope
 * nobody can read at a glance is a scope nobody can tell is wrong, and being
 * wrong here means silently reusing evidence that should have been invalidated.
 */
export function pathInScope(path, scopeEntry) {
  const normalise = (value) => String(value).split('\\').join('/').replace(/^\.\//, '');
  const file = normalise(path);
  const scope = normalise(scopeEntry).replace(/\/+$/, '');
  if (!scope) return false;

  if (!scope.includes('*')) {
    return file === scope || file.startsWith(`${scope}/`);
  }

  const pattern = scope
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    /* `**` spans directories; a single `*` stops at the separator. */
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*');

  return new RegExp(`^${pattern}$`).test(file);
}

/**
 * Files changed between two commits.
 *
 * Returns null when the range cannot be resolved — a SHA that is not in this
 * checkout, a shallow clone. Null propagates to "cannot prove it is still
 * valid", which then refuses reuse. Failing closed is the only safe direction:
 * the alternative is treating an unresolvable range as "nothing changed".
 */
export function changedBetween(root, fromSha, toSha = 'HEAD') {
  try {
    const output = execFileSync('git', ['diff', '--name-only', `${fromSha}..${toSha}`], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  } catch {
    return null;
  }
}

/**
 * Is this evidence still usable at `toSha`?
 *
 * Returns `{ valid, reason, changed }`. `changed` lists the in-scope files that
 * invalidated it, so the answer is auditable rather than a bare boolean — the
 * question a human asks next is always "changed by what?".
 */
export function evaluate(root, record, toSha = 'HEAD') {
  if (record.invalidatedBy) {
    return { valid: false, reason: `invalidated: ${record.invalidatedBy}`, changed: [] };
  }
  if (record.result !== 'PASS') {
    return { valid: false, reason: `result is ${record.result}, not PASS`, changed: [] };
  }
  if (!record.sha) {
    return { valid: false, reason: 'record carries no SHA, so nothing can be compared', changed: [] };
  }

  const scope = Array.isArray(record.scope) ? record.scope : [];
  if (scope.length === 0) {
    /*
     * An empty scope is not "covers nothing", it is "we did not say". Treating
     * it as always-valid would make the cheapest possible record the most
     * powerful one.
     */
    return { valid: false, reason: 'record declares no scope, so its coverage cannot be checked', changed: [] };
  }

  const changed = changedBetween(root, record.sha, toSha);
  if (changed === null) {
    return {
      valid: false,
      reason: `cannot resolve ${record.sha}..${toSha} in this checkout`,
      changed: [],
    };
  }

  const inScope = changed.filter((path) => scope.some((entry) => pathInScope(path, entry)));
  if (inScope.length) {
    return {
      valid: false,
      reason: `${inScope.length} in-scope file(s) changed since ${record.sha}`,
      changed: inScope,
    };
  }

  return {
    valid: true,
    reason: `no in-scope file changed since ${record.sha} (${changed.length} file(s) changed overall)`,
    changed: [],
  };
}

/**
 * Add or replace a record.
 *
 * Re-recording an id supersedes the previous one rather than appending a second
 * row with the same name, so `check <id>` never has to choose between two
 * answers.
 */
export function record(ledger, entry) {
  const existing = ledger.records.findIndex((candidate) => candidate.id === entry.id);
  if (existing !== -1) {
    ledger.records[existing] = { ...ledger.records[existing], ...entry, invalidatedBy: '' };
  } else {
    ledger.records.push({ invalidatedBy: '', ...entry });
  }
  return ledger;
}
