#!/usr/bin/env node
/*
 * Structural validation of the AI engineering framework.
 *
 * Deliberately lightweight: it checks that the framework is *present and
 * internally consistent*, not that its prose is correct. It needs no
 * dependencies, so it is the fastest signal in CI that something is
 * structurally wrong.
 *
 * It exists because the framework's own failure mode has twice been a file
 * that referenced something which did not exist — a context document naming a
 * missing source file, or an agent role pointing at a context file that was
 * never committed.
 *
 *   node scripts/validate-framework.mjs
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const failures = [];
const warnings = [];
let checks = 0;

function check(description, condition, detail = '') {
  checks += 1;
  if (!condition) failures.push(detail ? `${description} — ${detail}` : description);
}

function warn(description) {
  warnings.push(description);
}

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

function markdownFilesIn(relativeDir) {
  const dir = join(ROOT, relativeDir);
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...markdownFilesIn(join(relativeDir, entry)));
    else if (entry.endsWith('.md')) out.push(join(relativeDir, entry).replace(/\\/g, '/'));
  }
  return out;
}

// ---------------------------------------------------------------- agent roles

const REQUIRED_AGENTS = [
  'architect',
  'backend-api',
  'frontend',
  'ui-ux',
  'database',
  'integration',
  'qa',
  'reviewer',
  'integrator',
  'release-devops',
];

for (const agent of REQUIRED_AGENTS) {
  const path = `.agent/agents/${agent}.md`;
  const exists = existsSync(join(ROOT, path));
  check(`agent role present: ${agent}`, exists, path);

  if (!exists) continue;

  const body = read(path);
  check(`${agent} declares Required Context`, body.includes('## Required Context'));
  check(`${agent} declares a Staleness Rule`, body.includes('Staleness Rule'));
}

// The generic implementer role was superseded by the five specialists. A merge
// resurrected it once already; this stops that recurring silently.
check(
  'superseded implementer.md is absent',
  !existsSync(join(ROOT, '.agent/agents/implementer.md')),
  'delete it — superseded by the specialist roles',
);

// ------------------------------------------------------- context layer wiring

const CONTEXT_DIR = '.agent/context';
check('context layer exists', existsSync(join(ROOT, CONTEXT_DIR)));

for (const file of markdownFilesIn(CONTEXT_DIR)) {
  if (file.endsWith('README.md')) continue;
  const body = read(file);
  check(`${file} records Last verified`, body.includes('**Last verified:**'));
  check(`${file} records Verified against commit`, body.includes('**Verified against commit:**'));
  if (!body.includes('## CURRENT')) warn(`${file} has no explicit CURRENT section`);
}

// Every .agent/context reference inside an agent role must resolve.
for (const file of markdownFilesIn('.agent/agents')) {
  const body = read(file);
  for (const match of body.matchAll(/\.agent\/context\/([a-z0-9-]+\.md)/g)) {
    check(
      `${file} references an existing context file`,
      existsSync(join(ROOT, CONTEXT_DIR, match[1])),
      `missing ${match[1]}`,
    );
  }
}

// -------------------------------------------------------------- QA + knowledge

const REQUIRED_PATHS = [
  'AGENTS.md',
  'PLANS.md',
  'CLAUDE.md',
  '.agent/agents/README.md',
  '.agent/skills/README.md',
  'docs/qa/README.md',
  'docs/qa/runs',
  'docs/qa/regressions/index.md',
  'docs/qa/known-bug-patterns/README.md',
  'docs/qa/test-strategy/qa-run-template.md',
  'docs/knowledge/README.md',
  'docs/deployment/README.md',
  'docs/deployment/readiness-checklist.md',
  'docs/deployment/deployment-runbook.md',
  'docs/deployment/rollback-runbook.md',
  'docs/deployment/smoke-tests.md',
  'docs/development/agent-orchestration.md',
  'docs/development/git-worktrees.md',
  'docs/development/obsidian-workflow.md',
  'docs/development/final-report-template.md',
  'docs/development/agent-tooling-matrix.md',
  '.agent/context/knowledge-architecture.md',
  '.agent/skills/process-user-feedback.md',
  '.agent/skills/retrieve-relevant-knowledge.md',
  'scripts/sync-obsidian.mjs',
  'scripts/new-qa-run.mjs',
  'scripts/finalize-agent-task.mjs',
  'scripts/retrieve-knowledge.mjs',
  '.obsidian-sync.example.json',
];

for (const path of REQUIRED_PATHS) {
  check(`required path present: ${path}`, existsSync(join(ROOT, path)));
}

// At least one bug pattern beyond the index, or the prevention system is empty.
const patterns = markdownFilesIn('docs/qa/known-bug-patterns').filter(
  (f) => !f.endsWith('README.md'),
);
check('known bug patterns exist', patterns.length > 0, `found ${patterns.length}`);

// ------------------------------------------------------ task completion contract

/*
 * These checks exist because the framework's definition of done once ended at
 * "implementation + review + QA", and a completed task was therefore allowed to
 * report success while a new API module, a migration and ten deleted components
 * sat uncommitted in a working tree.
 *
 * Documenting the fix is not enough — the previous wording was also documented.
 * If the contract is deleted, hollowed out, unreferenced, or its post-merge
 * ordering is scrambled, this fails.
 */

