#!/usr/bin/env node
/*
 * Verify GitHub branch protection against the branch model this repository
 * actually runs — `main` protects production, `develop` integrates autonomously.
 *
 *   node scripts/verify-branch-policy.mjs
 *   node scripts/verify-branch-policy.mjs --json
 *
 * **Read-only, by design and not merely by omission.** Release/DevOps detects
 * and classifies; the Integrator acts. A script that could relax protection is a
 * script that will eventually relax it to make a merge easier, which is the one
 * change that is never in scope.
 *
 * Exit codes: 0 policy matches · 1 drift detected · 2 the state could not be read
 */

import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const asJson = process.argv.includes('--json');

/**
 * The intended policy.
 *
 * `develop` has **no required status check** on purpose. A required check on a
 * branch with no pull-request requirement blocks direct pushes outright — the
 * commit being pushed has no completed check yet — which would reimpose the
 * mandatory-PR workflow by the back door. Validation before integrating is
 * enforced by the framework (`DEVELOP_VALIDATION_REQUIRED`), and CI still runs
 * on every push because `.github/workflows/ci.yml` triggers on `'**'`.
 */
const POLICY = {
  main: {
    role: 'production deployment branch',
    requirePullRequest: true,
    requiredChecks: ['CI required gate'],
    enforceAdmins: true,
    allowForcePushes: false,
    allowDeletions: false,
  },
  develop: {
    role: 'autonomous integration branch',
    requirePullRequest: false,
    requiredChecks: [],
    enforceAdmins: true,
    allowForcePushes: false,
    allowDeletions: false,
  },
};

