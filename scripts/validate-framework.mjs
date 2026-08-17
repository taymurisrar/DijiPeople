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
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
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

// -------------------------------------------------- database test capability

/*
 * Database work is the one area where mocked evidence looks identical to real
 * evidence: a mocked Prisma returns whatever it was told, so it can "prove" a
 * foreign key the schema does not have. These checks verify the real-database
 * path exists, and that nothing has quietly re-permitted testing against
 * production.
 */

const DB_GUARD = 'scripts/assert-test-database.mjs';
const DB_VERIFY = 'scripts/verify-database.mjs';

check('test-database guard present', existsSync(join(ROOT, DB_GUARD)), DB_GUARD);
check('database verification script present', existsSync(join(ROOT, DB_VERIFY)), DB_VERIFY);

if (existsSync(join(ROOT, DB_GUARD))) {
  const guard = read(DB_GUARD);
  // An allowlist fails closed for unknown hosts; a denylist fails open.
  check('guard requires a local or CI-service host', /LOCAL_HOSTS|localhost/.test(guard));
  check('guard rejects managed providers', /neon\.tech/.test(guard) && /render\.com/.test(guard));
  check('guard rejects production-like database names', /production/.test(guard));
}

if (existsSync(join(ROOT, DB_VERIFY))) {
  const verify = read(DB_VERIFY);
  check('verification uses migrate deploy', /prisma:migrate:deploy/.test(verify));
  check('verification asserts the target is disposable first', /assert-test-database/.test(verify));
  check('verification checks migrate status', /prisma:migrate:status/.test(verify));
  check('verification runs the seed configuration', /seed:config/.test(verify));
}