const CONTRACT = '.agent/context/task-completion-contract.md';
const contractExists = existsSync(join(ROOT, CONTRACT));
check('task completion contract present', contractExists, CONTRACT);

const REQUIRED_COMPLETION_FIELDS = [
  'IMPLEMENTATION_STATUS',
  'LOCAL_VALIDATION_STATUS',
  'QA_STATUS',
  'REVIEW_STATUS',
  'REMOTE_CI_STATUS',
  'MERGE_STATUS',
  'POST_MERGE_VALIDATION_STATUS',
  'KNOWLEDGE_CAPTURE_STATUS',
  'OBSIDIAN_SYNC_STATUS',
  'CLEANUP_STATUS',
];

const REQUIRED_TASK_STATES = [
  'RECEIVED',
  'ANALYZING',
  'PLANNED',
  'IMPLEMENTING',
  'VALIDATING',
  'QA',
  'REVIEW',
  'INTEGRATING',
  'WAITING_FOR_CI',
  'MERGING',
  'POST_MERGE_VALIDATION',
  'CAPTURING_KNOWLEDGE',
  'SYNCING_OBSIDIAN',
  'CLEANING_UP',
  'COMPLETE',
  'BLOCKED',
  'FAILED',
];

if (contractExists) {
  const contract = read(CONTRACT);

  for (const field of REQUIRED_COMPLETION_FIELDS) {
    check(`contract declares ${field}`, contract.includes(field));
  }

  for (const state of REQUIRED_TASK_STATES) {
    check(`contract declares state ${state}`, contract.includes(state));
  }

  // The qualified terminal states are the whole point: without them an agent
  // rounds a blocked finalization up to "complete".
  for (const state of [
    'BLOCKED_FINALIZATION',
    'IMPLEMENTATION_COMPLETE_BUT_UNMERGED',
    'COMPLETE_WITH_DOCUMENTATION_WARNING',
    'SKIPPED_NO_LOCAL_CONFIG',
  ]) {
    check(`contract declares outcome ${state}`, contract.includes(state));
  }

  check(
    'contract forbids ASSUMED_PASS',
    /ASSUMED_PASS/.test(contract) && /forbidden|not a value|Not allowed/i.test(contract),
    'the prohibition must be stated, not merely implied by omission',
  );

  check(
    'contract requires the finalization-pending phrasing',
    contract.includes('IMPLEMENTATION COMPLETE — FINALIZATION PENDING'),
  );

  /*
   * Ordering is a correctness property, not prose. Knowledge must describe the
   * code that actually landed, and Obsidian must publish captured knowledge —
   * so the first mention of each phase has to appear in lifecycle order.
   */
  const ORDERED_PHASES = [
    'MERGE',
    'POST_MERGE_VALIDATION',
    'KNOWLEDGE CAPTURE',
    'OBSIDIAN SYNC',
    'CLEANUP',
  ];
  const positions = ORDERED_PHASES.map((phase) => contract.indexOf(phase));
  check(
    'contract lifecycle names every ordered phase',
    positions.every((p) => p !== -1),
    ORDERED_PHASES.filter((_, i) => positions[i] === -1).join(', ') || '',
  );
  check(
    'contract orders merge → post-merge validation → knowledge → Obsidian → cleanup',
    positions.every((p, i) => i === 0 || (p !== -1 && p > positions[i - 1])),
    'knowledge must be captured after the merge, and synced after being captured',
  );

  /*
   * The shared-target CI gate.
   *
   * A task merged and pushed `main` on REMOTE_CI_STATUS = BLOCKED_BY_ACCESS.
   * Local gates were green and nothing broke, but the merge was authorised by
   * inference on a branch other people pull from. These checks make it a
   * validation failure for the documentation to permit that again.
   */
  check('contract classifies SHARED_TARGET', contract.includes('SHARED_TARGET'));
  check('contract defines BLOCKED_CI_UNVERIFIED', contract.includes('BLOCKED_CI_UNVERIFIED'));

  /*
   * Parse the authorization column rather than trusting that the values are
   * merely mentioned. Every non-PASS value must be marked as not authorising a
   * shared merge; only PASS may say Yes.
   */
  const NON_AUTHORIZING_CI = [
    'FAILED',
    'PENDING',
    'UNKNOWN',
    'BLOCKED_BY_ACCESS',
    'UNAVAILABLE',
    'NOT_REQUIRED',
  ];

  /*
   * Scope to the CI authorization table. Several tables in this document share
   * the `| \`VALUE\` |` row shape, and matching the first one found reads the
   * wrong column entirely.
   */
  const ciTableStart = contract.indexOf('| `REMOTE_CI_STATUS` | Meaning | Authorises a shared merge?');
  check(
    'contract has a CI authorization table',
    ciTableStart !== -1,
    'expected a table with an "Authorises a shared merge?" column',
  );

  const ciTable = ciTableStart === -1 ? '' : contract.slice(ciTableStart).split(/\r?\n\r?\n/)[0];
  const ciRow = (value) =>
    ciTable
      .split(/\r?\n/)
      .find((line) => new RegExp(`^\\|\\s*\`${value}\`\\s*\\|`).test(line));
  const lastCellOf = (row) => row.split('|').filter((c) => c.trim()).pop().trim();

  for (const value of NON_AUTHORIZING_CI) {
    const row = ciRow(value);
    check(
      `contract's CI table rules on ${value}`,
      Boolean(row),
      'the value must appear as a row in the authorization table',
    );
    if (row) {
      check(
        `contract denies shared merge on CI ${value}`,
        /^no$/i.test(lastCellOf(row)),
        `authorization column reads "${lastCellOf(row)}" — only PASS may authorise`,
      );
    }
  }

  const passRow = ciRow('PASS');
  check(
    "contract's CI table authorises PASS",
    Boolean(passRow) && /yes/i.test(lastCellOf(passRow)),
    'PASS must be the value that authorises a shared merge',
  );

  // COMPLETE_WITH_UNVERIFIED_CI must be explicitly barred from shared merges.
  const unverifiedRow = contract
    .split(/\r?\n/)
    .find((line) => line.includes('`COMPLETE_WITH_UNVERIFIED_CI`') && line.startsWith('|'));
  check(
    'COMPLETE_WITH_UNVERIFIED_CI is barred from shared integration',
    Boolean(unverifiedRow) && /never/i.test(unverifiedRow) && /shared/i.test(unverifiedRow),
    'the state must say it never applies to work integrated into a shared branch',
  );
}