function gh(args) {
  /*
   * `gh` is not on PATH in every environment this runs in, so try the plain
   * command first and fall back to the known Windows install location rather
   * than reporting "no GitHub access" for a PATH problem.
   */
  const candidates = ['gh', 'C:\\Program Files\\GitHub CLI\\gh.exe'];
  let lastError = null;
  for (const binary of candidates) {
    try {
      return execFileSync(binary, args, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }).trim();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('gh not available');
}

let repo;
try {
  repo = gh(['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']);
} catch (error) {
  const message = String(error.stderr ?? error.message).split('\n')[0];
  if (asJson) console.log(JSON.stringify({ status: 'UNREADABLE', reason: message }, null, 2));
  else {
    console.error(`BRANCH_POLICY = UNREADABLE — ${message}`);
    console.error('gh is unavailable or unauthenticated here. Record BLOCKED_BY_ACCESS;');
    console.error('do not infer protection state from the fact that a push succeeded.');
  }
  process.exit(2);
}

const findings = [];
const observed = {};

for (const [branch, policy] of Object.entries(POLICY)) {
  let protection = null;
  let unprotected = false;

  try {
    protection = JSON.parse(gh(['api', `repos/${repo}/branches/${branch}/protection`]));
  } catch (error) {
    const message = String(error.stderr ?? error.message);
    if (/Branch not protected/i.test(message)) unprotected = true;
    else if (/Branch not found|404/i.test(message)) {
      findings.push({ branch, severity: 'HIGH', detail: 'branch does not exist on the remote' });
      observed[branch] = { exists: false };
      continue;
    } else {
      findings.push({ branch, severity: 'HIGH', detail: `protection unreadable — ${message.split('\n')[0]}` });
      continue;
    }
  }

  const actual = {
    exists: true,
    protected: !unprotected,
    requirePullRequest: Boolean(protection?.required_pull_request_reviews),
    requiredApprovals: protection?.required_pull_request_reviews?.required_approving_review_count ?? 0,
    requiredChecks: protection?.required_status_checks?.contexts ?? [],
    enforceAdmins: Boolean(protection?.enforce_admins?.enabled),
    allowForcePushes: Boolean(protection?.allow_force_pushes?.enabled),
    allowDeletions: Boolean(protection?.allow_deletions?.enabled),
  };
  observed[branch] = actual;

  if (unprotected) {
    findings.push({
      branch,
      severity: branch === 'main' ? 'CRITICAL' : 'HIGH',
      detail:
        branch === 'main'
          ? 'main is UNPROTECTED — force pushes and deletion are possible on the production branch'
          : 'develop is unprotected — force pushes and deletion are possible on the integration branch',
    });
    continue;
  }

  if (actual.requirePullRequest !== policy.requirePullRequest) {
    findings.push({
      branch,
      severity: branch === 'main' ? 'CRITICAL' : 'MEDIUM',
      detail: policy.requirePullRequest
        ? 'a pull request is no longer required'
        : `a pull request is required (${actual.requiredApprovals} approval(s)) — ordinary integration into develop is meant to be autonomous`,
    });
  }

  const missing = policy.requiredChecks.filter((check) => !actual.requiredChecks.includes(check));
  if (missing.length) {
    findings.push({ branch, severity: 'CRITICAL', detail: `required status check absent: ${missing.join(', ')}` });
  }

  const unexpected = actual.requiredChecks.filter((check) => !policy.requiredChecks.includes(check));
  if (unexpected.length && branch === 'develop') {
    findings.push({
      branch,
      severity: 'MEDIUM',
      detail:
        `unexpected required status check: ${unexpected.join(', ')} — a required check with no PR ` +
        'requirement blocks direct pushes, which reimposes the mandatory-PR workflow',
    });
  }

  if (actual.allowForcePushes !== policy.allowForcePushes) {
    findings.push({ branch, severity: 'HIGH', detail: 'force pushes are permitted' });
  }
  if (actual.allowDeletions !== policy.allowDeletions) {
    findings.push({ branch, severity: 'HIGH', detail: 'branch deletion is permitted' });
  }
  if (actual.enforceAdmins !== policy.enforceAdmins) {
    findings.push({
      branch,
      severity: branch === 'main' ? 'HIGH' : 'MEDIUM',
      detail: 'administrators can bypass these rules',
    });
  }
}

/*
 * Repository rulesets sit alongside classic protection and can silently do
 * nothing. This one does: its ref condition is a literal string rather than a
 * pattern, so it matches no branch at all — worth reporting every time, because
 * a ruleset that appears in the UI reads as protection that is in force.
 */
let rulesets = [];
try {
  rulesets = JSON.parse(gh(['api', `repos/${repo}/rulesets`]));
} catch {
  /* Rulesets are optional; failing to read them is not a policy finding. */
}

for (const summary of rulesets) {
  let detail = null;
  try {
    detail = JSON.parse(gh(['api', `repos/${repo}/rulesets/${summary.id}`]));
  } catch {
    continue;
  }
  const includes = detail?.conditions?.ref_name?.include ?? [];
  const malformed = includes.filter((pattern) => /["']/.test(pattern) || pattern.includes(', '));
  if (malformed.length) {
    findings.push({
      branch: '(ruleset)',
      severity: 'MEDIUM',
      detail:
        `ruleset "${detail.name}" (${detail.id}) has a ref condition that matches no branch: ` +
        `${JSON.stringify(malformed)}. It is inert — the rules it declares are not in force.`,
    });
  }
}

if (asJson) {
  console.log(JSON.stringify({ repo, policy: POLICY, observed, findings }, null, 2));
  process.exit(findings.length ? 1 : 0);
}

console.log('');
console.log(`Branch policy — ${repo}`);
console.log('');
for (const [branch, policy] of Object.entries(POLICY)) {
  const actual = observed[branch] ?? {};
  console.log(`  ${branch}  (${policy.role})`);
  console.log(`    protected            ${actual.protected ?? 'UNKNOWN'}`);
  console.log(`    pull request         required: ${actual.requirePullRequest ?? '?'}  (policy: ${policy.requirePullRequest})`);
  console.log(`    required checks      ${(actual.requiredChecks ?? []).join(', ') || 'none'}  (policy: ${policy.requiredChecks.join(', ') || 'none'})`);
  console.log(`    enforce admins       ${actual.enforceAdmins ?? '?'}`);
  console.log(`    force pushes         ${actual.allowForcePushes ?? '?'}  (policy: ${policy.allowForcePushes})`);
  console.log(`    deletions            ${actual.allowDeletions ?? '?'}  (policy: ${policy.allowDeletions})`);
  console.log('');
}

if (!findings.length) {
  console.log('BRANCH_POLICY = IN_SYNC');
  console.log('');
  process.exit(0);
}

console.log(`BRANCH_POLICY = DRIFT — ${findings.length} finding(s):`);
for (const finding of findings) {
  console.log(`  ${finding.severity.padEnd(8)} ${finding.branch.padEnd(10)} ${finding.detail}`);
}
console.log('');
console.log('This command does not change protection. Where restoration is warranted and');
console.log('permitted, Release/DevOps applies the configuration in');
console.log('docs/development/branch-protection.md and records every change made.');
console.log('**Changing protection to make a merge easier is never in scope.**');
console.log('');
process.exit(1);