const CI_WORKFLOW = '.github/workflows/ci.yml';
if (existsSync(join(ROOT, CI_WORKFLOW))) {
  const ci = read(CI_WORKFLOW);
  check('CI declares a database migration job', /^\s{2}database-migration:/m.test(ci));
  check('CI runs an ephemeral postgres service', /image:\s*postgres:/.test(ci));
  check(
    'the database migration job is inside the required gate',
    /needs:[\s\S]{0,260}database-migration[\s\S]{0,60}build/.test(ci),
    'a database gate outside ci-required blocks nothing',
  );
  check(
    'no CI database job points at a managed provider',
    !/DATABASE_URL:.*(neon\.tech|render\.com|amazonaws|supabase)/.test(ci),
  );
  check('CI asserts the test database before migrating', /assert-test-database/.test(ci));
  check(
    'CI never runs prisma migrate dev',
    !/migrate:dev|migrate dev/.test(ci.replace(/^\s*#.*$/gm, '')),
    '`migrate dev` is interactive, can author migrations, and can reset the database',
  );
}

if (existsSync(join(ROOT, '.agent/agents/database.md'))) {
  const db = read('.agent/agents/database.md');
  for (const field of [
    'MIGRATION_STATIC_REVIEW',
    'FRESH_DB_MIGRATION',
    'DATABASE_INTEGRATION_TEST',
    'SEED_VALIDATION',
    'ROLLBACK_CLASSIFICATION',
    'DATA_COMPATIBILITY_CHECK',
  ]) {
    check(`database agent requires ${field}`, db.includes(field));
  }
  check('database agent declares DB_VALIDATION blocking', db.includes('DB_VALIDATION'));
  check(
    'database agent forbids production as a test target',
    /[Nn]ever.{0,80}production/s.test(db),
  );
}

if (existsSync(join(ROOT, '.agent/agents/integrator.md'))) {
  const integrator = read('.agent/agents/integrator.md');
  check('integrator declares DB_CI_STATUS', integrator.includes('DB_CI_STATUS'));
  check(
    'integrator names the schema files that trigger the DB gate',
    /schema\.prisma/.test(integrator),
  );
}

if (existsSync(join(ROOT, '.agent/agents/qa.md'))) {
  const qaDb = read('.agent/agents/qa.md');
  for (const cls of [
    'MIGRATION_FAILURE',
    'SEED_FAILURE',
    'CONSTRAINT_FAILURE',
    'E2E_PRODUCT_FAILURE',
    'TEST_INFRA_FAILURE',
    'TENANT_ISOLATION_FAILURE',
    'DATA_CLEANUP_FAILURE',
  ]) {
    check(`QA classifies ${cls}`, qaDb.includes(cls));
  }
  check('QA forbids recording credentials', /[Nn]ever record a connection string/.test(qaDb));
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
    'PARENT_TASK_STATUS',
    'WORK_PACKAGE_STATUS',
    'PRE_TASK_REPO_HEALTH',
    'POST_TASK_REPO_HEALTH',
    'MAIN_SYNC_STATUS',
    'LOCAL_MAIN_SHA',
    'ORIGIN_MAIN_SHA',
    'PR_STATUS',
    'DEPLOYMENT_STATUS',
    'DEPLOYMENT_DRIFT_STATUS',
    'STALE_WORKTREES',
    'STALE_BRANCHES',
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
  'scripts/rebuild-backlog.mjs',
  'scripts/new-bug.mjs',
  'scripts/new-backlog-item.mjs',
  'scripts/new-engineering-history.mjs',
  'scripts/generate-dashboards.mjs',
  'scripts/lib/backlog-records.mjs',
  'scripts/lib/obsidian-mappings.mjs',
]) {
  if (!existsSync(join(ROOT, script))) continue;
  const body = read(script);
  // Cheap structural sanity: these are ES modules and must not have been
  // truncated. Full parsing happens when CI actually runs them.
  check(`${script} is an ES module`, body.includes('import ') || body.includes('export '));
  check(`${script} is not truncated`, body.trimEnd().length > 200);
}

// ------------------------------------------- bug, backlog and history systems

/*
 * These exist because a QA finding that lives only in a chat report is lost
 * when the session ends, and the next agent working the same module has nothing
 * to read. The systems below are what make a finding durable; if any of them is
 * deleted or hollowed out, the learning loop silently reverts to prose.
 */

const RECORD_SYSTEM_PATHS = [
  'docs/bugs/README.md',
  'docs/backlog/README.md',
  'docs/backlog/index.md',
  'docs/backlog/open.md',
  'docs/backlog/blocked.md',
  'docs/backlog/deferred.md',
  'docs/backlog/product-decisions.md',
  'docs/backlog/completed.md',
  'docs/backlog/items',
  'docs/engineering-history/README.md',
  'docs/engineering-history/tasks',
  'docs/deployment/release-history/README.md',
  'scripts/rebuild-backlog.mjs',
  'scripts/new-bug.mjs',
  'scripts/new-backlog-item.mjs',
  'scripts/new-engineering-history.mjs',
  'scripts/generate-dashboards.mjs',
  'scripts/lib/backlog-records.mjs',
  'scripts/lib/obsidian-mappings.mjs',
];

for (const path of RECORD_SYSTEM_PATHS) {
  check(`required path present: ${path}`, existsSync(join(ROOT, path)));
}

// A bug system with no records is a folder, not a system.
const bugRecords = markdownFilesIn('docs/bugs').filter((f) => !f.endsWith('README.md'));
check('bug records exist', bugRecords.length > 0, `found ${bugRecords.length}`);
check(
  'bug record filenames carry their id',
  bugRecords.every((f) => /\/BUG-\d{4}-/.test(f)),
  'a record whose filename and ID can drift is a record you cannot find',
);

/*
 * The generated indexes must be **current**, not merely present. A stale index
 * is worse than none: people trust it, and it is wrong in the direction of
 * "nothing is outstanding".
 */
function runScript(relative, args = []) {
  try {
    /*
     * stdout is returned on success as well as on failure. It used to be
     * discarded, which made every check that inspected a successful script's
     * output fail against an empty string — a false negative that looks exactly
     * like the script being broken.
     */
    const stdout = execFileSync(process.execPath, [join(ROOT, relative), ...args], {
      cwd: ROOT,
      stdio: 'pipe',
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    return { ok: true, output: String(stdout ?? '') };
  } catch (error) {
    return { ok: false, output: String(error.stdout ?? '') + String(error.stderr ?? '') };
  }
}

if (existsSync(join(ROOT, 'scripts/rebuild-backlog.mjs'))) {
  const result = runScript('scripts/rebuild-backlog.mjs', ['--check']);
  check(
    'backlog records are valid and the indexes are current',
    result.ok,
    result.output.split('\n').filter(Boolean).slice(0, 6).join(' | '),
  );
}

if (existsSync(join(ROOT, 'scripts/generate-dashboards.mjs'))) {
  const result = runScript('scripts/generate-dashboards.mjs', ['--check']);
  check(
    'Obsidian dashboards are current',
    result.ok,
    result.output.split('\n').filter(Boolean).slice(0, 4).join(' | '),
  );
}

/*
 * Behavioural, not structural: build a throwaway record tree and confirm the
 * loader actually rejects a duplicate id and a malformed record. Asserting that
 * the source *mentions* those checks would pass just as happily after somebody
 * commented them out.
 */
if (existsSync(join(ROOT, 'scripts/lib/backlog-records.mjs'))) {
  const { loadRecords } = await import('./lib/backlog-records.mjs');

  const sandbox = mkdtempSync(join(tmpdir(), 'dijipeople-framework-'));
  const bugDir = join(sandbox, 'docs/bugs');
  mkdirSync(bugDir, { recursive: true });

  const valid = (id) =>
    [
      '---',
      `ID: ${id}`,
      'Title: probe',
      'Status: OPEN',
      'Severity: LOW',
      'Priority: P3',
      'Type: BUG',
      'Source: QA_RUN',
      'DetectedDate: 2026-01-01',
      'DetectedInSha: 0000000',
      'AffectedModules: []',
      'OwnerAgent: qa',
      'ArchitectDisposition: TRIAGE_REQUIRED',
      'QAReport:',
      'RegressionId:',
      'RelatedBacklogItem:',
      'RelatedDecision:',
      'RelatedImplementation:',
      'CreatedAt: 2026-01-01',
      'UpdatedAt: 2026-01-01',
      'ResolvedAt:',
      '---',
      '',
      '# probe',
      '',
    ].join('\n');

  writeFileSync(join(bugDir, 'BUG-9001-probe-a.md'), valid('BUG-9001'));
  check('a well-formed record set loads cleanly', loadRecords(sandbox).errors.length === 0);

  // Same id, different filename — the collision two agents can create.
  writeFileSync(join(bugDir, 'BUG-9001-probe-b.md'), valid('BUG-9001'));
  check(
    'duplicate record ids are rejected',
    loadRecords(sandbox).errors.some((e) => /duplicate id BUG-9001/.test(e)),
  );
  rmSync(join(bugDir, 'BUG-9001-probe-b.md'));

  writeFileSync(
    join(bugDir, 'BUG-9002-probe-malformed.md'),
    ['---', 'ID: BUG-9002', 'Title: probe', 'Status: WIBBLE', 'Severity: URGENT', '---', '', '# probe', ''].join('\n'),
  );
  const malformed = loadRecords(sandbox).errors;
  check(
    'an unknown Status is rejected',
    malformed.some((e) => /Status = "WIBBLE"/.test(e)),
  );
  check(
    'an unknown Severity is rejected',
    malformed.some((e) => /Severity = "URGENT"/.test(e)),
  );
  check(
    'missing required fields are rejected',
    malformed.some((e) => /missing required field/.test(e)),
  );

  // A record whose filename does not carry its id cannot be found by id.
  rmSync(join(bugDir, 'BUG-9002-probe-malformed.md'));
  writeFileSync(join(bugDir, 'BUG-9003-wrong-name.md'), valid('BUG-9004'));
  check(
    'an id that disagrees with its filename is rejected',
    loadRecords(sandbox).errors.some((e) => /filename must start with/.test(e)),
  );

  rmSync(sandbox, { recursive: true, force: true });
}

// ------------------------------------------------ the finding-classification loop

if (contractExists) {
  const contract = read(CONTRACT);
  for (const field of [
    'QA_FINDINGS_CLASSIFIED_STATUS',
    'BUG_RECORD_STATUS',
    'ARCHITECT_TRIAGE_STATUS',
    'BACKLOG_UPDATE_STATUS',
    'ENGINEERING_HISTORY_STATUS',
  ]) {
    check(`contract requires ${field}`, contract.includes(field));
  }
  /*
   * Prose wraps and carries backticks, so these patterns tolerate whitespace
   * and markup between words. Matching a contiguous sentence fails the moment
   * somebody reflows a paragraph, which teaches agents to fight the validator
   * rather than to keep the rule.
   */
  check(
    'contract forbids PASS while findings are unclassified',
    /is\s+not\s+permitted\s+while|zero\s+unclassified\s+findings/i.test(contract),
  );
  check(
    'contract keeps triage away from QA and the implementing specialist',
    /cannot\s+be\s+resolved\s+by\s+QA\s+or\s+by\s+the\s+implementing\s+\W*specialist/i.test(contract),
  );
}

if (existsSync(join(ROOT, '.agent/agents/qa.md'))) {
  const qa = read('.agent/agents/qa.md');
  check('QA creates durable bug records', qa.includes('scripts/new-bug.mjs'));
  check('QA checks the backlog before filing', qa.includes('docs/backlog/open.md'));
  for (const disposition of [
    'FIXED',
    'OPEN',
    'DEFERRED',
    'BLOCKED',
    'PRODUCT_DECISION',
    'ACCEPTED_RISK',
    'NOT_A_BUG',
    'DUPLICATE',
  ]) {
    check(`QA names the ${disposition} disposition`, qa.includes(disposition));
  }
  check(
    'QA may not pass with unclassified findings',
    /zero unclassified findings/i.test(qa),
  );
  check(
    'QA does not own prioritisation',
    /does \*\*not\*\* prioritise|not responsible for product prioritisation|does \*\*not\*\* set/i.test(qa),
  );
}

if (existsSync(join(ROOT, '.agent/agents/architect.md'))) {
  const architect = read('.agent/agents/architect.md');
  check('architect declares BACKLOG_PRECHECK', architect.includes('BACKLOG_PRECHECK'));
  check(
    'architect declares BACKLOG_POST_QA_TRIAGE',
    architect.includes('BACKLOG_POST_QA_TRIAGE'),
  );
  for (const block of [
    'KNOWN_ISSUES_TO_AVOID',
    'RELATED_OPEN_BACKLOG',
    'RELATED_REGRESSIONS',
    'RELATED_PRODUCT_DECISIONS',
  ]) {
    check(`architect produces ${block}`, architect.includes(block));
  }
  for (const disposition of [
    'FIX_NOW',
    'PLAN_REQUIRED',
    'DEFER',
    'PRODUCT_DECISION',
    'BLOCKED_EXTERNAL',
    'ACCEPTED_RISK',
  ]) {
    check(`architect can classify ${disposition}`, architect.includes(disposition));
  }
  check(
    'architect may never silently defer a CRITICAL',
    /never\*{0,2} be silently deferred|Deferring a CRITICAL/i.test(architect),
  );
}

/*
 * Specialists must retrieve the relevant defect history before writing code.
 * A defect already recorded and then reintroduced means the whole loop failed,
 * which is worse than the defect.
 */
for (const agent of ['backend-api', 'frontend', 'database', 'integration', 'ui-ux']) {
  const path = `.agent/agents/${agent}.md`;
  if (!existsSync(join(ROOT, path))) continue;
  const body = read(path);
  check(`${agent} produces KNOWN_MISTAKES_TO_AVOID`, body.includes('KNOWN_MISTAKES_TO_AVOID'));
  check(`${agent} retrieves open bug records`, body.includes('docs/bugs'));
  check(`${agent} retrieves related backlog items`, body.includes('docs/backlog'));
  check(
    `${agent} states that a recorded defect is not new information`,
    /not new information|REPEATED_REGRESSION/i.test(body),
  );
}

if (existsSync(join(ROOT, '.agent/agents/reviewer.md'))) {
  const reviewer = read('.agent/agents/reviewer.md');
  check('reviewer flags REPEATED_REGRESSION', reviewer.includes('REPEATED_REGRESSION'));
  check('reviewer compares against existing bug records', reviewer.includes('docs/bugs'));
  check('reviewer checks open backlog records', reviewer.includes('docs/backlog/open.md'));
  check(
    'reviewer catches findings QA did not classify',
    /QA did not classify/i.test(reviewer),
  );
}

if (existsSync(join(ROOT, '.agent/agents/integrator.md'))) {
  const integrator = read('.agent/agents/integrator.md');
  check(
    'integrator owns the engineering-history record',
    integrator.includes('docs/engineering-history'),
  );
  check(
    'integrator records conflict resolutions, not just conflicts',
    /Conflict Resolutions/i.test(integrator),
  );
  check(
    'integrator separates Git history from deployed state',
    /not deployed state|documents deployed state/i.test(integrator),
  );
}

if (existsSync(join(ROOT, '.agent/agents/release-devops.md'))) {
  const release = read('.agent/agents/release-devops.md');
  check(
    'release records live under release-history',
    release.includes('docs/deployment/release-history'),
  );
  check(
    'release records reference bugs and backlog',
    /Backlog\/Bug References/i.test(release),
  );
  check(
    'release outcomes may only be populated by real evidence',
    /NOT_OBSERVED|Only real evidence/i.test(release),
  );
}

// ------------------------------------------------------ Obsidian publication

const MAPPINGS = 'scripts/lib/obsidian-mappings.mjs';
if (existsSync(join(ROOT, MAPPINGS))) {
  const mappings = read(MAPPINGS);
  for (const source of [
    'docs/bugs',
    'docs/backlog',
    'docs/engineering-history/tasks',
    'docs/deployment/release-history',
    'docs/knowledge/dashboards',
    'docs/knowledge/product',
    'docs/knowledge/architecture',
    'docs/knowledge/modules',
    'docs/knowledge/requirements',
    'docs/knowledge/decisions',
    'docs/qa/runs',
    'docs/qa/regressions',
    'docs/qa/known-bug-patterns',
    'docs/tasks',
  ]) {
    check(`Obsidian sync maps ${source}`, mappings.includes(`'${source}'`));
  }
  check(
    'the empty-note policy exists',
    /hasMeaningfulContent/.test(mappings) && /meaningfulContent/.test(mappings),
    'a generated note with no content fills a folder and answers a search with silence',
  );
  check(
    'config mappings add to the defaults rather than replacing them',
    /resolveMappings/.test(mappings) && /replaceMappings/.test(mappings),
    'a stale local config must not be able to un-publish knowledge',
  );
}

if (existsSync(join(ROOT, 'scripts/sync-obsidian.mjs'))) {
  const sync = read('scripts/sync-obsidian.mjs');
  check('sync applies the empty-note policy', sync.includes('hasMeaningfulContent'));
  check('sync reports what it would create, update and skip', sync.includes('NOTES_SKIPPED_NO_EVIDENCE'));
  check('sync states that manual notes are untouched', sync.includes('MANUAL_NOTES_UNTOUCHED'));
  check(
    'sync writes only into mapped agent-owned folders',
    /writes only into the mapped/i.test(sync),
  );
}

if (existsSync(join(ROOT, 'scripts/retrieve-knowledge.mjs'))) {
  const retrieve = read('scripts/retrieve-knowledge.mjs');
  check('retrieval searches bug records', retrieve.includes("'docs/bugs'"));
  check('retrieval searches the backlog', retrieve.includes("'docs/backlog/items'"));
  check('retrieval excludes empty bootstrap notes', retrieve.includes('hasMeaningfulContent'));
  check('retrieval excludes templates and folder READMEs', /isScaffolding/.test(retrieve));
  check(
    'retrieval derives its exclusions from the shared mapping table',
    retrieve.includes('agentOwnedVaultPaths'),
    'deriving them from the local config silently disabled the dedup once already',
  );
}

if (existsSync(join(ROOT, KNOWLEDGE_ARCH))) {
  const body = read(KNOWLEDGE_ARCH);
  check('knowledge architecture documents the bug system', body.includes('docs/bugs'));
  check('knowledge architecture documents the backlog', body.includes('docs/backlog'));
  check(
    'knowledge architecture documents engineering history',
    body.includes('docs/engineering-history'),
  );
  check(
    'knowledge architecture states manual notes are user-owned',
    /User-owned|user-owned/.test(body) && /never write/i.test(body),
  );
  check(
    'knowledge architecture keeps bug records out of the context layer',
    /Do not copy bug records into/i.test(body),
    'specialists retrieve them dynamically; the context layer is the fast path',
  );
}

const DASHBOARD_DIR = 'docs/knowledge/dashboards';
for (const dashboard of [
  `${DASHBOARD_DIR}/DijiPeople Engineering Dashboard.md`,
  `${DASHBOARD_DIR}/DijiPeople Product Dashboard.md`,
]) {
  const exists = existsSync(join(ROOT, dashboard));
  check(`dashboard present: ${dashboard}`, exists);
  if (!exists) continue;
  const body = read(dashboard);
  check(
    `${dashboard} declares itself generated`,
    /Generated file — do not edit by hand/.test(body),
  );
}

if (existsSync(join(ROOT, `${DASHBOARD_DIR}/DijiPeople Engineering Dashboard.md`))) {
  const body = read(`${DASHBOARD_DIR}/DijiPeople Engineering Dashboard.md`);
  for (const section of [
    'Open Critical Bugs',
    'Open High Bugs',
    'Product Decisions Needed',
    'Blocked Items',
    'Current Test Gaps',
    'Current Infrastructure Gaps',
    'Recently Fixed Bugs',
    'Recent QA Runs',
    'Recent Implementations',
    'Recent Releases',
    'Active / Recent Backlog',
    'Key Architecture Decisions',
    'Knowledge Health',
  ]) {
    check(`engineering dashboard has the ${section} section`, body.includes(`## ${section}`));
  }
}

/*
 * Graph quality, as a warning rather than a failure. An unresolved wikilink is
 * often deliberate — it marks a note worth writing — so failing on it would
 * push agents towards writing hollow notes to satisfy a link, which is exactly
 * what the empty-note policy exists to prevent.
 */
{
  const noteNames = new Set();
  for (const dir of ['docs', '.agent']) {
    for (const file of markdownFilesIn(dir)) {
      noteNames.add(basename(file, '.md').toLowerCase());
    }
  }

  const unresolved = new Map();
  for (const dir of ['docs/bugs', 'docs/backlog/items', 'docs/knowledge']) {
    for (const file of markdownFilesIn(dir)) {
      for (const match of read(file).matchAll(/\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]/g)) {
        const target = match[1].trim().toLowerCase();
        /*
         * Record ids resolve through the `aliases:` frontmatter in the vault.
         * Task, session, plan and scenario records emit the same alias line, so
         * they resolve the same way — the filename carries a slug the id does
         * not, and linking by id is what keeps a rename from breaking a link.
         */
        if (/^(bug|item|task|session|plan)-\d{3,4}$/.test(target)) continue;
        if (/^qa-[a-z0-9]+-\d{3}$/.test(target)) continue;
        if (/^reg-\d{3}$/.test(target)) continue;
        if (noteNames.has(target)) continue;
        unresolved.set(target, (unresolved.get(target) ?? 0) + 1);
      }
    }
  }

  checks += 1;
  if (unresolved.size) {
    const worst = [...unresolved.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    warn(
      `${unresolved.size} unresolved wikilink target(s) — ` +
        worst.map(([t, n]) => `${t} (${n})`).join(', '),
    );
  }

  /*
   * ITEM-0029 — every record carries the `aliases:` line that makes its bare-id
   * wikilink resolve.
   *
   * The check above deliberately skips `[[BUG-0031]]`-style targets, because
   * those resolve through frontmatter rather than a filename. That skip is what
   * made this invisible: a record missing its `aliases:` line has every
   * short-form link to it dead in the vault, and a dead wikilink renders as
   * ordinary text rather than announcing itself.
   *
   * Both generators now emit the line, so this guards hand-written records and
   * any future edit to either template.
   */
  const withoutAliases = [];
  for (const dir of ['docs/bugs', 'docs/backlog/items']) {
    for (const file of markdownFilesIn(dir)) {
      const name = file.split(/[\\/]/).pop() ?? '';
      const idMatch = /^(BUG|ITEM)-\d{4}/.exec(name);
      if (!idMatch) continue;

      const source = read(file);
      const declared = /^aliases: \[([^\]]*)\]/m.exec(source);
      if (!declared) {
        withoutAliases.push(`${name} — no aliases line`);
        continue;
      }
      // Present but wrong is worse than absent, because it looks deliberate.
      if (!declared[1].split(',').some((alias) => alias.trim() === idMatch[0])) {
        withoutAliases.push(`${name} — aliases does not list ${idMatch[0]}`);
      }
    }
  }

  check(
    'Every bug and backlog record is reachable by its bare id in Obsidian',
    withoutAliases.length === 0,
    withoutAliases.slice(0, 6).join('; '),
  );

  /*
   * ITEM-0011 — an absence claim that has stopped being true.
   *
   * Validation already fails when a context document *references* a file that
   * does not exist. The inverse is invisible, and has already happened: the
   * testing-architecture context stated that two e2e suites did not exist while
   * both did (BUG-0023), and nothing noticed for weeks.
   *
   * The item is explicit that this must stay narrow — "a check that tries to
   * interpret prose will produce false failures, and a validation nobody trusts
   * gets bypassed, which is worse than not having it." So no English is parsed.
   * A document that wants to assert absence declares it:
   *
   *     <!-- absent: services/api/test/some-suite.e2e-spec.ts -->
   *
   * and this fails the moment that path appears. Prose stays prose; only the
   * marker is load-bearing, and a claim with no marker is simply not checked —
   * which is the same coverage as today, never worse.
   */
  const brokenAbsenceClaims = [];
  for (const dir of ['.agent/context', 'docs']) {
    for (const file of markdownFilesIn(dir)) {
      /*
       * Code spans are stripped first — fenced blocks and inline backticks
       * both. A document explaining the marker convention has to show one, and
       * matching that would make documenting the check trip the check. Which is
       * exactly what happened when this landed: ITEM-0011's own record failed
       * validation twice, once for a fenced example and once for an inline one.
       *
       * So a marker only counts as a claim when it is written as a real HTML
       * comment in the document body, which is the only place it does anything.
       */
      const prose = read(file)
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`[^`\n]*`/g, '');

      for (const match of prose.matchAll(/<!--\s*absent:\s*([^\s>]+)\s*-->/g)) {
        const claimed = match[1].trim();
        if (existsSync(join(ROOT, claimed))) {
          brokenAbsenceClaims.push(
            `${file.split(/[\\/]/).pop()} claims ${claimed} is absent, but it exists`,
          );
        }
      }
    }
  }

  check(
    'No document claims a file is absent while it exists',
    brokenAbsenceClaims.length === 0,
    brokenAbsenceClaims.slice(0, 5).join('; '),
  );
}

// ------------------------------------------ routing, orchestration, repo health

/*
 * The framework gained keyword routing, parent-task decomposition, automatic
 * continuation between work packages, and protected-branch recovery.
 *
 * Prose alone would not have caught the specific failure these exist to
 * prevent: an orchestrator that stops after one work package to ask permission,
 * or one that treats a GH006 push rejection as terminal and leaves local main
 * stuck ahead. So the structural checks below are paired with **behavioural
 * simulations** further down — a rule that has never been executed is a rule
 * nobody has tested.
 */

const ROUTER = '.agent/context/task-router.md';
const ORCHESTRATION = '.agent/context/task-orchestration.md';
const REPO_HEALTH = '.agent/context/repository-health.md';

for (const path of [ROUTER, ORCHESTRATION, REPO_HEALTH]) {
  check(`required path present: ${path}`, existsSync(join(ROOT, path)));
}

/* Every keyword the user can type must route to something. */
const TASK_KEYWORDS = [
  'BUG',
  'FEATURE',
  'UI/UX',
  'QA',
  'E2E',
  'ARCHITECTURE',
  'DATABASE',
  'INTEGRATION',
  'SECURITY',
  'PERFORMANCE',
  'RELEASE',
  'DEPLOY',
  'HOTFIX',
  'BACKLOG',
  'KNOWLEDGE',
  'FRAMEWORK',
  'AUDIT',
];

if (existsSync(join(ROOT, ROUTER))) {
  const router = read(ROUTER);

  for (const keyword of TASK_KEYWORDS) {
    check(`router handles the ${keyword} keyword`, router.includes(`\`${keyword}\``));
  }

  /*
   * Prose wraps. These patterns tolerate whitespace between words for the same
   * reason the contract checks do: matching a contiguous sentence fails the
   * moment somebody reflows a paragraph, which teaches agents to fight the
   * validator rather than to keep the rule.
   */
  check(
    'router states that DijiPeople Task: activates the whole framework',
    /DijiPeople Task:/.test(router) &&
      /complete\s+DijiPeople\s+autonomous\s+engineering\s+framework/i.test(router),
  );
  check(
    'router keeps one unified lifecycle rather than per-keyword workflows',
    /not.{0,40}separate workflows?|↛\s*a different lifecycle|one unified lifecycle/i.test(router),
    'per-keyword workflows are how a hotfix path ends up skipping CI',
  );
  check(
    'router infers a type when no keyword is given',
    /[Nn]atural language inference/.test(router) && /Infer/.test(router),
  );
  check(
    'router tolerates an unrecognised keyword',
    /unrecognised keyword is not an error/i.test(router),
    'rejecting an unknown keyword forces the user to memorise the table',
  );
  check(
    'router states that a keyword never weakens a gate',
    /What routing never changes/i.test(router) && /HOTFIX/.test(router),
  );
  check('router defines a per-type definition of done', /Definition of done, by task type/i.test(router));

  /* The two routing examples the request named explicitly. */
  check(
    'router routes "fix the tenant provisioning retry" to BUG',
    /tenant provisioning retry[^|]*\|\s*`BUG`/.test(router),
  );
  check(
    'router routes "improve payroll UI" to UI/UX + FEATURE',
    /improve payroll UI[^|]*\|\s*`UI\/UX`\s*\+\s*`FEATURE`/.test(router),
  );
}