/*
 * Denylist for the specific permissive constructions this gate replaced. The
 * table checks above prove the right rule is stated; these prove the old one is
 * not still sitting somewhere else contradicting it.
 */
const PERMISSIVE_CI_PHRASINGS = [
  /[Mm]erging on local gates alone is permitted/,
  /BLOCKED_BY_ACCESS[^.\n]{0,160}\b(?:permits?|allows?|authoris\w*|authoriz\w*)\b[^.\n]{0,60}merge/i,
  /COMPLETE_WITH_UNVERIFIED_CI[^.\n]{0,160}\bshared\b[^.\n]{0,80}\b(?:merge|permitted|allowed)\b/i,
  /cap the task at\s+`?COMPLETE_WITH_UNVERIFIED_CI/i,
];

for (const file of [
  '.agent/context/task-completion-contract.md',
  '.agent/agents/integrator.md',
  '.agent/agents/release-devops.md',
  'docs/development/agent-orchestration.md',
  'docs/development/ci.md',
  'AGENTS.md',
]) {
  if (!existsSync(join(ROOT, file))) continue;
  const body = read(file);
  for (const pattern of PERMISSIVE_CI_PHRASINGS) {
    check(
      `${file} does not permit merging a shared target on an unverified CI verdict`,
      !pattern.test(body),
      `matched ${pattern}`,
    );
  }
}

// The Integrator is the role that actually performs the merge.
if (existsSync(join(ROOT, '.agent/agents/integrator.md'))) {
  const integrator = read('.agent/agents/integrator.md');
  check('integrator classifies SHARED_TARGET', integrator.includes('SHARED_TARGET'));
  check('integrator declares BLOCKED_CI_UNVERIFIED', integrator.includes('BLOCKED_CI_UNVERIFIED'));
  check(
    'integrator requires a CI PASS for shared targets',
    /MERGE requires REMOTE_CI_STATUS = PASS/.test(integrator),
  );
  check(
    'integrator still permits pushing the task branch when CI is unreadable',
    /[Pp]ush the task branch anyway|always allowed/.test(integrator),
    'blocking the push too would lose the work and never start CI',
  );
}

// ------------------------------------------------------- learning capability

/*
 * The framework compounds only if lessons survive the session that produced
 * them. These checks verify the machinery is present and wired. They are
 * deliberately structural: prose quality is not mechanically checkable, and
 * pretending otherwise yields checks that pass while meaning nothing.
 */

const KNOWLEDGE_ARCH = '.agent/context/knowledge-architecture.md';
const knowledgeArchExists = existsSync(join(ROOT, KNOWLEDGE_ARCH));
check('knowledge architecture context present', knowledgeArchExists, KNOWLEDGE_ARCH);

if (knowledgeArchExists) {
  const body = read(KNOWLEDGE_ARCH);
  for (const system of ['Git', 'CI', 'QA', '.agent/context', 'docs/knowledge', 'Obsidian']) {
    check(`knowledge architecture defines the role of ${system}`, body.includes(system));
  }
  check(
    'knowledge architecture states code outranks Obsidian',
    /implementation truth/i.test(body),
    'the repository-vs-Obsidian authority rule must be explicit',
  );
  for (const classification of [
    'EXPECTED_CHANGE',
    'STALE_NOTE',
    'UNIMPLEMENTED_REQUIREMENT',
    'UNCLEAR_CONFLICT',
  ]) {
    check(`knowledge architecture defines ${classification}`, body.includes(classification));
  }
  check(
    'knowledge architecture forbids bulk-loading the vault',
    /entire vault|whole vault/i.test(body),
  );
  check('knowledge architecture defines OBSIDIAN_CONTEXT', body.includes('OBSIDIAN_CONTEXT'));
}

const FEEDBACK_CLASSES = [
  'TASK_SPECIFIC',
  'BUG_REGRESSION',
  'DOMAIN_RULE',
  'ARCHITECTURE_RULE',
  'UI_UX_RULE',
  'SECURITY_RULE',
  'PROCESS_RULE',
  'DOCUMENTATION_RULE',
  'NOT_DURABLE',
];

const FEEDBACK_SKILL = '.agent/skills/process-user-feedback.md';
if (existsSync(join(ROOT, FEEDBACK_SKILL))) {
  const body = read(FEEDBACK_SKILL);
  for (const cls of FEEDBACK_CLASSES) {
    check(`feedback skill classifies ${cls}`, body.includes(cls));
  }
} else {
  check('user feedback skill present', false, FEEDBACK_SKILL);
}

if (contractExists) {
  const contract = read(CONTRACT);
  check(
    'contract requires FEEDBACK_PROMOTION_STATUS',
    contract.includes('FEEDBACK_PROMOTION_STATUS'),
  );
  check('contract declares USER_FEEDBACK_CLASS', contract.includes('USER_FEEDBACK_CLASS'));
  /*
   * Ordering matters: a capture that runs before corrections are promoted
   * records the work and loses the lesson.
   */
  check(
    'contract promotes feedback before knowledge capture completes',
    contract.indexOf('FEEDBACK_PROMOTION_STATUS') < contract.indexOf('KNOWLEDGE_CAPTURE_STATUS'),
  );
}

if (existsSync(join(ROOT, 'docs/qa/README.md'))) {
  const qaReadme = read('docs/qa/README.md');
  check('QA documents the user-reported bug learning loop', /USER REPORTS BUG/i.test(qaReadme));
  check('QA requires root cause over symptom', /root cause/i.test(qaReadme));
  check(
    'QA requires proving a regression fails without the fix',
    /fails? without the fix|before the fix/i.test(qaReadme),
  );
}

if (existsSync(join(ROOT, '.agent/agents/qa.md'))) {
  const qa = read('.agent/agents/qa.md');
  check('QA loads previous QA runs', /previous QA runs/i.test(qa));
  check(
    'QA does not rerun every historical test',
    /[Dd]o not rerun every|[Ss]elect by affected module/i.test(qa),
  );
  for (const type of ['UNIT', 'INTEGRATION', 'BROWSER_E2E', 'DEPLOYMENT_SMOKE']) {
    check(`QA names the ${type} test type`, qa.includes(type));
  }
  check('QA records blocked database testing', qa.includes('BLOCKED_INFRASTRUCTURE'));
}

if (existsSync(join(ROOT, '.agent/agents/architect.md'))) {
  const architect = read('.agent/agents/architect.md');
  check(
    'architect declares RELEVANT_KNOWLEDGE_RETRIEVAL',
    architect.includes('RELEVANT_KNOWLEDGE_RETRIEVAL'),
  );
  check('architect asks whether this was already learned', /already learned/i.test(architect));
}

if (existsSync(join(ROOT, '.agent/agents/reviewer.md'))) {
  const reviewer = read('.agent/agents/reviewer.md');
  check('reviewer checks for reintroduced bug patterns', /reintroduce/i.test(reviewer));
  check('reviewer checks for undone user corrections', /user correction/i.test(reviewer));
  check('reviewer raises severity for repeated mistakes', /[Rr]aise the severity/i.test(reviewer));
}

if (existsSync(join(ROOT, '.agent/agents/integrator.md'))) {
  check(
    'integrator declares REMOTE_CI_ACCESS',
    read('.agent/agents/integrator.md').includes('REMOTE_CI_ACCESS'),
  );
}

const MATRIX = 'docs/development/agent-tooling-matrix.md';
if (existsSync(join(ROOT, MATRIX))) {
  const matrix = read(MATRIX);
  for (const capability of [
    'GIT',
    'REMOTE_GIT',
    'CI_READ',
    'CI_TRIGGER',
    'PR_MANAGEMENT',
    'BROWSER_AUTOMATION',
    'TEST_DATABASE',
    'DEPLOYMENT_API',
    'LOG_ACCESS',
    'MONITORING',
    'OBSIDIAN_READ',
    'OBSIDIAN_WRITE_SYNC',
  ]) {
    check(`tooling matrix tracks ${capability}`, matrix.includes(capability));
  }
} else {
  check('agent tooling matrix present', false, MATRIX);
}

if (existsSync(join(ROOT, '.agent/context/testing-architecture.md'))) {
  const testing = read('.agent/context/testing-architecture.md');
  check(
    'testing architecture forbids production as a test database',
    /[Nn]ever.{0,60}production database/s.test(testing),
  );
  check(
    'testing architecture ranks isolated database options',
    /[Ee]phemeral PostgreSQL/.test(testing),
  );
  check('testing architecture states browser tooling status', /BROWSER_E2E/.test(testing));
}

// Every role and orchestration document that can declare a task finished must
// point at the contract, or it will keep declaring it its own way.
const CONTRACT_REFERENCES = [
  'AGENTS.md',
  '.agent/agents/README.md',
  '.agent/agents/architect.md',
  '.agent/agents/qa.md',
  '.agent/agents/reviewer.md',
  '.agent/agents/integrator.md',
  '.agent/agents/release-devops.md',
  'docs/development/agent-orchestration.md',
];

for (const file of CONTRACT_REFERENCES) {
  if (!existsSync(join(ROOT, file))) continue;
  check(
    `${file} references the task completion contract`,
    read(file).includes('task-completion-contract'),
  );
}

/*
 * The specific regression: a document asserting when a task is complete, while
 * listing fewer gates than the contract. The old sentence — "complete only when
 * IMPLEMENTATION, REVIEW and QA are all complete" — is exactly this shape.
 */
const COMPLETENESS_CLAIM = /(?:task is complete|complete only when|is complete only)/gi;

for (const file of ['AGENTS.md', '.agent/agents/README.md', 'docs/development/agent-orchestration.md']) {
  if (!existsSync(join(ROOT, file))) continue;
  const body = read(file);

  for (const match of body.matchAll(COMPLETENESS_CLAIM)) {
    /*
     * Check the CLAIM, not the file. An earlier version of this asserted only
     * that the file mentioned all ten fields somewhere — which a compliant file
     * always does, so appending "a task is complete when implementation, review
     * and QA are done" passed cleanly. The window is what makes the claim
     * itself accountable.
     */
    const window = body.slice(match.index, match.index + 600);
    const namesFields = REQUIRED_COMPLETION_FIELDS.filter((f) => window.includes(f)).length;
    check(
      `${file} completeness claim at offset ${match.index} defers to the contract`,
      namesFields >= 5 || window.includes('task-completion-contract'),
      'a claim about task completeness must enumerate the contract fields or link the contract',
    );
  }
}

// The final report is where finalization becomes visible to a human.
const REPORT_TEMPLATE = 'docs/development/final-report-template.md';
if (existsSync(join(ROOT, REPORT_TEMPLATE))) {
  const template = read(REPORT_TEMPLATE);
  check('report template has a Task Finalization section', template.includes('## Task Finalization'));
  for (const field of [
    'TASK_STATUS',
    'TARGET_BRANCH',
    'TASK_BRANCH',
    'BASE_SHA',
    'FINAL_TASK_SHA',
    'MERGE_SHA',
    'FINAL_TARGET_SHA',
    'REMOTE_PUSH',
    'REMOTE_CI',
    'SHARED_TARGET',
    'MERGE_AUTHORIZATION',
    'POST_MERGE_VALIDATION',
    'QA_REPORT',
    'KNOWLEDGE_CAPTURE',
    'OBSIDIAN_SYNC',
    'WORKTREE_CLEANUP',
    'BRANCH_CLEANUP',
  ]) {
    check(`report template requires ${field}`, template.includes(field));
  }
}

// ------------------------------------------------------------------- secrets

/*
 * The file existing locally is normal and desired — that is how a developer
 * enables Obsidian sync. What must never happen is it being *tracked*, because
 * it holds a personal absolute path. Check tracking, not existence.
 */
function isTrackedByGit(relativePath) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', relativePath], {
      cwd: ROOT,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

check(
  'local Obsidian config is not tracked by git',
  !isTrackedByGit('.obsidian-sync.local.json'),
  'it holds a personal path — keep it gitignored',
);

check(
  '.gitignore covers the local Obsidian config',
  read('.gitignore').includes('.obsidian-sync.local.json'),
);

// The committed example must never carry a real path or credential.
if (existsSync(join(ROOT, '.obsidian-sync.example.json'))) {
  const example = read('.obsidian-sync.example.json');
  check(
    'example Obsidian config uses a placeholder vaultPath',
    example.includes('<') || !/"vaultPath"\s*:\s*"[A-Za-z]:[\\/]/.test(example),
    'looks like a real absolute path',
  );
}

// Cheap scan for obvious committed credentials in framework-owned files. Not a
// secret scanner — just a guard against the most common accident.
const CREDENTIAL_PATTERN =
  /postgres(?:ql)?:\/\/(?!ci:ci@|placeholder|user:password|<)[^\s"']{6,}/i;

for (const file of [
  ...markdownFilesIn('docs/deployment'),
  ...markdownFilesIn('.agent'),
  '.obsidian-sync.example.json',
]) {
  if (!existsSync(join(ROOT, file))) continue;
  if (CREDENTIAL_PATTERN.test(read(file))) {
    failures.push(`possible committed connection string in ${file}`);
    checks += 1;
  }
}

// -------------------------------------------------------------- script syntax

for (const script of [
  'scripts/sync-obsidian.mjs',
  'scripts/new-qa-run.mjs',
  'scripts/finalize-agent-task.mjs',
  'scripts/retrieve-knowledge.mjs',
]) {
  if (!existsSync(join(ROOT, script))) continue;
  const body = read(script);
  // Cheap structural sanity: these are ES modules and must not have been
  // truncated. Full parsing happens when CI actually runs them.
  check(`${script} is an ES module`, body.includes('import '));
  check(`${script} is not truncated`, body.trimEnd().length > 200);
}

// ------------------------------------------------------------------- reporting

if (warnings.length) {
  console.log('Warnings (non-blocking):');
  for (const warning of warnings) console.log(`  ! ${warning}`);
  console.log('');
}

if (failures.length) {
  console.error(`Framework validation FAILED — ${failures.length} of ${checks} checks:`);
  for (const failure of failures) console.error(`  x ${failure}`);
  process.exit(1);
}

console.log(`Framework validation passed — ${checks} checks.`);
