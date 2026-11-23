/*
 * Deterministic completion verifier for a long-running engineering program.
 *
 * It answers one question from EVIDENCE, never from a status field an
 * implementing agent wrote: has the program reached a state in which the
 * release candidate can be offered to the owner for a merge into `main`?
 *
 * Inputs
 *   - docs/engineering/program-completion.json — the gate manifest. It declares
 *     WHICH evidence each gate needs. It carries no "done" flag; a gate with no
 *     checks is a manifest error, because an empty gate would pass vacuously.
 *   - the repository itself (git ancestry and diffs, the bug/backlog records),
 *   - docs/engineering/reviews/*.json — independent review records,
 *   - GitHub Actions results for an exact SHA (through an injectable lookup).
 *
 * Verdicts
 *   IN_PROGRESS            executable work remains
 *   BLOCKED_OWNER_ACTION   every remaining gate waits on an open owner decision
 *   BLOCKED_EXTERNAL       every remaining gate waits on something outside the repo
 *   VALIDATION_FAILED      recorded evidence CONTRADICTS a claim (red CI on the
 *                          candidate, a rejecting review, a malformed manifest)
 *   READY_TO_MERGE_MAIN    every gate satisfied, with evidence
 *
 * A check that cannot be evaluated (no network, `gh` missing) is UNVERIFIED, not
 * passed: the verdict can then never be READY.
 *
 * No dependencies. Read-only: nothing here writes, commits, pushes or merges.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { loadRecords, isActive } from './backlog-records.mjs';

export const MANIFEST_PATH = 'docs/engineering/program-completion.json';
export const REVIEW_DIR = 'docs/engineering/reviews';

export const VERDICTS = [
  'IN_PROGRESS',
  'BLOCKED_OWNER_ACTION',
  'BLOCKED_EXTERNAL',
  'VALIDATION_FAILED',
  'READY_TO_MERGE_MAIN',
];

const PASS = 'PASS';
const FAIL = 'FAIL'; // not satisfied yet — work remains
const CONTRADICTED = 'CONTRADICTED'; // evidence says the claim is false
const UNVERIFIED = 'UNVERIFIED'; // could not be evaluated

function git(root, args) {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/** True/false when git can tell; null when the sha or ref is unknown here. */
function isAncestor(root, ancestor, descendant) {
  if (!ancestor || !descendant) return null;
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      cwd: root,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return true;
  } catch (error) {
    // exit 1 = not an ancestor; anything else = unknown object.
    return error.status === 1 ? false : null;
  }
}

function resolveSha(root, ref) {
  return git(root, ['rev-parse', '--verify', `${ref}^{commit}`]);
}

/** Default CI lookup: exact-SHA `CI` workflow conclusion through the gh CLI. */
export function ghCiLookup(root, sha, workflow = 'CI') {
  const candidates = [
    'gh',
    'C:\\Program Files\\GitHub CLI\\gh.exe',
    '/c/Program Files/GitHub CLI/gh.exe',
  ];
  for (const bin of candidates) {
    try {
      const out = execFileSync(
        bin,
        ['run', 'list', '--commit', sha, '--json', 'workflowName,status,conclusion'],
        { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 },
      );
      const runs = JSON.parse(out).filter((run) => run.workflowName === workflow);
      if (runs.length === 0) return { state: 'NONE' };
      if (runs.some((run) => run.conclusion === 'failure')) return { state: 'FAILED' };
      if (runs.every((run) => run.status === 'completed' && run.conclusion === 'success')) {
        return { state: 'SUCCESS' };
      }
      return { state: 'PENDING' };
    } catch {
      /* try the next candidate */
    }
  }
  return { state: 'UNKNOWN' };
}

/**
 * Reviews are read from the CANDIDATE COMMIT, never from the working tree: a
 * file edited after the fact, or never committed, is not evidence.
 */
function loadReviews(root, candidateSha) {
  if (!candidateSha) return [];
  const listing = git(root, ['ls-tree', '--name-only', candidateSha, `${REVIEW_DIR}/`]);
  if (!listing) return [];
  const reviews = [];
  for (const path of listing.split(/\r?\n/).filter((name) => name.endsWith('.json'))) {
    const file = path.slice(REVIEW_DIR.length + 1);
    const blob = git(root, ['show', `${candidateSha}:${path}`]);
    try {
      reviews.push({ file, ...JSON.parse(blob ?? '') });
    } catch {
      reviews.push({ file, malformed: true });
    }
  }
  return reviews;
}