if (existsSync(join(ROOT, ORCHESTRATION))) {
  const orchestration = read(ORCHESTRATION);

  for (const size of ['SMALL', 'MEDIUM', 'LARGE', 'PROGRAM']) {
    check(`orchestration defines task size ${size}`, orchestration.includes(size));
  }
  check(
    'orchestration forbids sizing by file count',
    /never by file count|not.{0,20}file count/i.test(orchestration),
  );
  for (const status of ['NOT_STARTED', 'READY', 'IN_PROGRESS', 'QA', 'CI', 'MERGING', 'DONE', 'BLOCKED']) {
    check(`orchestration defines work package status ${status}`, orchestration.includes(status));
  }
  for (const reason of [
    'OWNER_DECISION_REQUIRED',
    'BLOCKED_EXTERNAL',
    'UNRECOVERABLE_TOOL_FAILURE',
    'SAFETY_BLOCK',
  ]) {
    check(`orchestration defines block reason ${reason}`, orchestration.includes(reason));
  }
  check(
    'orchestration forbids asking permission to continue',
    /[Dd]o not ask.{0,40}would you like me to continue/is.test(orchestration),
    'this is the specific phrasing that turns a task into a conversation',
  );
  check(
    'orchestration continues independent work when one package blocks',
    /never stops an independent one/i.test(orchestration),
  );
  check('orchestration declares SCOPE_EXPANSION_DETECTED', orchestration.includes('SCOPE_EXPANSION_DETECTED'));
  check(
    'orchestration defines the assumption register',
    ['ASSUMPTION_ID', 'STATEMENT', 'EVIDENCE', 'CONFIDENCE', 'IMPACT_IF_WRONG'].every((field) =>
      orchestration.includes(field),
    ),
  );
  check(
    'orchestration keeps verifiable facts out of owner decisions',
    /assumption\s+to\s+be\s+verified,\s+not\s+a\s+question\s+to\s+be\s+asked/i.test(orchestration),
  );
  check(
    'orchestration defines the concise progress format',
    /DijiPeople Task Progress/.test(orchestration) &&
      ['Completed:', 'Current:', 'Next:', 'Blocked:', 'Owner decisions:', 'Main:', 'Deployment:'].every(
        (heading) => orchestration.includes(heading),
      ),
  );
  check(
    'orchestration keeps the database single-writer',
    /[Dd]atabase.{0,40}single.?writer|single writer/i.test(orchestration),
  );
  for (const field of [
    'IMPLEMENTED',
    'CHANGED_BEHAVIOR',
    'RISK_AREAS',
    'KNOWN_MISTAKES_AVOIDED',
    'TESTS_ADDED',
    'TEST_HOOKS',
    'UNRESOLVED',
  ]) {
    check(`orchestration defines handoff field ${field}`, orchestration.includes(field));
  }
}

if (existsSync(join(ROOT, REPO_HEALTH))) {
  const health = read(REPO_HEALTH);

  for (const state of [
    'SYNCED',
    'AHEAD',
    'BEHIND',
    'DIVERGED',
    'PUSH_BLOCKED_BY_POLICY',
    'PUSH_FAILED',
    'FETCH_FAILED',
    'MERGE_PENDING',
    'UNKNOWN',
  ]) {
    check(`repository health defines MAIN_SYNC_STATUS ${state}`, health.includes(state));
  }
  check(
    'repository health declares PROTECTED_BRANCH_REQUIRES_PR',
    health.includes('PROTECTED_BRANCH_REQUIRES_PR'),
  );
  check(
    'repository health treats a protected-branch rejection as recoverable',
    /recoverable policy outcome, not an error/i.test(health),
    'treating GH006 as terminal is what leaves local main stuck ahead',
  );
  check('repository health recognises the GH006 rejection', /GH006/.test(health));
  check(
    'repository health forbids force-pushing the protected branch',
    /[Nn]ever force.?push/i.test(health),
  );
  check(
    'repository health forbids blind cherry-picking during recovery',
    /[Nn]ever cherry-pick blindly/i.test(health),
  );
  check(
    'repository health requires verifying no commits were lost',
    /no commits were lost|commits were lost/i.test(health),
  );
  check(
    'repository health requires SYNCED as the terminal state',
    /only acceptable terminal state/i.test(health),
  );
  for (const field of [
    'PRE_TASK_REPO_HEALTH',
    'POST_TASK_REPO_HEALTH',
    'STALE_WORKTREES',
    'DEPLOYMENT_DRIFT',
  ]) {
    check(`repository health declares ${field}`, health.includes(field));
  }
  for (const drift of [
    'IN_SYNC',
    'RELEASE_PENDING',
    'DRIFT_DETECTED',
    'DEPLOY_FAILED',
    'ROLLBACK_REQUIRED',
  ]) {
    check(`repository health classifies deployment drift ${drift}`, health.includes(drift));
  }
  check(
    'repository health forbids inferring deployed state from a merge',
    /[Nn]ever report an environment as current|a merge is Git state, not deployed state/i.test(health),
  );
  check(
    'repository health protects unmerged and human branches from cleanup',
    /Never delete/i.test(health) && /unmerged/i.test(health),
  );
}