// ---------------------------------------------------------------- the checks

function checkCommitIn(ctx, check) {
  const verdict = isAncestor(ctx.root, check.sha, check.ref);
  if (verdict === null) return [UNVERIFIED, `${check.sha} or ${check.ref} unknown to this clone`];
  return verdict ? [PASS, `${check.sha.slice(0, 8)} is in ${check.ref}`] : [FAIL, `${check.sha.slice(0, 8)} is not in ${check.ref}`];
}

function checkCi(ctx, check) {
  const sha = check.sha === 'CANDIDATE' ? ctx.candidateSha : check.sha;
  if (!sha) return [FAIL, 'no candidate sha declared'];
  const result = ctx.ci(ctx.root, sha, check.workflow ?? 'CI');
  switch (result.state) {
    case 'SUCCESS':
      return [PASS, `CI green on ${sha.slice(0, 8)}`];
    case 'FAILED':
      return [CONTRADICTED, `CI failed on ${sha.slice(0, 8)}`];
    case 'PENDING':
      return [FAIL, `CI pending on ${sha.slice(0, 8)}`];
    case 'NONE':
      return [FAIL, `no CI run on ${sha.slice(0, 8)}`];
    default:
      return [UNVERIFIED, 'CI result unavailable (gh missing or offline)'];
  }
}

/**
 * An independent review counts when: it names this gate and role, APPROVES, was
 * written by someone other than the implementer, is of a commit that is part of
 * the candidate, and no later commit touched the paths it reviewed.
 */
function checkReview(ctx, check) {
  const matching = ctx.reviews.filter(
    (review) => !review.malformed && review.gate === check.gate && review.role === check.role,
  );
  if (matching.length === 0) return [FAIL, `no ${check.role} review recorded for ${check.gate}`];
  const rejected = matching.find((review) => review.verdict === 'REJECT');
  const approving = matching.filter((review) => review.verdict === 'APPROVE');
  if (approving.length === 0) {
    return rejected
      ? [CONTRADICTED, `${rejected.file}: review rejected`]
      : [FAIL, 'review is neither approving nor rejecting'];
  }
  for (const review of approving) {
    if (!review.reviewer || review.reviewer === review.implementer) continue;
    // A review that names no paths could never go stale, so it is not evidence.
    if (!Array.isArray(review.paths) || review.paths.length === 0) continue;
    const inside = isAncestor(ctx.root, review.sha, ctx.candidateSha);
    if (inside === null) return [UNVERIFIED, `${review.sha} unknown to this clone`];
    if (!inside) continue;
    const changed = git(ctx.root, ['diff', '--name-only', `${review.sha}..${ctx.candidateSha}`]);
    if (changed === null) return [UNVERIFIED, 'diff unavailable'];
    const touched = changed
      .split('\n')
      .filter(Boolean)
      .filter((file) => (review.paths ?? []).some((prefix) => file.startsWith(prefix)));
    if (touched.length === 0) {
      return [PASS, `${review.file}: ${review.reviewer} approved ${review.sha.slice(0, 8)}`];
    }
    return [FAIL, `${review.file} is stale: ${touched[0]} changed after the review`];
  }
  return [FAIL, 'no approving review by an independent reviewer of a commit in the candidate'];
}

function checkRecordsStatus(ctx, check) {
  const byId = new Map(ctx.records.map((record) => [record.id, record]));
  const wrong = [];
  for (const id of check.ids) {
    const record = byId.get(id);
    if (!record) wrong.push(`${id} missing`);
    else if (!check.statuses.includes(record.status)) wrong.push(`${id} is ${record.status}`);
  }
  return wrong.length === 0 ? [PASS, `${check.ids.length} record(s) in ${check.statuses.join('/')}`] : [FAIL, wrong.join('; ')];
}

/** No actionable record at or above a priority may remain open. */
const DECIDED = new Set(['APPROVED', 'ACCEPTED_RISK', 'DEFERRED_BY_OWNER']);

function checkNoOpenRecords(ctx, check) {
  const priorities = new Set(check.priorities ?? ['P0', 'P1']);
  // A record is exempt only when the owner has DECIDED so; one covered by a
  // decision that is still OPEN is waiting on the owner, which is a different
  // thing from being done.
  const decisions = ctx.manifest.ownerDecisions ?? [];
  const exempt = new Set(
    decisions.filter((d) => DECIDED.has(d.status)).flatMap((d) => d.covers ?? []),
  );
  const waiting = new Map();
  for (const decision of decisions.filter((d) => d.status === 'OPEN')) {
    for (const id of decision.covers ?? []) waiting.set(id, decision.id);
  }
  const open = ctx.records.filter(
    (record) =>
      isActive(record) &&
      priorities.has(record.priority) &&
      !exempt.has(record.id) &&
      !['BLOCKED', 'DEFERRED', 'PRODUCT_DECISION'].includes(record.status),
  );
  if (open.length === 0) return [PASS, `no open ${[...priorities].join('/')} actionable records`];
  const actionable = open.filter((record) => !waiting.has(record.id));
  const label = (list) => `${list.length} open: ${list.slice(0, 5).map((record) => record.id).join(', ')}${list.length > 5 ? ', …' : ''}`;
  if (actionable.length > 0) return [FAIL, label(actionable)];
  const ids = [...new Set(open.map((record) => waiting.get(record.id)))];
  return [FAIL, `only owner-gated records remain (${label(open)})`, { waitsOnOwner: ids }];
}

function checkCommand(ctx, check) {
  if (!ctx.allowCommands) return [UNVERIFIED, 'command checks are not run in this mode'];
  if (!/^node scripts\/[\w./-]+\.mjs( [\w./=:-]+)*$/.test(check.command)) {
    return [CONTRADICTED, `command not permitted: ${check.command}`];
  }
  const [, ...args] = check.command.split(' ');
  try {
    execFileSync('node', args, { cwd: ctx.root, stdio: 'ignore', timeout: 600000 });
    return [PASS, `${check.command} exited 0`];
  } catch {
    return [FAIL, `${check.command} failed`];
  }
}

const CHECKS = {
  'commit-in': checkCommitIn,
  ci: checkCi,
  review: checkReview,
  'records-status': checkRecordsStatus,
  'no-open-records': checkNoOpenRecords,
  command: checkCommand,
};

// ---------------------------------------------------------------- the verdict

export function loadManifest(root) {
  const path = join(root, MANIFEST_PATH);
  if (!existsSync(path)) return { manifest: null, problems: [`${MANIFEST_PATH} is missing`] };
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return { manifest: null, problems: [`${MANIFEST_PATH} is not valid JSON: ${error.message}`] };
  }
  const problems = [];
  if (!manifest.programId) problems.push('programId is required');
  if (!Array.isArray(manifest.gates) || manifest.gates.length === 0) problems.push('gates must be a non-empty array');
  if ('acceptedOrOwnerGated' in manifest) {
    problems.push('acceptedOrOwnerGated is no longer honoured: list covered record ids under ownerDecisions[].covers');
  }
  const ids = new Set();
  for (const gate of manifest.gates ?? []) {
    if (!gate.id) problems.push('a gate has no id');
    if (ids.has(gate.id)) problems.push(`duplicate gate ${gate.id}`);
    ids.add(gate.id);
    if (!Array.isArray(gate.checks) || gate.checks.length === 0) {
      problems.push(`gate ${gate.id} declares no checks — it would pass vacuously`);
    }
    for (const forbidden of ['status', 'done', 'complete', 'passed']) {
      if (forbidden in gate) problems.push(`gate ${gate.id} carries a self-reported "${forbidden}" field; the verifier ignores those and they must not exist`);
    }
    for (const check of gate.checks ?? []) {
      if (!CHECKS[check.type]) problems.push(`gate ${gate.id}: unknown check type "${check.type}"`);
    }
  }
  return { manifest, problems };
}

/**
 * @param root     repository root
 * @param options  { ci(root, sha, workflow) , allowCommands }
 */