/* The contract must carry the new fields, and the terminal invariant. */
if (contractExists) {
  const contract = read(CONTRACT);
  for (const field of [
    'PARENT_TASK_STATUS',
    'WORK_PACKAGE_STATUS',
    'PRE_TASK_REPO_HEALTH',
    'POST_TASK_REPO_HEALTH',
    'MAIN_SYNC_STATUS',
    'PR_STATUS',
    'DEPLOYMENT_STATUS',
    'DEPLOYMENT_DRIFT_STATUS',
  ]) {
    check(`contract requires ${field}`, contract.includes(field));
  }
  check(
    'contract requires MAIN_SYNC_STATUS = SYNCED after a substantial task',
    /MAIN_SYNC_STATUS\s*=?\s*`?SYNCED/.test(contract),
  );
  check(
    'contract forbids leaving repository state unresolved silently',
    /may remain silently|remain silently/i.test(contract),
  );
}

/* The roles that must actually perform this behaviour. */
if (existsSync(join(ROOT, '.agent/agents/architect.md'))) {
  const architect = read('.agent/agents/architect.md');
  check('architect declares TASK_ROUTING', architect.includes('TASK_ROUTING'));
  check('architect is named the task orchestrator', /main task orchestrator/i.test(architect));
  check(
    'architect declares WORK_PACKAGE_DECOMPOSITION',
    architect.includes('WORK_PACKAGE_DECOMPOSITION'),
  );
  check('architect declares ASSUMPTION_REGISTER', architect.includes('ASSUMPTION_REGISTER'));
  check(
    'architect must not ask permission to continue',
    /[Dd]o not ask.{0,40}would you like me to continue/is.test(architect),
  );
  check('architect declares SCOPE_EXPANSION_DETECTED', architect.includes('SCOPE_EXPANSION_DETECTED'));
}

if (existsSync(join(ROOT, '.agent/agents/integrator.md'))) {
  const integrator = read('.agent/agents/integrator.md');
  check(
    'integrator declares PROTECTED_BRANCH_REQUIRES_PR',
    integrator.includes('PROTECTED_BRANCH_REQUIRES_PR'),
  );
  check('integrator declares MAIN_SYNC_STATUS', integrator.includes('MAIN_SYNC_STATUS'));
  check(
    'integrator owns the PR lifecycle without being asked',
    /never creates or merges a PR by hand|PR lifecycle — owned automatically/i.test(integrator),
  );
  check(
    'integrator does not stop at "waiting on CI"',
    /not a place to stop|is a status, not an outcome/i.test(integrator),
  );
  check(
    'integrator never force-pushes during recovery',
    /[Nn]ever force-push `?main/i.test(integrator),
  );
}

if (existsSync(join(ROOT, '.agent/agents/release-devops.md'))) {
  const release = read('.agent/agents/release-devops.md');
  check(
    'release/devops owns repository hygiene on every substantial task',
    /Repository hygiene is mandatory/i.test(release),
  );
  for (const field of [
    'PRE_TASK_REPO_HEALTH',
    'POST_TASK_REPO_HEALTH',
    'MAIN_SYNC_STATUS',
    'STALE_BRANCHES',
    'STALE_WORKTREES',
    'UNFINISHED_GIT_OPERATIONS',
    'DEPLOYMENT_DRIFT',
  ]) {
    check(`release/devops declares ${field}`, release.includes(field));
  }
  check(
    'release/devops detects but does not act on repository state',
    /detects and classifies; the Integrator acts/i.test(release),
    'a role that acts on its own diagnosis has no check on a wrong diagnosis',
  );
  check(
    'release/devops declares DEPLOYMENT_DRIFT_STATUS',
    release.includes('DEPLOYMENT_DRIFT_STATUS'),
  );
  check(
    'release/devops refuses to invent deployment APIs',
    /do\s+not\s+invent\s+deployment\s+APIs/i.test(release),
  );
}

const TASK_SYSTEM_PATHS = [
  'docs/tasks/README.md',
  'docs/tasks/index.md',
  'docs/tasks/active.md',
  'docs/tasks/blocked.md',
  'docs/tasks/completed.md',
  'scripts/new-task.mjs',
  'scripts/rebuild-tasks.mjs',
  'scripts/repo-health.mjs',
  'scripts/lib/task-records.mjs',
];

for (const path of TASK_SYSTEM_PATHS) {
  check(`required path present: ${path}`, existsSync(join(ROOT, path)));
}

for (const script of ['scripts/new-task.mjs', 'scripts/rebuild-tasks.mjs', 'scripts/repo-health.mjs', 'scripts/lib/task-records.mjs']) {
  if (!existsSync(join(ROOT, script))) continue;
  const body = read(script);
  check(`${script} is an ES module`, body.includes('import ') || body.includes('export '));
  check(`${script} is not truncated`, body.trimEnd().length > 200);
}