export function verifyProgram(root, options = {}) {
  const { manifest, problems } = loadManifest(root);
  if (!manifest || problems.length > 0) {
    return {
      verdict: 'VALIDATION_FAILED',
      reason: 'manifest invalid',
      problems,
      gates: [],
      nextGate: null,
    };
  }

  const candidateSha = manifest.candidate?.sha ? resolveSha(root, manifest.candidate.sha) : null;
  const { records } = loadRecords(root);
  const ctx = {
    root,
    manifest,
    candidateSha,
    records,
    reviews: loadReviews(root, candidateSha),
    ci: options.ci ?? ghCiLookup,
    allowCommands: options.allowCommands ?? false,
  };

  const openDecisions = new Set(
    (manifest.ownerDecisions ?? []).filter((decision) => decision.status === 'OPEN').map((decision) => decision.id),
  );
  const externalOpen = new Set(
    (manifest.externalBlockers ?? []).filter((blocker) => blocker.status === 'OPEN').map((blocker) => blocker.id),
  );

  const gates = manifest.gates.map((gate) => {
    const results = gate.checks.map((check) => {
      const [state, detail, extra] = CHECKS[check.type](ctx, check);
      return { type: check.type, state, detail, waitsOnOwner: extra?.waitsOnOwner ?? [] };
    });
    const state = results.some((result) => result.state === CONTRADICTED)
      ? CONTRADICTED
      : results.every((result) => result.state === PASS)
        ? PASS
        : results.some((result) => result.state === UNVERIFIED)
          ? UNVERIFIED
          : FAIL;
    const failing = results.filter((result) => result.state !== PASS);
    // A gate whose every unmet check waits on an open owner decision is blocked
    // on the owner, however that was declared.
    const derivedOwner =
      failing.length > 0 && failing.every((result) => result.waitsOnOwner.length > 0)
        ? [...new Set(failing.flatMap((result) => result.waitsOnOwner))]
        : [];
    const waitingOwner = [
      ...new Set([
        ...(gate.waitsOnOwnerDecisions ?? []).filter((id) => openDecisions.has(id)),
        ...derivedOwner,
      ]),
    ];
    const waitingExternal = (gate.waitsOnExternal ?? []).filter((id) => externalOpen.has(id));
    return { id: gate.id, title: gate.title ?? '', state, results, waitingOwner, waitingExternal };
  });

  const contradicted = gates.filter((gate) => gate.state === CONTRADICTED);
  const unsatisfied = gates.filter((gate) => gate.state !== PASS);
  const executable = unsatisfied.filter((gate) => gate.waitingOwner.length === 0 && gate.waitingExternal.length === 0);

  let verdict;
  let reason;
  if (contradicted.length > 0) {
    verdict = 'VALIDATION_FAILED';
    reason = `evidence contradicts: ${contradicted.map((gate) => gate.id).join(', ')}`;
  } else if (unsatisfied.length === 0) {
    verdict = 'READY_TO_MERGE_MAIN';
    reason = 'every gate satisfied by evidence';
  } else if (executable.length > 0) {
    verdict = 'IN_PROGRESS';
    reason = `${executable.length} gate(s) have executable work`;
  } else if (unsatisfied.every((gate) => gate.waitingOwner.length > 0)) {
    verdict = 'BLOCKED_OWNER_ACTION';
    reason = `waiting on owner decision(s): ${[...new Set(unsatisfied.flatMap((gate) => gate.waitingOwner))].join(', ')}`;
  } else {
    verdict = 'BLOCKED_EXTERNAL';
    reason = 'remaining gates wait on external dependencies';
  }

  const first = (verdict === 'IN_PROGRESS' ? executable : contradicted)[0] ?? null;
  return {
    verdict,
    reason,
    programId: manifest.programId,
    candidateSha,
    nextGate: first ? { id: first.id, title: first.title, firstFailing: first.results.find((result) => result.state !== PASS)?.detail ?? '' } : null,
    gates,
    problems: [],
  };
}

/** A terminal verdict lets a session stop; the others ask it to continue. */
export const STOPPABLE = new Set(['READY_TO_MERGE_MAIN', 'BLOCKED_OWNER_ACTION', 'BLOCKED_EXTERNAL']);

/** Stable fingerprint of progress: changes whenever HEAD or any gate state does. */
export function progressFingerprint(root, result) {
  // The TREE, not the commit: an empty commit is not progress.
  const head = git(root, ['rev-parse', 'HEAD^{tree}']) ?? '';
  const dirty = git(root, ['status', '--porcelain']) ?? '';
  return `${head}|${dirty.length}|${result.gates.map((gate) => `${gate.id}:${gate.state}`).join(',')}`;
}