/* repo-health.mjs must stay a reporter. An acting diagnostic is the hazard. */
if (existsSync(join(ROOT, 'scripts/repo-health.mjs'))) {
  const health = read('scripts/repo-health.mjs');
  check(
    'repo-health reports rather than acts',
    /\*\*reports only\*\*|It \*\*reports only\*\*/i.test(health),
  );
  for (const forbidden of [
    /execFileSync\('git', \['push'/,
    /execFileSync\('git', \['reset'/,
    /execFileSync\('git', \['merge'/,
    /execFileSync\('git', \['branch', '-[dD]'/,
    /execFileSync\('git', \['worktree', 'remove'/,
  ]) {
    check(
      `repo-health does not mutate the repository (${forbidden.source.slice(0, 40)})`,
      !forbidden.test(health),
      'every mutation stays with the Integrator, which reads the evidence first',
    );
  }
  check('repo-health computes MAIN_SYNC_STATUS', health.includes('MAIN_SYNC_STATUS'));
  check(
    'repo-health never proposes deleting an unmerged branch',
    /unmergedBranches/.test(health) && /NEVER delete/.test(health),
  );
}

if (existsSync(join(ROOT, 'scripts/rebuild-tasks.mjs'))) {
  const result = runScript('scripts/rebuild-tasks.mjs', ['--check']);
  check(
    'task records are valid and the indexes are current',
    result.ok,
    result.output.split('\n').filter(Boolean).slice(0, 6).join(' | '),
  );
}

// ------------------------------------------------- behavioural simulations

/*
 * Structural checks prove the rules are *written*. These prove they are
 * *executable*: build throwaway task records and confirm the loader rejects the
 * states that would silently break automatic continuation, and that the
 * continuation calculation itself picks the right next package.
 *
 * Asserting that the source merely *mentions* dependency resolution would pass
 * just as happily after somebody inverted the comparison.
 */
if (existsSync(join(ROOT, 'scripts/lib/task-records.mjs'))) {
  const { loadTasks, readyPackages, isFullyBlocked, parseWorkPackages } = await import(
    './lib/task-records.mjs'
  );

  const sandbox = mkdtempSync(join(tmpdir(), 'dijipeople-tasks-'));
  const taskDir = join(sandbox, 'docs/tasks');
  mkdirSync(taskDir, { recursive: true });

  const WP_HEADER = [
    '| WP_ID | TITLE | STATUS | DEPENDENCIES | AGENTS | BRANCH | SHA | QA_STATUS | BUGS | CI_STATUS | MERGE_STATUS |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
  ];

  const taskRecord = (id, packages, overrides = {}) =>
    [
      '---',
      `TASK_ID: ${id}`,
      'TITLE: probe',
      `TYPE: ${overrides.type ?? 'FEATURE'}`,
      `SIZE: ${overrides.size ?? 'LARGE'}`,
      `STATUS: ${overrides.status ?? 'IN_PROGRESS'}`,
      'PRIORITY: P1',
      'CREATED_AT: 2026-01-01',
      'AFFECTED_MODULES: []',
      'AGENTS: [architect]',
      'DEPENDENCIES:',
      `CURRENT_PACKAGE: ${overrides.current ?? ''}`,
      `COMPLETED_PACKAGES: [${(overrides.completed ?? []).join(', ')}]`,
      'BLOCKED_PACKAGES: []',
      'OWNER_DECISIONS: 0',
      `FINAL_STATUS: ${overrides.finalStatus ?? ''}`,
      '---',
      '',
      `# ${id} — probe`,
      '',
      '## Work Packages',
      '',
      ...WP_HEADER,
      ...packages,
      '',
      '## History',
      '',
      '- 2026-01-01 — probe.',
      '',
    ].join('\n');

  const wp = (id, status, dependencies = '—') =>
    `| ${id} | probe ${id} | ${status} | ${dependencies} | architect | agent/probe | — | — | — | — | — |`;

  /* 4 — a LARGE task must carry a decomposition. */
  writeFileSync(join(taskDir, 'TASK-9001-probe.md'), taskRecord('TASK-9001', []));
  check(
    'a LARGE task with no work packages is rejected',
    loadTasks(sandbox).errors.some((e) => /requires a decomposed Work Packages table/.test(e)),
    'an undecomposed large task cannot be continued automatically',
  );

  writeFileSync(
    join(taskDir, 'TASK-9001-probe.md'),
    taskRecord('TASK-9001', [wp('WP-01', 'DONE'), wp('WP-02', 'NOT_STARTED', 'WP-01')], {
      completed: ['WP-01'],
      current: 'WP-02',
    }),
  );
  const loaded = loadTasks(sandbox);
  check('a well-formed task record loads cleanly', loaded.errors.length === 0, loaded.errors.join(' | '));

  /* 5 — continuation picks the dependency-satisfied package, and only that. */
  {
    const task = loaded.tasks[0];
    check('work packages parse out of the body table', task.packages.length === 2);
    const ready = readyPackages(task);
    check(
      'continuation selects the next dependency-satisfied package',
      ready.length === 1 && ready[0].id === 'WP-02',
      `got ${ready.map((p) => p.id).join(', ') || 'nothing'}`,
    );
    check('a task with ready work is not reported as fully blocked', !isFullyBlocked(task));
  }

  /*
   * A package whose dependency is unfinished must NOT become READY.
   *
   * WP-01 is IN_PROGRESS — already running, so not "ready to start" either.
   * The correct result is that nothing is ready: WP-02 waits, and the
   * orchestrator does not start a second package on top of an unfinished
   * dependency.
   */
  {
    const task = {
      packages: parseWorkPackages(
        ['## Work Packages', '', ...WP_HEADER, wp('WP-01', 'IN_PROGRESS'), wp('WP-02', 'NOT_STARTED', 'WP-01')].join(
          '\n',
        ),
      ),
    };
    const ready = readyPackages(task);
    check(
      'a package whose dependency is unfinished is not READY',
      !ready.some((p) => p.id === 'WP-02'),
      `WP-02 became ready while WP-01 was still IN_PROGRESS`,
    );
    check(
      'an already-running package is not offered as ready to start',
      !ready.some((p) => p.id === 'WP-01'),
      `got ${ready.map((p) => p.id).join(', ') || 'nothing'}`,
    );
  }

  /* 7 — one blocked package must not stall an independent one. */
  {
    const task = {
      packages: parseWorkPackages(
        ['## Work Packages', '', ...WP_HEADER, wp('WP-01', 'BLOCKED'), wp('WP-02', 'NOT_STARTED')].join('\n'),
      ),
    };
    check(
      'an independent package stays runnable while another is blocked',
      readyPackages(task).some((p) => p.id === 'WP-02'),
    );
    check('a task with one blocked and one runnable package is not fully blocked', !isFullyBlocked(task));
  }

  /* Only when everything unfinished is blocked does the task genuinely stop. */
  {
    const task = {
      packages: parseWorkPackages(
        ['## Work Packages', '', ...WP_HEADER, wp('WP-01', 'DONE'), wp('WP-02', 'BLOCKED')].join('\n'),
      ),
    };
    check('a task whose every remaining package is blocked is fully blocked', isFullyBlocked(task));
  }

  /* The record and the orchestrator must not disagree about what is left. */
  writeFileSync(
    join(taskDir, 'TASK-9001-probe.md'),
    taskRecord('TASK-9001', [wp('WP-01', 'IN_PROGRESS')], { completed: ['WP-01'] }),
  );
  check(
    'COMPLETED_PACKAGES disagreeing with the table is rejected',
    loadTasks(sandbox).errors.some((e) => /COMPLETED_PACKAGES lists WP-01 but its status is/.test(e)),
  );

  writeFileSync(
    join(taskDir, 'TASK-9001-probe.md'),
    taskRecord('TASK-9001', [wp('WP-01', 'IN_PROGRESS')], { status: 'COMPLETE', finalStatus: 'COMPLETE' }),
  );
  check(
    'a COMPLETE task with unfinished packages is rejected',
    loadTasks(sandbox).errors.some((e) => /STATUS COMPLETE while WP-01/.test(e)),
  );

  writeFileSync(
    join(taskDir, 'TASK-9001-probe.md'),
    taskRecord('TASK-9001', [wp('WP-01', 'NOT_STARTED', 'WP-99')]),
  );
  check(
    'a dependency on an unknown work package is rejected',
    loadTasks(sandbox).errors.some((e) => /depends on unknown work package WP-99/.test(e)),
    'it would block forever and look like ordinary waiting',
  );

  writeFileSync(
    join(taskDir, 'TASK-9001-probe.md'),
    taskRecord('TASK-9001', [wp('WP-01', 'WIBBLE')]),
  );
  check(
    'an unknown work package status is rejected',
    loadTasks(sandbox).errors.some((e) => /STATUS = "WIBBLE"/.test(e)),
  );

  /* An id that disagrees with its filename cannot be found by id. */
  writeFileSync(join(taskDir, 'TASK-9001-probe.md'), taskRecord('TASK-9002', [wp('WP-01', 'DONE')]));
  check(
    'a TASK_ID that disagrees with its filename is rejected',
    loadTasks(sandbox).errors.some((e) => /filename must start with/.test(e)),
  );

  rmSync(sandbox, { recursive: true, force: true });
}

/*
 * 6, 9, 10 — protected-main behaviour, simulated against a throwaway repository
 * rather than asserted about prose. This is the flow that was previously left to
 * an agent's judgement at the exact moment its push had just failed.
 */
{
  const sandbox = mkdtempSync(join(tmpdir(), 'dijipeople-protected-'));
  const upstream = join(sandbox, 'upstream.git');
  const clone = join(sandbox, 'clone');

  const run = (args, cwd) => execFileSync('git', args, { cwd, stdio: 'pipe', encoding: 'utf8' });

  let simulated = false;
  try {
    mkdirSync(upstream, { recursive: true });
    run(['init', '--bare', '--initial-branch=main', '.'], upstream);
    run(['clone', upstream, clone], sandbox);
    run(['config', 'user.email', 'probe@example.com'], clone);
    run(['config', 'user.name', 'probe'], clone);

    writeFileSync(join(clone, 'base.txt'), 'base\n');
    run(['add', '.'], clone);
    run(['commit', '-m', 'base'], clone);
    run(['push', '-u', 'origin', 'main'], clone);

    const baseSha = run(['rev-parse', 'HEAD'], clone).trim();

    /* Commits land on local main — the accident the recovery exists for. */
    writeFileSync(join(clone, 'work.txt'), 'work\n');
    run(['add', '.'], clone);
    run(['commit', '-m', 'intended task commit'], clone);
    const aheadSha = run(['rev-parse', 'HEAD'], clone).trim();

    const counts = run(['rev-list', '--left-right', '--count', 'origin/main...main'], clone).trim();
    check('simulation: local main is detected as AHEAD', counts === '0\t1' || counts === '0 1', `counts = ${counts}`);

    const localOnly = run(['log', '--oneline', 'origin/main..main'], clone).trim().split('\n').filter(Boolean);
    check('simulation: the local-only commit is identified', localOnly.length === 1);

    /*
     * The recovery: a BRANCH at those commits, never a cherry-pick. The commits
     * must survive byte-identical, parents included.
     */
    run(['branch', 'agent/probe-recovery', 'main'], clone);
    const recoverySha = run(['rev-parse', 'agent/probe-recovery'], clone).trim();
    check(
      'simulation: the recovery branch preserves the exact commit',
      recoverySha === aheadSha,
      'a cherry-pick would produce a different SHA and lose the parent',
    );

    run(['push', 'origin', 'agent/probe-recovery'], clone);

    /* The merge a PR would perform, then local main fast-forwards to it. */
    run(['push', 'origin', 'agent/probe-recovery:main'], clone);
    run(['fetch', 'origin'], clone);
    run(['merge', '--ff-only', 'origin/main'], clone);

    const finalLocal = run(['rev-parse', 'main'], clone).trim();
    const finalRemote = run(['rev-parse', 'origin/main'], clone).trim();

    check('simulation: local main ends SYNCED with origin/main', finalLocal === finalRemote);
    check(
      'simulation: the recovered work is present on the target',
      run(['log', '--oneline', `${baseSha}..origin/main`], clone).includes('intended task commit'),
    );
    check(
      'simulation: no commits were lost',
      run(['rev-list', '--left-right', '--count', 'origin/main...main'], clone).trim().replace(/\s+/g, ' ') ===
        '0 0',
    );

    simulated = true;
  } catch (error) {
    /*
     * Git being unavailable is an environment limitation, not a framework
     * failure — warn rather than fail, exactly as the Obsidian sync does.
     */
    warn(`protected-branch simulation could not run — ${String(error.message).split('\n')[0]}`);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }

  if (simulated) checks += 1;
}

/* 9 — nothing in the framework may authorise force-pushing a shared branch. */
const FORCE_PUSH_PHRASINGS = [
  /force[- ]push(?:ing)?\s+(?:to\s+)?`?main`?\s+(?:is\s+)?(?:permitted|allowed|acceptable|fine)/i,
  /may\s+force[- ]push\s+(?:the\s+)?(?:shared|protected|main)/i,
  /use\s+`?git push --force`?\s+(?:on|to)\s+`?main/i,
];

for (const file of [
  '.agent/context/repository-health.md',
  '.agent/context/task-completion-contract.md',
  '.agent/agents/integrator.md',
  '.agent/agents/release-devops.md',
  'docs/development/agent-orchestration.md',
  'docs/development/branch-protection.md',
  'AGENTS.md',
]) {
  if (!existsSync(join(ROOT, file))) continue;
  const body = read(file);
  for (const pattern of FORCE_PUSH_PHRASINGS) {
    check(
      `${file} does not permit force-pushing a protected branch`,
      !pattern.test(body),
      `matched ${pattern}`,
    );
  }
}

// ================================================================================
// Autonomous framework v2 — multi-session, develop integration, persistent QA
// ================================================================================

/*
 * Everything below covers the capabilities added by TASK-0004. The structural
 * checks prove the rules are written; the simulations further down prove they
 * are executable.
 *
 * The distinction is not academic here. A check asserting that
 * `multi-session.md` mentions "lease" passes just as happily after somebody
 * inverts the comparison in `acquireLease`, which is the exact class of failure
 * this framework has already recorded against itself.
 */

// -------------------------------------------------- v2 structure and wiring

const V2_CONTEXT = [
  '.agent/context/multi-session.md',
  '.agent/context/branch-model.md',
  '.agent/context/agent-handoffs.md',
  '.agent/context/qa-persistence.md',
];

const V2_SCRIPTS = [
  'scripts/lib/agent-state.mjs',
  'scripts/lib/id-allocator.mjs',
  'scripts/lib/session-registry.mjs',
  'scripts/lib/session-records.mjs',
  'scripts/lib/qa-records.mjs',
  'scripts/allocate-id.mjs',
  'scripts/session.mjs',
  'scripts/rebuild-sessions.mjs',
  'scripts/rebuild-qa.mjs',
  'scripts/qa-select.mjs',
  'scripts/new-qa-scenario.mjs',
  'scripts/new-test-plan.mjs',
  'scripts/backlog-review.mjs',
  'scripts/verify-branch-policy.mjs',
];

const V2_DOCS = [
  'docs/sessions/README.md',
  'docs/sessions/index.md',
  'docs/sessions/active.md',
  'docs/sessions/completed.md',
  'docs/qa/test-plans/index.md',
  'docs/qa/scenarios/index.md',
  'docs/qa/coverage-matrix.md',
  'docs/knowledge/dashboards/Engineering Control Center.md',
];

for (const path of [...V2_CONTEXT, ...V2_SCRIPTS, ...V2_DOCS]) {
  check(`required path present: ${path}`, existsSync(join(ROOT, path)));
}

for (const script of V2_SCRIPTS) {
  if (!existsSync(join(ROOT, script))) continue;
  const body = read(script);
  check(`${script} is an ES module`, body.includes('import ') || body.includes('export '));
  check(`${script} is not truncated`, body.trimEnd().length > 400);
}

/* 1, 3 — multi-session rules must be stated before they can be relied on. */
if (existsSync(join(ROOT, '.agent/context/multi-session.md'))) {
  const body = read('.agent/context/multi-session.md');
  for (const classification of [
    'SAFE_PARALLEL',
    'SERIALIZE',
    'DEPENDENCY_WAIT',
    'SHARED_FILE_CONFLICT',
    'REBASE_REQUIRED',
    'BLOCKED_BY_ACTIVE_SESSION',
  ]) {
    check(`multi-session defines overlap class ${classification}`, body.includes(classification));
  }
  for (const field of [
    'SESSION_ID',
    'TASK_BRANCH',
    'BASE_SHA',
    'WRITE_LEASES',
    'SCHEMA_WRITE',
    'LAST_HEARTBEAT',
  ]) {
    check(`multi-session declares session field ${field}`, body.includes(field));
  }
  check(
    'multi-session keeps the database single-writer across all sessions',
    /single-writer across all sessions|single writer across ALL/i.test(body),
  );
  check('multi-session names DATABASE_WRITER', body.includes('DATABASE_WRITER'));
  check(
    'multi-session forbids reusing an id',
    /never lowered and never expire|gap in a sequence/i.test(body),
  );
  check(
    'multi-session reports rather than reaps a stale session',
    /reported, never reaped|never reaped/i.test(body),
  );
  check(
    'multi-session tells a blocked session to run other work rather than wait',
    /never stops an independent work package/i.test(body),
  );
  check('multi-session defines the merge queue statuses', ['QUEUED', 'INTEGRATING', 'VALIDATING', 'DONE'].every((s) => body.includes(s)));
}

/* 14, 15, 16, 19, 20 — the branch model. */
if (existsSync(join(ROOT, '.agent/context/branch-model.md'))) {
  const body = read('.agent/context/branch-model.md');
  check('branch model sets develop as the default target', /DEFAULT_TARGET_BRANCH\s*=\s*develop/.test(body));
  check('branch model declares MAIN_MUTATION_FORBIDDEN', body.includes('MAIN_MUTATION_FORBIDDEN'));
  check(
    'branch model states that any mutation of main may deploy production',
    /mutation of `?main`? may trigger a production deployment/i.test(body),
  );
  check('branch model makes develop PR optional', /DEVELOP_PR_REQUIRED\s*=\s*false/.test(body));
  check(
    'branch model still requires validation on develop',
    /DEVELOP_VALIDATION_REQUIRED\s*=\s*true/.test(body),
  );
  for (const state of ['SYNCED', 'AHEAD', 'BEHIND', 'DIVERGED', 'NOT_PRESENT', 'REMOTE_ONLY', 'UNKNOWN']) {
    check(`branch model defines DEVELOP_SYNC_STATUS ${state}`, body.includes(state));
  }
  check('branch model defines MAIN_CHANGE_STATUS UNTOUCHED', /MAIN_CHANGE_STATUS[\s\S]{0,400}UNTOUCHED/.test(body));
  check(
    'branch model requires a recorded baseline to claim UNTOUCHED',
    /--main-baseline/.test(body),
  );
  check(
    'branch model tests containment rather than equality for MAIN_CHANGE_STATUS',
    /containment, not equality/i.test(body) && body.includes('CHANGED_BY_THIS_TASK'),
    'comparing baseline to origin/main reports CHANGED whenever another session merges',
  );
  check(
    'branch model requires a hotfix to reconcile develop',
    /reconciled so it contains the production fix|`develop` must be reconciled/i.test(body),
  );
  check(
    'branch model refuses to weaken main',
    /None of that is weakened|does not make touching it easier/i.test(body),
  );
  check(
    'branch model records that only the Integrator writes a shared branch',
    /[Oo]nly the Integrator writes/i.test(body),
  );
}

/* 9, 25 — handoffs and the required-agent matrix. */
if (existsSync(join(ROOT, '.agent/context/agent-handoffs.md'))) {
  const body = read('.agent/context/agent-handoffs.md');
  for (const field of [
    'AGENT_STATUS',
    'IMPLEMENTED',
    'CHANGED_BEHAVIOR',
    'FILES_CHANGED',
    'RISK_AREAS',
    'KNOWN_MISTAKES_AVOIDED',
    'TESTS_ADDED',
    'VALIDATION_RUN',
    'UNRESOLVED',
    'HANDOFF_READY',
  ]) {
    check(`handoff contract declares ${field}`, body.includes(field));
  }
  for (const acceptance of [
    'QA_ACCEPTED_IMPLEMENTATION',
    'REVIEWER_ACCEPTED_QA',
    'INTEGRATOR_ACCEPTED_REVIEW',
    'RELEASE_DEVOPS_ACCEPTED_INTEGRATION',
  ]) {
    check(`handoff contract declares ${acceptance}`, body.includes(acceptance));
  }
  for (const status of ['PASS', 'NOT_REQUIRED', 'BLOCKED', 'FAILED', 'HANDOFF_REJECTED', 'UNKNOWN']) {
    check(`required-agent matrix defines status ${status}`, body.includes(status));
  }
  check(
    'a task cannot complete while a required agent is not PASS',
    /may not reach `?COMPLETE`? while a required agent is not `?PASS/i.test(body),
  );
  check(
    'handoff rejection routes rework rather than ending the task',
    /routes the work back|routes back to/i.test(body),
  );
  check(
    'the user never selects a specialist',
    /user talks only to the Architect|never have to name a specialist/i.test(body),
  );
  check(
    'rework re-runs the impacted scenarios, not everything',
    /impacted scenarios/i.test(body) && /qa-select/.test(body),
  );
}

/* 10, 11, 12, 13, 16, 17 — QA persistence. */
if (existsSync(join(ROOT, '.agent/context/qa-persistence.md'))) {
  const body = read('.agent/context/qa-persistence.md');
  check('QA persistence points at the scenario registry', body.includes('docs/qa/scenarios'));
  check('QA persistence points at the test plans', body.includes('docs/qa/test-plans'));
  check('QA persistence points at the coverage matrix', body.includes('docs/qa/coverage-matrix.md'));
  check('QA persistence describes selection before design', /qa-select/.test(body));
  check(
    'QA persistence keeps selection a starting point rather than a boundary',
    /starting point and \*\*never a boundary\*\*|never a boundary/i.test(body),
  );
  check('QA persistence defines scenario promotion', /[Pp]romotion/.test(body));
  check(
    'QA persistence refuses to promote every one-off check',
    /one-off check stays in the run file|Promoting everything/i.test(body),
  );
  check(
    'QA persistence states the regression rule in both directions',
    /FAILS on the unfixed code/i.test(body) && /PASSES on the fixed code/i.test(body),
  );
  check(
    'QA persistence makes a coverage gap pull work into scope',
    /becomes part of that task's scope/i.test(body),
  );
  for (const dimension of ['UNIT', 'API', 'DATABASE', 'INTEGRATION', 'E2E', 'BROWSER', 'SECURITY', 'PERFORMANCE']) {
    check(`coverage matrix declares dimension ${dimension}`, body.includes(dimension));
  }
  for (const status of ['GOOD', 'PARTIAL', 'GAP', 'NOT_APPLICABLE']) {
    check(`coverage matrix declares status ${status}`, body.includes(status));
  }
}

/* 2, 6, 7, 8 — the router must carry the short trigger and its aliases. */
if (existsSync(join(ROOT, ROUTER))) {
  const router = read(ROUTER);
  check('router recognises the DP: short trigger', /`DP:`/.test(router));
  check(
    'router states that DP: is the same framework',
    /`DP:`\s*\*\*is\*\*\s*`DijiPeople Task:`|activates \*\*exactly\*\* the same framework/i.test(router),
  );
  for (const shorthand of ['DP FIX:', 'DP UI:', 'DP TEST:', 'DP DB:', 'DP ARCH:', 'DP DOC:', 'DP CLEANUP:']) {
    check(`router lists the ${shorthand} shorthand`, router.includes(shorthand));
  }
  check(
    'router states that a shorthand never selects a weaker workflow',
    /shorthand never selects a weaker workflow/i.test(router),
  );
  check(
    'router routes "DP FIX: agent logout" to BUG + SECURITY',
    /DP FIX: agent logout[\s\S]{0,200}BUG \+ SECURITY/.test(router),
  );
  check(
    'router routes a production-readiness request to LARGE with work packages',
    /production ready[\s\S]{0,300}SIZE\s*=\s*LARGE/.test(router),
  );
  check('router declares an integration target per keyword', /Target/.test(router) && /`develop`/.test(router));
  check(
    'router keeps main as production control',
    /`main` as production control|RELEASE.{0,40}DEPLOY.{0,40}HOTFIX_PRODUCTION/i.test(router),
  );
}

/* The contract must carry the v2 fields. */
if (contractExists) {
  const contract = read(CONTRACT);
  for (const field of [
    'SESSION_STATUS',
    'REQUIRED_AGENTS_STATUS',
    'DEVELOP_INTEGRATION_STATUS',
    'DEVELOP_SYNC_STATUS',
    'MAIN_CHANGE_STATUS',
    'QA_SCENARIO_PROMOTION_STATUS',
    'CONTROL_CENTER_STATUS',
  ]) {
    check(`contract requires ${field}`, contract.includes(field));
  }
  check(
    'contract requires MAIN_CHANGE_STATUS = UNTOUCHED for an ordinary task',
    /MAIN_CHANGE_STATUS\s*=\s*UNTOUCHED/.test(contract),
  );
  check(
    'contract treats a changed main on an ordinary task as failure, not untidiness',
    /is a \*\*failed\*\* task/i.test(contract),
  );
  check(
    'contract never allows REQUIRED_AGENTS_STATUS to be NOT_REQUIRED',
    /`REQUIRED_AGENTS_STATUS`\s*\|\s*\*\*Never\*\*/.test(contract),
  );
}

/* repo-health must compute the new fields and still never mutate. */
if (existsSync(join(ROOT, 'scripts/repo-health.mjs'))) {
  const health = read('scripts/repo-health.mjs');
  check('repo-health computes DEVELOP_SYNC_STATUS', health.includes('DEVELOP_SYNC_STATUS'));
  check('repo-health computes MAIN_CHANGE_STATUS', health.includes('MAIN_CHANGE_STATUS'));
  check('repo-health reports DEVELOP_BEHIND_MAIN', health.includes('developBehindMain'));
  check(
    'repo-health requires a baseline before claiming main is untouched',
    /MAIN_BASELINE/.test(health) && /return 'UNKNOWN'/.test(health),
  );
}

/* The branch-policy verifier must stay read-only. */
if (existsSync(join(ROOT, 'scripts/verify-branch-policy.mjs'))) {
  const body = read('scripts/verify-branch-policy.mjs');
  check(
    'verify-branch-policy declares itself read-only',
    /\*\*Read-only, by design/i.test(body),
  );
  for (const forbidden of [/'-X',\s*'PUT'/, /'-X',\s*'POST'/, /'-X',\s*'DELETE'/, /'-X',\s*'PATCH'/]) {
    check(
      `verify-branch-policy performs no write (${forbidden.source.slice(0, 20)})`,
      !forbidden.test(body),
      'a script that can relax protection eventually will, to make a merge easier',
    );
  }
}

/* The id allocator must not have quietly reverted to a working-tree scan. */
if (existsSync(join(ROOT, 'scripts/lib/id-allocator.mjs'))) {
  const body = read('scripts/lib/id-allocator.mjs');
  check(
    'the id allocator scans every ref, not just the working tree',
    /'log',\s*'--all'/.test(body),
    'a working-tree scan cannot see an id a sibling branch already took',
  );
  check('the id allocator reserves under a lock', /withLock\(/.test(body));
  check(
    'the id allocator never lowers the ceiling when pruning',
    /Only \*\*consumed\*\* reservations are pruned|known\.has\(entry\.id\)/.test(body),
  );
}

// ------------------------------- BUG-0047: records must match the branch

/*
 * The prevention half of BUG-0047.
 *
 * Six records read `VERIFIED` while the commits implementing them sat on
 * branches that never merged, and five regression entries marked `Active: yes`
 * named test files absent from the integration branch. Two of those records were
 * CRITICAL. Every view derived from them — the open backlog, the dashboards, a
 * future BACKLOG_PRECHECK — reported protection the branch did not have.
 *
 * Both checks below fail against that state and pass against a corrected one,
 * which is the fails-without-the-fix property a regression needs.
 */
{
  const registerPath = 'docs/qa/regressions/index.md';
  if (existsSync(join(ROOT, registerPath))) {
    const register = read(registerPath);
    const entries = register.split(/(?=^### REG-)/m).filter((entry) => entry.startsWith('### REG-'));

    for (const entry of entries) {
      const id = (/^### (REG-\d{3})/.exec(entry) ?? [])[1] ?? 'REG-???';
      const active = /\|\s*\*\*Active\*\*\s*\|\s*yes\s*\|/i.test(entry);
      if (!active) continue;

      const testMatch = /\|\s*\*\*Regression test\*\*\s*\|\s*`([^`]+)`/.exec(entry);
      check(
        `${id} names a regression test`,
        Boolean(testMatch),
        'an active regression entry with no named test guards nothing',
      );
      if (!testMatch) continue;

      for (const path of testMatch[1].split(/\s*(?:,|and)\s*/).map((p) => p.trim()).filter(Boolean)) {
        check(
          `${id} regression test exists: ${path}`,
          existsSync(join(ROOT, path)),
          'the entry says Active: yes — a test that is not on this branch protects nothing here',
        );
      }
    }
  }

  /* A closed bug whose regression test is absent is a closure nobody can trust. */
  const bugDir = join(ROOT, 'docs/bugs');
  if (existsSync(bugDir)) {
    const register = existsSync(join(ROOT, 'docs/qa/regressions/index.md'))
      ? read('docs/qa/regressions/index.md')
      : '';

    for (const name of readdirSync(bugDir)) {
      if (!name.endsWith('.md') || name === 'README.md') continue;
      const body = read(`docs/bugs/${name}`);
      /*
       * `[^\S\r\n]` rather than `\s`: `\s` matches a newline, so a trailing
       * `\s*$` on an empty value silently ran on to capture the *next* line's
       * key. That reported `RelatedBacklogItem:` as a regression id.
       */
      const status = (/^Status:[^\S\r\n]*(\S+)[^\S\r\n]*$/m.exec(body) ?? [])[1] ?? '';
      const regression = (/^RegressionId:[^\S\r\n]*(REG-\d{3})[^\S\r\n]*$/m.exec(body) ?? [])[1] ?? '';
      if (!['VERIFIED', 'CLOSED'].includes(status) || !regression) continue;

      const entry = register
        .split(/(?=^### REG-)/m)
        .find((section) => section.startsWith(`### ${regression} `));

      check(
        `${name.slice(0, 8)} is ${status} and its ${regression} entry is active`,
        Boolean(entry) && /\|\s*\*\*Active\*\*\s*\|\s*yes\s*\|/i.test(entry ?? ''),
        'a record closed on a regression that is not active on this branch overstates its own protection',
      );
    }
  }
}

// ------------------------------------------- v2 behavioural simulations

/*
 * Simulations 1-29 from the TASK-0004 request, run against throwaway state.
 *
 * Where a rule can be executed it is executed. Where it genuinely cannot be —
 * a real deployment, a live Obsidian vault — the structural check above stands
 * in and says so rather than pretending.
 */

if (existsSync(join(ROOT, 'scripts/lib/session-registry.mjs'))) {
  const registry = await import('./lib/session-registry.mjs');
  const allocator = await import('./lib/id-allocator.mjs');
  const sessionRecords = await import('./lib/session-records.mjs');
  const qaRecords = await import('./lib/qa-records.mjs');

  const sandbox = mkdtempSync(join(tmpdir(), 'dijipeople-v2-'));

  const git = (args, cwd = sandbox) =>
    execFileSync('git', args, { cwd, stdio: 'pipe', encoding: 'utf8' }).trim();

  let gitAvailable = true;
  try {
    git(['init', '--initial-branch=main', '.']);
    git(['config', 'user.email', 'probe@example.com']);
    git(['config', 'user.name', 'probe']);
    mkdirSync(join(sandbox, 'docs/bugs'), { recursive: true });
    writeFileSync(join(sandbox, 'docs/bugs/BUG-0001-probe.md'), '# probe\n');
    git(['add', '.']);
    git(['commit', '-m', 'base']);
  } catch (error) {
    gitAvailable = false;
    warn(`v2 simulations could not initialise a sandbox repository — ${String(error.message).split('\n')[0]}`);
  }

  if (gitAvailable) {
    /* 1 — two sessions starting concurrently get distinct ids. */
    const first = allocator.allocateId(sandbox, 'session', { note: 'session A' });
    const second = allocator.allocateId(sandbox, 'session', { note: 'session B' });
    check(
      'simulation 1: two Architect sessions receive distinct ids',
      first !== second,
      `both received ${first}`,
    );

    /* 4, 5 — duplicate BUG and ITEM allocation must be impossible. */
    for (const [kind, label] of [['bug', 'BUG'], ['item', 'ITEM']]) {
      const ids = new Set();
      for (let i = 0; i < 8; i += 1) ids.add(allocator.allocateId(sandbox, kind, {}));
      check(
        `simulation ${kind === 'bug' ? '4' : '5'}: eight ${label} allocations produce eight distinct ids`,
        ids.size === 8,
        `got ${ids.size} distinct from 8`,
      );
    }

    /*
     * 4b — the case that actually failed twice: an id used on another branch.
     * The working tree never sees it, so a directory scan hands it out again.
     */
    git(['checkout', '-q', '-b', 'sibling']);
    writeFileSync(join(sandbox, 'docs/bugs/BUG-0900-on-a-sibling-branch.md'), '# probe\n');
    git(['add', '.']);
    git(['commit', '-m', 'record on a sibling branch']);
    git(['checkout', '-q', 'main']);

    check(
      'simulation 4b: an id allocated on a sibling branch is not handed out again',
      allocator.highestAllocated(sandbox, 'bug') >= 900,
      `ceiling was ${allocator.highestAllocated(sandbox, 'bug')} — a working-tree scan would report far less`,
    );

    /* Reservations must survive: allocating twice never returns the same id. */
    const reserved = allocator.allocateId(sandbox, 'bug', {});
    check(
      'simulation 4c: a reservation is visible before its record exists',
      allocator.readReservations(sandbox).some((entry) => entry.id === reserved),
    );
    check(
      'simulation 4d: the next allocation is above the reservation',
      allocator.allocateId(sandbox, 'bug', {}) !== reserved,
    );

    /* 2 — independent sessions proceed. */
    registry.registerSession(sandbox, {
      sessionId: 'SESSION-9001',
      title: 'probe A',
      branch: 'agent/probe-a',
      target: 'develop',
      paths: ['apps/web/app/page.tsx'],
    });
    registry.registerSession(sandbox, {
      sessionId: 'SESSION-9002',
      title: 'probe B',
      branch: 'agent/probe-b',
      target: 'develop',
      paths: ['services/api/src/modules/leave/leave.service.ts'],
    });

    check(
      'simulation 2: two sessions on unrelated files are SAFE_PARALLEL',
      registry.classifyOverlap(sandbox, {
        sessionId: 'SESSION-9002',
        paths: ['services/api/src/modules/leave/leave.service.ts'],
      }).classification === 'SAFE_PARALLEL',
    );

    /* 3 — the Prisma writer serialises across sessions. */
    const firstLease = registry.acquireLease(sandbox, {
      resource: 'schema',
      sessionId: 'SESSION-9001',
      reason: 'add a model',
    });
    const secondLease = registry.acquireLease(sandbox, {
      resource: 'schema',
      sessionId: 'SESSION-9002',
      reason: 'add another model',
    });

    check('simulation 3: the first session receives the schema lease', firstLease.granted);
    check(
      'simulation 3: the second session is refused the schema lease',
      !secondLease.granted && secondLease.lease?.sessionId === 'SESSION-9001',
      'the database must stay single-writer across all sessions',
    );
    check(
      'simulation 3: a contended schema write classifies as BLOCKED_BY_ACTIVE_SESSION',
      registry.classifyOverlap(sandbox, {
        sessionId: 'SESSION-9002',
        paths: ['services/api/prisma/schema.prisma'],
      }).classification === 'BLOCKED_BY_ACTIVE_SESSION',
    );

    /* A non-global resource serialises rather than blocking outright. */
    registry.acquireLease(sandbox, { resource: 'permissions', sessionId: 'SESSION-9001', reason: 'probe' });
    check(
      'simulation 3b: a contended non-global resource classifies as SERIALIZE',
      registry.classifyOverlap(sandbox, {
        sessionId: 'SESSION-9002',
        paths: ['services/api/src/common/constants/permissions.ts'],
      }).classification === 'SERIALIZE',
    );

    /* Reads are never blocked. */
    check(
      'simulation 3c: a read is granted even while a write lease is held',
      registry.acquireLease(sandbox, {
        resource: 'schema',
        sessionId: 'SESSION-9002',
        mode: 'read',
      }).granted,
    );

    /* Two sessions editing one ordinary file is one work item, not a race. */
    check(
      'simulation 2b: two sessions editing one file classify as SHARED_FILE_CONFLICT',
      registry.classifyOverlap(sandbox, {
        sessionId: 'SESSION-9002',
        paths: ['apps/web/app/page.tsx'],
      }).classification === 'SHARED_FILE_CONFLICT',
    );

    /* 18 — concurrent completions serialise through the merge queue. */
    registry.enqueue(sandbox, { sessionId: 'SESSION-9001', branch: 'agent/probe-a', sha: 'aaa' });
    registry.enqueue(sandbox, { sessionId: 'SESSION-9002', branch: 'agent/probe-b', sha: 'bbb' });

    const firstReady = registry.nextIntegration(sandbox);
    check(
      'simulation 18: the queue offers exactly one branch to integrate',
      firstReady.ready?.branch === 'agent/probe-a' && firstReady.inFlight === null,
    );

    registry.updateQueueEntry(sandbox, 'agent/probe-a', { status: 'INTEGRATING' });
    const whileBusy = registry.nextIntegration(sandbox);
    check(
      'simulation 18: no second branch may integrate while one is in flight',
      whileBusy.ready === null && whileBusy.inFlight?.branch === 'agent/probe-a',
      'two sessions writing develop at once is the failure the lock exists to prevent',
    );

    registry.updateQueueEntry(sandbox, 'agent/probe-a', { status: 'DONE' });
    check(
      'simulation 18: the next branch integrates once the lock is released',
      registry.nextIntegration(sandbox).ready?.branch === 'agent/probe-b',
    );

    /* A finished session must not leave a lease behind. */
    const finished = registry.finishSession(sandbox, 'SESSION-9001');
    check(
      'simulation 27: finishing a session releases every lease it held',
      finished.releasedLeases.includes('schema') && registry.liveLeases(sandbox).every((l) => l.sessionId !== 'SESSION-9001'),
    );
    check(
      'simulation 27: finishing a session removes it from the merge queue',
      registry.readQueue(sandbox).every((entry) => entry.sessionId !== 'SESSION-9001'),
    );

    /* 14, 15, 16 — the session record enforces the branch model. */
    const sessionDir = join(sandbox, 'docs/sessions');
    mkdirSync(sessionDir, { recursive: true });

    const sessionRecord = (id, { type = 'FEATURE', target = 'develop', branch = 'agent/probe' } = {}) =>
      [
        '---',
        `SESSION_ID: ${id}`,
        'TASK_ID: TASK-0001',
        'TITLE: probe',
        'ARCHITECT_INTENT: probe',
        'STATUS: ACTIVE',
        `TASK_TYPE: ${type}`,
        'TASK_SIZE: MEDIUM',
        'BASE_BRANCH: origin/develop',
        'BASE_SHA: abc1234',
        `TASK_BRANCH: ${branch}`,
        `TARGET_BRANCH: ${target}`,
        'WORKTREE: /tmp/probe',
        'AFFECTED_MODULES: []',
        'WRITE_LEASES: []',
        'ACTIVE_WORK_PACKAGES: []',
        'SCHEMA_WRITE: NO',
        'CI_STATUS: NOT_RUN',
        'MERGE_STATUS: NOT_STARTED',
        'STARTED_AT: 2026-01-01T00:00:00.000Z',
        'LAST_HEARTBEAT: 2026-01-01T00:00:00.000Z',
        'BLOCKERS: none',
        '---',
        '',
        `# ${id} — probe`,
        '',
        '## Intent',
        '',
        'probe',
        '',
      ].join('\n');

    writeFileSync(join(sessionDir, 'SESSION-9101-probe.md'), sessionRecord('SESSION-9101'));
    check(
      'simulation 14: an ordinary session targeting develop is accepted',
      sessionRecords.loadSessions(sandbox).errors.length === 0,
      sessionRecords.loadSessions(sandbox).errors.join(' | '),
    );

    writeFileSync(
      join(sessionDir, 'SESSION-9101-probe.md'),
      sessionRecord('SESSION-9101', { target: 'main' }),
    );
    check(
      'simulation 15: an ordinary session targeting main is rejected',
      sessionRecords.loadSessions(sandbox).errors.some((e) => /main is the production deployment branch/.test(e)),
      'an ordinary task that merges into main may trigger a production deployment nobody asked for',
    );

    writeFileSync(
      join(sessionDir, 'SESSION-9101-probe.md'),
      sessionRecord('SESSION-9101', { type: 'RELEASE', target: 'main' }),
    );
    check(
      'simulation 16: a RELEASE session may target main',
      sessionRecords.loadSessions(sandbox).errors.length === 0,
      sessionRecords.loadSessions(sandbox).errors.join(' | '),
    );

    writeFileSync(
      join(sessionDir, 'SESSION-9101-probe.md'),
      sessionRecord('SESSION-9101', { type: 'HOTFIX', target: 'main' }),
    );
    check(
      'simulation 17: a HOTFIX session may target main',
      sessionRecords.loadSessions(sandbox).errors.length === 0,
    );

    /* Two live sessions on one branch is two agents overwriting each other. */
    writeFileSync(join(sessionDir, 'SESSION-9101-probe.md'), sessionRecord('SESSION-9101'));
    writeFileSync(join(sessionDir, 'SESSION-9102-probe.md'), sessionRecord('SESSION-9102'));
    check(
      'simulation 1b: two active sessions on one branch are rejected',
      sessionRecords.loadSessions(sandbox).errors.some((e) => /two active sessions share the branch/.test(e)),
    );
    rmSync(join(sessionDir, 'SESSION-9102-probe.md'));

    /* 13 — a coverage claim with nothing behind it is rejected. */
    const planDir = join(sandbox, 'docs/qa/test-plans');
    const scenarioDir = join(sandbox, 'docs/qa/scenarios');
    mkdirSync(planDir, { recursive: true });
    mkdirSync(scenarioDir, { recursive: true });

    const DIMENSIONS = Object.keys(qaRecords.COVERAGE_DIMENSIONS);
    const planRecord = (coverage = {}) =>
      [
        '---',
        'PLAN_ID: PLAN-901',
        'TITLE: probe',
        'AREA: probe-area',
        'STATUS: CURRENT',
        'MODULES: [services/api/src/modules/probe]',
        'RISK: HIGH',
        ...DIMENSIONS.map((d) => `COVERAGE_${d}: ${coverage[d] ?? 'GAP'}`),
        'RELATED_BUGS: []',
        'RELATED_REGRESSIONS: []',
        'CREATED_AT: 2026-01-01',
        'UPDATED_AT: 2026-01-01',
        'VERIFIED_AGAINST_SHA: abc1234',
        '---',
        '',
        '# PLAN-901 — probe',
        '',
        ...qaRecords.loadQaRecords ? [] : [],
        ...['Scope', 'Risks', 'Preconditions', 'Test Types', 'Data Requirements', 'Security Cases', 'Negative Cases', 'State Transitions', 'Integration Cases', 'Browser Cases', 'Regression Links'].flatMap(
          (section) => [`## ${section}`, '', 'probe', ''],
        ),
      ].join('\n');

    const scenarioRecord = (id, { type = 'UNIT', automation = 'MANUAL', test = '', area = 'probe-area' } = {}) =>
      [
        '---',
        `SCENARIO_ID: ${id}`,
        'TITLE: probe',
        `AREA: ${area}`,
        'MODULE: services/api/src/modules/probe',
        `TYPE: ${type}`,
        'RISK: HIGH',
        `AUTOMATION_STATUS: ${automation}`,
        `TEST_REFERENCE: ${test}`,
        'RELATED_BUGS: []',
        'RELATED_REGRESSIONS: []',
        'LAST_RUN:',
        'LAST_RESULT: NOT_RUN',
        'CREATED_AT: 2026-01-01',
        'UPDATED_AT: 2026-01-01',
        '---',
        '',
        `# ${id} — probe`,
        '',
        '## Preconditions',
        '',
        'probe',
        '',
        '## Steps',
        '',
        '1. probe',
        '',
        '## Expected Result',
        '',
        'probe',
        '',
        '## Notes',
        '',
        'probe',
        '',
      ].join('\n');

    writeFileSync(join(planDir, 'PLAN-901-probe-area.md'), planRecord({ SECURITY: 'GOOD' }));
    check(
      'simulation 13: declaring coverage with no scenario behind it is rejected',
      qaRecords
        .loadQaRecords(sandbox)
        .errors.some((e) => /COVERAGE_SECURITY = GOOD but no SECURITY scenario exists/.test(e)),
      'a matrix cell with nothing behind it reports coverage nobody has',
    );

    writeFileSync(
      join(scenarioDir, 'QA-PROBE-001-probe.md'),
      scenarioRecord('QA-PROBE-001', { type: 'SECURITY', automation: 'BLOCKED_INFRASTRUCTURE' }),
    );
    check(
      'simulation 13b: coverage that cannot run may not be declared GOOD',
      qaRecords
        .loadQaRecords(sandbox)
        .errors.some((e) => /every SECURITY scenario is BLOCKED_INFRASTRUCTURE/.test(e)),
    );

    /* 12 — an automated scenario must name a test that exists. */
    writeFileSync(join(planDir, 'PLAN-901-probe-area.md'), planRecord());
    writeFileSync(
      join(scenarioDir, 'QA-PROBE-001-probe.md'),
      scenarioRecord('QA-PROBE-001', { automation: 'AUTOMATED', test: 'services/api/src/does-not-exist.spec.ts' }),
    );
    check(
      'simulation 12: an AUTOMATED scenario naming a missing test is rejected',
      qaRecords.loadQaRecords(sandbox).errors.some((e) => /does not exist/.test(e)),
      'this is the check that surfaced BUG-0047',
    );

    /* A scenario belonging to no plan is a scenario nothing ever selects. */
    writeFileSync(
      join(scenarioDir, 'QA-PROBE-001-probe.md'),
      scenarioRecord('QA-PROBE-001', { area: 'no-such-area' }),
    );
    check(
      'simulation 10b: a scenario outside every test plan is rejected',
      qaRecords.loadQaRecords(sandbox).errors.some((e) => /has no test plan/.test(e)),
    );

    /* 10 — selection returns the durable scenarios for a changed module. */
    writeFileSync(join(scenarioDir, 'QA-PROBE-001-probe.md'), scenarioRecord('QA-PROBE-001'));
    writeFileSync(
      join(scenarioDir, 'QA-PROBE-002-probe.md'),
      scenarioRecord('QA-PROBE-002', { type: 'SECURITY' }),
    );

    const loaded = qaRecords.loadQaRecords(sandbox);
    check('simulation 10: the probe QA records load cleanly', loaded.errors.length === 0, loaded.errors.join(' | '));

    const selection = qaRecords.selectForModules(loaded, ['services/api/src/modules/probe']);
    check(
      'simulation 10: a change selects the durable scenarios for its module',
      selection.scenarios.length === 2 && selection.plans.length === 1,
      `got ${selection.scenarios.length} scenario(s), ${selection.plans.length} plan(s)`,
    );
    check(
      'simulation 10c: security scenarios are surfaced as mandatory',
      selection.mandatory.some((scenario) => scenario.id === 'QA-PROBE-002'),
      'security and cross-tenant failures are silent, so they are never risk-weighted down',
    );

    /* 26 — a stale record is surfaced for revalidation. */
    const reviewOutput = runScript('scripts/backlog-review.mjs', ['--json']);
    check(
      'simulation 26: backlog review computes aging and revalidation',
      reviewOutput.ok && /"dueForRevalidation"/.test(reviewOutput.output),
      reviewOutput.output.split('\n').slice(0, 3).join(' | '),
    );
    check(
      'simulation 26b: backlog review reports a revalidation policy per severity',
      /"CRITICAL":\s*0/.test(reviewOutput.output),
      'a critical record is reverified by every task that goes near it, not on a timer',
    );

    /* 24 — the Control Center regenerates and is stable. */
    const controlCenter = runScript('scripts/generate-dashboards.mjs', ['--check']);
    check(
      'simulation 24: the Engineering Control Center is current',
      controlCenter.ok,
      controlCenter.output.split('\n').filter(Boolean).slice(0, 4).join(' | '),
    );

    /* 6 — QA records are valid and their indexes current. */
    const qaCheck = runScript('scripts/rebuild-qa.mjs', ['--check']);
    check(
      'simulation 11: QA plans, scenarios and the coverage matrix are valid and current',
      qaCheck.ok,
      qaCheck.output.split('\n').filter(Boolean).slice(0, 4).join(' | '),
    );

    /* Session records and indexes. */
    const sessionCheck = runScript('scripts/rebuild-sessions.mjs', ['--check']);
    check(
      'simulation 1c: session records are valid and their indexes current',
      sessionCheck.ok,
      sessionCheck.output.split('\n').filter(Boolean).slice(0, 4).join(' | '),
    );

    /* 28, 29 — repo-health reports the branch-model fields honestly. */
    const healthOutput = runScript('scripts/repo-health.mjs', ['--json']);
    if (healthOutput.ok) {
      let report = null;
      try {
        report = JSON.parse(healthOutput.output);
      } catch {
        /* handled below */
      }
      check('simulation 29: repo-health emits machine-readable state', report !== null);
      if (report) {
        check(
          'simulation 29: repo-health reports DEVELOP_SYNC_STATUS',
          typeof report.DEVELOP_SYNC_STATUS === 'string' && report.DEVELOP_SYNC_STATUS.length > 0,
        );
        check(
          'simulation 28: MAIN_CHANGE_STATUS is UNKNOWN without a recorded baseline',
          report.MAIN_CHANGE_STATUS === 'UNKNOWN',
          `got ${report.MAIN_CHANGE_STATUS} — claiming UNTOUCHED with no baseline would pass a task that merged into main`,
        );

        /*
         * 28b — the correction that mattered. The field asks "did THIS TASK move
         * production", not "has main moved": a concurrent session merging a PR
         * advances `main` through no fault of the task being audited. The first
         * implementation compared baseline to origin/main and reported CHANGED
         * for exactly that, on its own first real run.
         */
        const baselineRun = runScript('scripts/repo-health.mjs', [
          '--json',
          '--main-baseline',
          'HEAD',
          '--task-sha',
          'HEAD',
        ]);
        if (baselineRun.ok) {
          let baselineReport = null;
          try {
            baselineReport = JSON.parse(baselineRun.output);
          } catch {
            /* reported below */
          }
          check(
            'simulation 28b: MAIN_CHANGE_STATUS distinguishes this task from other sessions',
            baselineReport !== null &&
              ['UNTOUCHED', 'CHANGED_BY_THIS_TASK', 'REWRITTEN', 'UNKNOWN'].includes(
                baselineReport.MAIN_CHANGE_STATUS,
              ),
            `got ${baselineReport?.MAIN_CHANGE_STATUS} — the vocabulary must name who moved main`,
          );
          check(
            'simulation 28c: repo-health reports how far others advanced main',
            baselineReport !== null && typeof baselineReport.mainAdvancedByOthers === 'number',
            'a field that cries wolf when a colleague merges is one people learn to ignore',
          );
        }
        check(
          'simulation 27: repo-health reports unfinished Git operations',
          Array.isArray(report.unfinishedOperations),
        );
      }
    }
  }

  rmSync(sandbox, { recursive: true, force: true });
}

/*
 * 21, 22, 23 — the Obsidian relationship.
 *
 * The vault is a per-developer capability and is absent in CI, so these are
 * checks on the *mechanism* rather than on a live vault. That limitation is
 * stated rather than papered over: a green run here does not prove any vault is
 * correct, only that the code which would verify one exists and is wired.
 */
if (existsSync(join(ROOT, 'scripts/retrieve-knowledge.mjs'))) {
  const body = read('scripts/retrieve-knowledge.mjs');
  check('inbound retrieval reports OBSIDIAN_CONTEXT_USED', body.includes('OBSIDIAN_CONTEXT_USED'));
  for (const folder of ['04 - Requirements', '09 - Meetings', '10 - Client Feedback', '01 - Product', '05 - Decisions']) {
    check(`inbound retrieval knows the manual intent folder "${folder}"`, body.includes(folder));
  }
  check(
    'inbound retrieval never bulk-loads the vault',
    /never returns the whole vault|Bulk loading/i.test(body),
  );
  for (const classification of [
    'EXPECTED_CHANGE',
    'STALE_OBSIDIAN_NOTE',
    'STALE_REPOSITORY_DOC',
    'UNIMPLEMENTED_REQUIREMENT',
    'PRODUCT_DECISION_REQUIRED',
    'UNCLEAR_CONFLICT',
  ]) {
    check(`retrieval names the conflict class ${classification}`, body.includes(classification));
  }
}

if (existsSync(join(ROOT, 'scripts/sync-obsidian.mjs'))) {
  const body = read('scripts/sync-obsidian.mjs');
  check('the sync offers a --verify mode', body.includes('--verify'));
  check(
    'verification checks that expected notes exist',
    /expected note is absent from the vault/.test(body),
  );
  check('verification checks that published notes carry substance', /empty of substance/.test(body));
  check('verification resolves generated wikilinks', /resolves to no note in the vault/.test(body));
  check(
    'verification refuses to trust an exit code',
    /not trusting the last exit code|must mean the vault is actually right/i.test(body),
  );
  check(
    'verification leaves manual notes untouched',
    /MANUAL_NOTES_UNTOUCHED/.test(body),
  );
}

if (existsSync(join(ROOT, 'scripts/lib/obsidian-mappings.mjs'))) {
  const body = read('scripts/lib/obsidian-mappings.mjs');
  for (const source of ['docs/sessions', 'docs/qa/test-plans', 'docs/qa/scenarios']) {
    check(`the vault publishes ${source}`, body.includes(source));
  }
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
