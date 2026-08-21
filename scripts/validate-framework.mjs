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
import { fileURLToPath, pathToFileURL } from 'node:url';

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
  /*
   * The two roles TASK-0012 made permanent.
   *
   * Product & Backlog Steward owns the health of unfinished work — records that
   * stayed valid, unowned and unactionable for months because owning them was
   * nobody's job. Knowledge & Graph owns canonical-to-vault projection, which
   * the Architect remained accountable for but had no capacity to verify note
   * by note.
   *
   * They are listed here rather than merely existing, so deleting one is a
   * validation failure rather than a silent regression to eleven roles.
   */
  'product-backlog-steward',
  'knowledge-graph',
  'backend-api',
  'frontend',
  'ui-ux',
  'database',
  'integration',
  'qa',
  'reviewer',
  'integrator',
  'release-devops',
  'security',
];

for (const agent of REQUIRED_AGENTS) {
  const path = `.agent/agents/${agent}.md`;
  const exists = existsSync(join(ROOT, path));
  check(`agent role present: ${agent}`, exists, path);

  if (!exists) continue;

  const body = read(path);
  check(`${agent} declares Required Context`, body.includes('## Required Context'));
  check(`${agent} declares a Staleness Rule`, body.includes('Staleness Rule'));

  /*
   * Two properties every permanent role must carry, because their absence is
   * invisible until it costs something.
   *
   * SESSION AWARENESS. The same role runs in several Architect chats at once.
   * A role that never names SESSION_ID cannot say which chat its evidence came
   * from, and two sessions' results become indistinguishable in the report.
   * Five roles were missing this until 2026-08-19.
   *
   * KNOWLEDGE IMPACT. The specialist is the only party that knows whether what
   * it built changed durable behaviour. A role that never declares it leaves the
   * Architect inferring, which is how a new invariant ends up existing only in
   * code and a chat transcript.
   */
  check(
    `${agent} is session-aware`,
    /SESSION_ID|session\.mjs/.test(body),
    'the same role runs in multiple chats; an execution must name its session',
  );
  check(
    `${agent} declares KNOWLEDGE_IMPACT in its handoff`,
    body.includes('KNOWLEDGE_IMPACT'),
    'only the specialist knows whether durable behaviour changed',
  );
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
  /*
   * The TASK-0012 additions. Listed here rather than only in the contract so
   * that deleting one from the contract is a validation failure — the contract
   * is prose, and prose loses a line without anything noticing.
   */
  'QUESTION_STATUS',
  'DECISION_MEMORY_STATUS',
  'CONTEXT_BUDGET_STATUS',
  'EVIDENCE_REUSE_STATUS',
  'TEST_RESOURCE_POLICY_STATUS',
  'TEST_RESOURCE_CLEANUP_FAILURES',
  'UNACCOUNTED_TEST_RESOURCES',
  'QA_EVIDENCE_LEVEL_STATUS',
  'ARCHITECTURE_IMPACT',
  'BACKLOG_OWNERSHIP_STATUS',
  'AGENT_HEALTH_STATUS',
  'OBSIDIAN_PATH_MISMATCHES',
  'OBSIDIAN_STATUS_MISMATCHES',
  'OBSIDIAN_SEMANTIC_LINK_ERRORS',
  'OBSIDIAN_DUPLICATE_NODES',
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
  const { loadRecords, BUG_SECTIONS } = await import('./lib/backlog-records.mjs');

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
      ...BUG_SECTIONS.flatMap((section) => [`## ${section}`, '', 'probe', '']),
    ].join('\n');

  writeFileSync(join(bugDir, 'BUG-9001-probe-a.md'), valid('BUG-9001'));
  check('a well-formed record set loads cleanly', loadRecords(sandbox).errors.length === 0);

  writeFileSync(
    join(bugDir, 'BUG-9001-probe-a.md'),
    valid('BUG-9001')
      .replace('Status: OPEN', 'Status: VERIFIED')
      .replace('ArchitectDisposition: TRIAGE_REQUIRED', 'ArchitectDisposition: FIX_NOW')
      .replace('ResolvedAt:', 'ResolvedAt: 2026-01-02'),
  );
  check(
    'terminal records with actionable dispositions are rejected',
    loadRecords(sandbox).errors.some((e) => /terminal Status VERIFIED requires ArchitectDisposition DONE/.test(e)),
  );

  writeFileSync(
    join(bugDir, 'BUG-9001-probe-a.md'),
    valid('BUG-9001')
      .replace('Status: OPEN', 'Status: VERIFIED')
      .replace('ArchitectDisposition: TRIAGE_REQUIRED', 'ArchitectDisposition: DONE')
      .replace('ResolvedAt:', 'ResolvedAt: 2026-01-02'),
  );
  check(
    'fixed and verified bugs require a regression link',
    loadRecords(sandbox).errors.some((e) => /Status VERIFIED requires RegressionId/.test(e)),
  );

  mkdirSync(join(sandbox, 'docs/qa/regressions'), { recursive: true });
  writeFileSync(
    join(sandbox, 'docs/qa/regressions/index.md'),
    [
      '### REG-901 — inactive probe',
      '',
      '| Field | Value |',
      '|---|---|',
      '| **Active** | no |',
      '| **Bug record** | BUG-9001 |',
    ].join('\n'),
  );
  writeFileSync(
    join(bugDir, 'BUG-9001-probe-a.md'),
    valid('BUG-9001')
      .replace('Status: OPEN', 'Status: FIXED')
      .replace('ArchitectDisposition: TRIAGE_REQUIRED', 'ArchitectDisposition: FIX_NOW')
      .replace('RegressionId:', 'RegressionId: REG-901'),
  );
  check(
    'fixed and terminal bugs require an active regression link',
    loadRecords(sandbox).errors.some((e) => /Status FIXED requires RegressionId REG-901 to be active/.test(e)),
  );

  writeFileSync(
    join(bugDir, 'BUG-9001-probe-a.md'),
    valid('BUG-9001').replace('ArchitectDisposition: TRIAGE_REQUIRED', 'ArchitectDisposition: DEFER'),
  );
  check(
    'deferred dispositions cannot remain active',
    loadRecords(sandbox).errors.some((e) => /ArchitectDisposition DEFER requires Status DEFERRED/.test(e)),
  );

  writeFileSync(
    join(bugDir, 'BUG-9001-probe-a.md'),
    valid('BUG-9001').replace('QAReport:', 'QAReport: docs/qa/runs/missing.md'),
  );
  check(
    'record evidence paths must resolve',
    loadRecords(sandbox).errors.some((e) => /QAReport references missing path/.test(e)),
  );

  writeFileSync(
    join(bugDir, 'BUG-9001-probe-a.md'),
    valid('BUG-9001').replace('UpdatedAt: 2026-01-01', 'UpdatedAt: 2025-12-31'),
  );
  check(
    'record dates cannot move backwards',
    loadRecords(sandbox).errors.some((e) => /UpdatedAt .* predates CreatedAt/.test(e)),
  );

  writeFileSync(
    join(bugDir, 'BUG-9001-probe-a.md'),
    valid('BUG-9001').replace('## Root Cause\n\nprobe\n\n', ''),
  );
  check(
    'bug body sections are mandatory',
    loadRecords(sandbox).errors.some((e) => /missing required section "## Root Cause"/.test(e)),
  );

  writeFileSync(join(bugDir, 'BUG-9001-probe-a.md'), `${valid('BUG-9001')}\n</content>\n`);
  check(
    'record wrapper artifacts are rejected',
    loadRecords(sandbox).errors.some((e) => /stray literal <\/content>/.test(e)),
  );

  writeFileSync(join(bugDir, 'BUG-9001-probe-a.md'), valid('BUG-9001'));

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

/*
 * Program inventories are curated evidence, but their canonical state fields
 * must not become a second backlog. TASK-0005 is the first such inventory, so
 * verify its id set, canonical metadata and QA relationship fields. Discovery
 * analysis may remain curated, but status and backlinks must never become a
 * competing source of truth.
 */
const remediationInventory = join(
  ROOT,
  'docs/tasks/remediation/TASK-0005-inventory.json',
);
if (
  existsSync(remediationInventory) &&
  existsSync(join(ROOT, 'scripts/lib/backlog-records.mjs'))
) {
  const { loadRecords } = await import('./lib/backlog-records.mjs');
  const { loadQaRecords } = await import('./lib/qa-records.mjs');
  const inventory = JSON.parse(readFileSync(remediationInventory, 'utf8'));
  const { records, errors } = loadRecords(ROOT);
  const qa = loadQaRecords(ROOT);
  const canonical = new Map(records.map((record) => [record.id, record]));
  const rows = Array.isArray(inventory.records) ? inventory.records : [];
  const rowIds = rows.map((row) => row.record_id);

  check(
    'remediation inventory loads with canonical records and QA relationships',
    errors.length === 0 && qa.errors.length === 0,
  );
  check(
    'remediation inventory has one row per canonical record',
    rows.length === records.length && new Set(rowIds).size === records.length,
    `${rows.length} inventory rows / ${records.length} canonical records`,
  );
  check(
    'remediation inventory contains no missing or extra record ids',
    rowIds.every((id) => canonical.has(id)) && records.every((record) => rowIds.includes(record.id)),
  );

  const drift = [];
  const regressionRoots = new Map();
  const register = read('docs/qa/regressions/index.md');
  for (const entry of register.split(/(?=^### REG-)/m)) {
    const regressionId = (/^### (REG-\d{3})/.exec(entry) ?? [])[1];
    if (!regressionId) continue;
    const rootCell =
      (/^\|\s*\*\*Bug record\*\*\s*\|\s*(.*?)\s*\|\s*$/m.exec(entry) ?? [])[1] ?? '';
    for (const rootId of rootCell.match(/\b(?:BUG|ITEM)-\d{4}\b/g) ?? []) {
      const ids = regressionRoots.get(rootId) ?? [];
      ids.push(regressionId);
      regressionRoots.set(rootId, ids);
    }
  }
  const sameIds = (actual, expected) =>
    JSON.stringify([...(actual ?? [])].sort()) === JSON.stringify([...expected].sort());
  for (const row of rows) {
    const record = canonical.get(row.record_id);
    if (!record) continue;
    const expected = {
      type: String(record.fields.Type ?? '').trim(),
      title: String(record.fields.Title ?? '').trim(),
      severity: record.severity,
      priority: record.priority,
      current_status: record.status,
      architect_disposition: String(record.fields.ArchitectDisposition ?? '').trim(),
    };
    for (const [field, value] of Object.entries(expected)) {
      if (row[field] !== value) drift.push(`${row.record_id}.${field}`);
    }
    const expectedSource = {
      record_path: record.relative,
      provenance: String(record.fields.Source ?? '').trim(),
      detected_in_sha: String(record.fields.DetectedInSha ?? '').trim(),
      created_at: String(record.fields.CreatedAt ?? '').trim(),
      updated_at: String(record.fields.UpdatedAt ?? '').trim(),
      resolved_at: String(record.fields.ResolvedAt ?? '').trim(),
    };
    for (const [field, value] of Object.entries(expectedSource)) {
      if (row.source?.[field] !== value) drift.push(`${row.record_id}.source.${field}`);
    }
    if (!sameIds(row.affected_modules, record.fields.AffectedModules ?? [])) {
      drift.push(`${row.record_id}.affected_modules`);
    }
    if (!sameIds(row.regressions, regressionRoots.get(record.id) ?? [])) {
      drift.push(`${row.record_id}.regressions`);
    }
    const scenarioIds = qa.scenarios
      .filter((scenario) => scenario.bugs.includes(record.id))
      .map((scenario) => scenario.id);
    if (!sameIds(row.qa_scenarios, scenarioIds)) drift.push(`${row.record_id}.qa_scenarios`);
    const planIds = qa.plans.filter((plan) => plan.bugs.includes(record.id)).map((plan) => plan.id);
    if (!sameIds(row.test_plan, planIds)) drift.push(`${row.record_id}.test_plan`);
  }
  check(
    'remediation inventory canonical state matches Bug/Backlog records',
    drift.length === 0,
    drift.slice(0, 8).join(', '),
  );
  check(
    'remediation inventory distinguishes discovery and reconciliation provenance',
    /^[0-9a-f]{40}$/.test(inventory.discovery_source_head ?? '') &&
      /^[0-9a-f]{40}$/.test(inventory.reconciliation_base_head ?? '') &&
      !Object.hasOwn(inventory, 'source_head'),
  );

  const findingIds = (inventory.discovered_findings ?? []).map(
    (finding) => finding.finding_id,
  );
  check(
    'remediation inventory finding ids are unique',
    findingIds.length === new Set(findingIds).size,
  );
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

/*
 * UI/UX participation.
 *
 * This role was defined, was invoked, and was still invisible: it had no status
 * on the completion contract, no row in the acceptance chain, and no schema for
 * its output, so whatever it found reached the user — when it reached the user
 * at all — as the sentence "UI/UX Agent reviewed". Its own role file closed by
 * saying that invoking it "produces documentation nobody reads", which the
 * Architect could reasonably read as licence to skip it.
 *
 * These checks assert the mechanism, not the vocabulary. Each is anchored to
 * the section carrying the rule, so deleting the section fails the check rather
 * than leaving a stray mention elsewhere in the file to satisfy it — which is
 * the failure mode a previous audit of this validator recorded.
 */
function sectionOf(body, headingPattern) {
  const lines = body.split('\n');
  const start = lines.findIndex(
    (line) => /^#{2,6}\s/.test(line) && headingPattern.test(line),
  );
  if (start === -1) return '';
  const level = lines[start].match(/^#+/)[0].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const heading = lines[i].match(/^(#+)\s/);
    if (heading && heading[1].length <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

const UI_UX_AGENT_PATH = '.agent/agents/ui-ux.md';
if (existsSync(join(ROOT, UI_UX_AGENT_PATH))) {
  const uiux = read(UI_UX_AGENT_PATH);

  /* 1. A landing/UI task requires UI/UX — the surfaces are enumerated, not implied. */
  const requiredSurfaces = sectionOf(uiux, /When UI\/UX is required/i);
  check(
    'ui-ux enumerates the surfaces that require it',
    requiredSurfaces.length > 0,
    'without the section the Architect has nothing to check a task against',
  );
  for (const surface of [
    'forms',
    'navigation',
    'accessibility',
    'public landing pages',
    'destructive actions',
    'conversion flows',
    'responsive',
    'dialogs',
  ]) {
    check(
      `ui-ux requires review for ${surface}`,
      new RegExp(surface.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i').test(requiredSurfaces),
      'a surface absent from the required list is one the Architect may silently skip',
    );
  }

  /* 7. NOT_REQUIRED is an exemption that has to be argued for. */
  check(
    'ui-ux requires a stated reason for NOT_REQUIRED',
    /NOT_REQUIRED/.test(requiredSurfaces) &&
      /stated reason|with a reason|with the reason/i.test(requiredSurfaces),
    'an unreasoned NOT_REQUIRED is how this role stopped running',
  );

  /* 2. The handoff has a schema, and an empty one is not a pass. */
  const handoff = sectionOf(uiux, /UI\/UX handoff/i);
  check('ui-ux defines its own handoff block', handoff.length > 0);
  for (const field of [
    'UI_UX_AGENT_STATUS',
    'SURFACES_REVIEWED',
    'WHAT_WORKS_WELL',
    'CRITICAL_FINDINGS',
    'HIGH_FINDINGS',
    'ACCESSIBILITY_FINDINGS',
    'RESPONSIVE_FINDINGS',
    'KNOWN_EXISTING_ISSUES',
    'NEW_FINDINGS',
    'SCREENSHOTS_OR_BROWSER_EVIDENCE',
    'HANDOFF_READY',
  ]) {
    check(`ui-ux handoff carries ${field}`, handoff.includes(field));
  }
  check(
    'ui-ux states that an empty handoff is not a pass',
    /empty handoff is not a pass/i.test(handoff),
    'otherwise a PASS with no findings is indistinguishable from no review',
  );

  /* 3 + 4. Findings are classified, and severe ones cannot stay in prose. */
  const findings = sectionOf(uiux, /Findings/i);
  check('ui-ux defines where findings go', findings.length > 0);
  for (const kind of [
    'UX_DEBT',
    'ACCESSIBILITY',
    'CONTENT',
    'RESPONSIVE',
    'CONVERSION',
    'DESIGN_SYSTEM',
    'GOOD_TO_HAVE',
  ]) {
    check(`ui-ux classifies findings as ${kind}`, findings.includes(kind));
  }
  check(
    'ui-ux binds CRITICAL and HIGH findings to a bug record',
    /CRITICAL/.test(findings) && /HIGH/.test(findings) && /docs\/bugs/.test(findings),
    'a severe finding with nowhere to live is a finding that disappears',
  );
  check(
    'ui-ux forbids a material finding existing only in a report',
    /only in a report/i.test(findings),
  );
  check(
    'ui-ux separates a bug from a recommendation',
    /\*\*BUG\*\*/.test(findings) &&
      /\*\*WARNING\*\*/.test(findings) &&
      /\*\*RECOMMENDATION\*\*/.test(findings),
    'without the distinction every preference inflates to HIGH and triage stops meaning anything',
  );

  /* 5. Frontend completion cannot bypass the post-review. */
  const postReview = sectionOf(uiux, /Post-implementation review/i);
  check('ui-ux defines a post-implementation review', postReview.length > 0);
  check(
    'ui-ux post-review carries UI_UX_POST_REVIEW_STATUS',
    postReview.includes('UI_UX_POST_REVIEW_STATUS'),
  );
  check(
    'ui-ux blocks Frontend completion on a failed or absent post-review',
    /may not be reported complete|not be reported complete/i.test(postReview) &&
      /FAILED/.test(postReview),
    'a review whose verdict blocks nothing is advisory, and advisory gates do not hold',
  );
  check(
    'ui-ux post-review runs against the running UI rather than the diff',
    /running\s+UI/i.test(postReview) &&
      /(not|rather\s+than)\s+against\s+the\s+diff|not\s+against\s+the\s+diff/i.test(postReview),
  );
}

/* The handoff contract has to know about the role, or the role has no gate. */
if (existsSync(join(ROOT, '.agent/context/agent-handoffs.md'))) {
  const handoffs = read('.agent/context/agent-handoffs.md');
  check(
    'handoffs give UI/UX its own handoff shape',
    /UI\/UX hands off differently/i.test(handoffs),
    'the generic build-shaped handoff leaves a read-only role with every field empty',
  );
  check(
    'handoffs place UI/UX in the acceptance chain in both directions',
    /Frontend ← UI\/UX/.test(handoffs) && /UI\/UX ← Frontend/.test(handoffs),
    'a stage nobody accepts or rejects is not a gate',
  );
  check(
    'handoffs name the UI/UX acceptance tokens',
    handoffs.includes('FRONTEND_ACCEPTED_UI_UX') &&
      handoffs.includes('UI_UX_ACCEPTED_IMPLEMENTATION'),
  );
  check(
    'handoffs treat an empty UI/UX handoff as an anti-pattern',
    /`?PASS`?\s+with\s+every\s+finding\s+field\s+empty/i.test(handoffs),
  );
  check(
    'handoffs require a bug id on a CRITICAL or HIGH UI/UX finding',
    /`?(CRITICAL|HIGH)`?\s+UI\/UX\s+finding\s+with\s+no\s+bug\s+record\s+id/i.test(handoffs),
  );
  check(
    'handoffs require the final report to show what UI/UX found',
    /quotes the\s+\*\*UI\/UX handoff\*\*|quotes the\s+UI\/UX handoff/i.test(handoffs),
  );
}

/* And the completion contract has to be able to fail on it. */
if (existsSync(join(ROOT, '.agent/context/task-completion-contract.md'))) {
  const contract = read('.agent/context/task-completion-contract.md');
  for (const field of ['UI_UX_AGENT_STATUS', 'UI_UX_POST_REVIEW_STATUS']) {
    check(`completion contract resolves ${field}`, contract.includes(field));
  }
  check(
    'completion contract allows UI/UX NOT_REQUIRED only with a reason',
    /with the reason stated/i.test(contract),
  );
  check(
    'completion contract blocks completion on a failed UI/UX post-review',
    /UI_UX_POST_REVIEW_STATUS = FAILED` blocks completion/i.test(contract),
  );
}

/* 6. The Architect must expose the contribution, not assert it. */
if (existsSync(join(ROOT, '.agent/agents/architect.md'))) {
  const architectReport = sectionOf(
    read('.agent/agents/architect.md'),
    /Reporting the UI\/UX contribution/i,
  );
  check(
    'architect reports the UI/UX contribution',
    architectReport.length > 0,
    'without this the roster says UI/UX ran and the report never shows a single finding',
  );
  for (const field of [
    'UI_UX_AGENT_STATUS',
    'UI_UX_POST_REVIEW_STATUS',
    'UI_UX_FINDINGS_COUNT',
    'SURFACES_REVIEWED',
  ]) {
    check(`architect report exposes ${field}`, architectReport.includes(field));
  }
  check(
    'architect rejects a bare claim that UI/UX reviewed',
    /is not a report of a review/i.test(architectReport),
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
  /*
   * BUG-0059 — this loop ran over bugs and backlog items only, which is exactly
   * how `docs/tasks` came to hold five records no `[[TASK-nnnn]]` could reach:
   * the rule was right, the record type was simply outside the loop. Every
   * directory of id-addressable records belongs here, so adding a sixth record
   * type cannot silently reintroduce the gap.
   */
  for (const dir of ['docs/bugs', 'docs/backlog/items', 'docs/tasks']) {
    for (const file of markdownFilesIn(dir)) {
      const name = file.split(/[\\/]/).pop() ?? '';
      const idMatch = /^(BUG|ITEM|TASK)-\d{4}/.exec(name);
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
    'Every bug, backlog and task record is reachable by its bare id in Obsidian',
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

      /*
       * Split on a comma, or on "and" as a *word*. The bare alternative used to
       * be `(?:,|and)` with optional surrounding whitespace, which matches
       * inside words: every path containing "l-and-ing" was torn in half, so no
       * regression entry could reference anything under `apps/landing` or the
       * landing browser spec. The check then reported two files that do not
       * exist instead of the one that does.
       */
      for (const path of testMatch[1].split(/\s*,\s*|\s+and\s+/).map((p) => p.trim()).filter(Boolean)) {
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

    const scenarioRecord = (
      id,
      {
        type = 'UNIT',
        automation = 'MANUAL',
        test = '',
        area = 'probe-area',
        bugs = '[]',
        regressions = '[]',
        lastRun = '',
      } = {},
    ) =>
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
        `RELATED_BUGS: ${bugs}`,
        `RELATED_REGRESSIONS: ${regressions}`,
        `LAST_RUN: ${lastRun}`,
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

    writeFileSync(
      join(scenarioDir, 'QA-PROBE-001-probe.md'),
      scenarioRecord('QA-PROBE-001', { lastRun: '2026-01-01 2025-12-31' }),
    );
    check(
      'scenario LAST_RUN must be one date',
      qaRecords.loadQaRecords(sandbox).errors.some((e) => /LAST_RUN .* is not YYYY-MM-DD/.test(e)),
    );

    const regressionDir = join(sandbox, 'docs/qa/regressions');
    const regressionTestDir = join(sandbox, 'services/api/src/modules/probe');
    mkdirSync(regressionDir, { recursive: true });
    mkdirSync(regressionTestDir, { recursive: true });
    writeFileSync(join(regressionTestDir, 'probe.spec.ts'), 'export {};\n');
    writeFileSync(
      join(regressionDir, 'index.md'),
      [
        '# Regression Register',
        '',
        '### REG-901 â€” probe',
        '',
        '| | |',
        '|---|---|',
        '| **Bug record** | BUG-9001 |',
        '| **Regression test** | `services/api/src/modules/probe/probe.spec.ts` |',
        '| **Active** | yes |',
        '',
      ].join('\n'),
    );
    writeFileSync(join(scenarioDir, 'QA-PROBE-001-probe.md'), scenarioRecord('QA-PROBE-001'));
    check(
      'active regressions require a reusable QA scenario',
      qaRecords.loadQaRecords(sandbox).errors.some((e) => /REG-901: active regression has no reusable QA scenario/.test(e)),
    );

    writeFileSync(
      join(scenarioDir, 'QA-PROBE-001-probe.md'),
      scenarioRecord('QA-PROBE-001', { regressions: '[REG-901]' }),
    );
    check(
      'regression scenarios require a canonical root-cause record',
      qaRecords.loadQaRecords(sandbox).errors.some((e) => /REG-901: reusable scenario roots do not match Bug record BUG-9001/.test(e)),
    );

    writeFileSync(
      join(scenarioDir, 'QA-PROBE-001-probe.md'),
      scenarioRecord('QA-PROBE-001', { bugs: '[BUG-9002]', regressions: '[REG-901]' }),
    );
    check(
      'regression scenario roots must match the register root',
      qaRecords.loadQaRecords(sandbox).errors.some((e) => /REG-901: reusable scenario roots do not match Bug record BUG-9001/.test(e)),
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
    writeFileSync(
      join(scenarioDir, 'QA-PROBE-001-probe.md'),
      scenarioRecord('QA-PROBE-001', { bugs: '[BUG-9001]', regressions: '[REG-901]' }),
    );
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

// ============================ TASK-0005 remediation gaps ====================

/*
 * Only the gaps this remediation actually closed. Each check exists because the
 * corresponding mistake was made and cost something, not to raise a count.
 */

/* The Obsidian config must be findable from a worktree that has no copy. */
if (existsSync(join(ROOT, 'scripts/lib/obsidian-config.mjs'))) {
  const body = read('scripts/lib/obsidian-config.mjs');

  for (const status of ['FOUND_WORKTREE', 'FOUND_PRIMARY', 'FOUND_SHARED', 'FOUND_ENV', 'NOT_CONFIGURED']) {
    check(`obsidian config declares ${status}`, body.includes(status));
  }
  check(
    'obsidian config resolves from the primary checkout, not only this worktree',
    /primaryCheckout/.test(body) && /git-common-dir/.test(body),
    'every task runs in its own worktree; a CWD-only lookup reported SKIPPED for two whole tasks',
  );
  check(
    'the example config is never treated as runtime configuration',
    /never\*\* a source of runtime configuration|is \*\*never\*\*/i.test(body) && /isPlaceholder/.test(body),
    'a placeholder vaultPath would "sync" into a directory named <absolute path to your vault>',
  );

  const { resolveObsidianConfig } = await import('./lib/obsidian-config.mjs');

  /* A placeholder must never resolve, whatever file it sits in. */
  const sandbox = mkdtempSync(join(tmpdir(), 'dijipeople-obsidian-'));
  writeFileSync(
    join(sandbox, '.obsidian-sync.local.json'),
    JSON.stringify({ vaultPath: '<absolute path to your Obsidian vault>' }),
  );
  const placeholder = resolveObsidianConfig(sandbox, { env: {} });
  check(
    'simulation: a placeholder vaultPath resolves to NOT_CONFIGURED',
    placeholder.status === 'NOT_CONFIGURED',
    `got ${placeholder.status}`,
  );

  writeFileSync(
    join(sandbox, '.obsidian-sync.local.json'),
    JSON.stringify({ vaultPath: join(sandbox, 'no-such-vault') }),
  );
  const missingVault = resolveObsidianConfig(sandbox, { env: {} });
  check(
    'simulation: a configured but absent vault does not resolve',
    missingVault.status === 'NOT_CONFIGURED',
    'a vault path that does not exist is not configuration',
  );
  rmSync(sandbox, { recursive: true, force: true });
}

/* Verification must resolve aliases and ignore code — both were false alarms. */
if (existsSync(join(ROOT, 'scripts/sync-obsidian.mjs'))) {
  const body = read('scripts/sync-obsidian.mjs');
  check(
    'vault verification resolves wikilinks through frontmatter aliases',
    /aliases:/.test(body) && /vaultNotes\.add/.test(body),
    'records are named <ID>-<slug>.md and linked as [[ID]]; basename-only resolution reported 300+ false failures',
  );
  check(
    'vault verification ignores wikilinks inside code',
    /replace\(\/```/.test(body),
    'documentation about wikilinks is not a wikilink',
  );
  check(
    'the sync resolves its config across worktrees',
    /resolveObsidianConfig/.test(body),
  );
}

if (existsSync(join(ROOT, 'scripts/retrieve-knowledge.mjs'))) {
  check(
    'inbound retrieval resolves its config across worktrees',
    /resolveObsidianConfig/.test(read('scripts/retrieve-knowledge.mjs')),
    'planning happens in a task worktree, which is exactly where the vault was invisible',
  );
}

/*
 * Every script that decides whether a vault exists must ask the shared resolver.
 *
 * The config lives in the primary checkout, so a script that looks beside itself
 * concludes there is no vault from any task worktree. The sync and retrieval
 * were each fixed for this in turn; the finalizer still had it, and reported
 * OBSIDIAN_SYNC = SKIPPED_NO_LOCAL_CONFIG to the completion contract while the
 * sync was publishing 511 notes. Listing them together is what stops a fourth
 * script rediscovering it.
 */
for (const script of [
  'scripts/finalize-agent-task.mjs',
  'scripts/sync-obsidian.mjs',
  'scripts/retrieve-knowledge.mjs',
]) {
  if (!existsSync(join(ROOT, script))) continue;
  const body = read(script);
  if (!/obsidian-sync\.local\.json|OBSIDIAN|obsidian/i.test(body)) continue;
  check(
    `${script} resolves the vault through the shared resolver`,
    /resolveObsidianConfig/.test(body),
    'looking beside the script finds no vault from a task worktree, which reads as "nothing to sync"',
  );
}

/* `develop` must contain `main`, or the integration branch is behind production. */
{
  const isAncestor = (ancestor, descendant) => {
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
        cwd: ROOT,
        stdio: 'pipe',
      });
      return true;
    } catch {
      return false;
    }
  };

  /*
   * Satisfied either by `develop` already containing `main`, or by the branch
   * under test carrying the reconciliation that will put it there.
   *
   * The second clause is not a loophole, it is the fix for a deadlock. This
   * check reads *repository* state, not branch state, so once a release moved
   * `main` ahead of `develop` it failed on every branch — including the branch
   * whose whole job was to reconcile them. The branch that fixes the divergence
   * could never go green, so the fix could never pass the gate that required it.
   * TASK-0012 hit exactly that after SESSION-0025 deployed to production
   * mid-program.
   *
   * It does not weaken the rule. A branch cut from a stale `develop` that does
   * nothing about it still fails, which is the case worth catching: work built
   * on an integration branch that is behind production.
   */
  const developContainsMain = isAncestor('origin/main', 'origin/develop');
  const branchCarriesReconciliation = isAncestor('origin/main', 'HEAD');
  const contains = developContainsMain || branchCarriesReconciliation;

  /*
   * Only meaningful where both refs are actually fetched. A shallow or
   * single-branch checkout — CI's default for a PR — has neither, and failing
   * there would be a check about the checkout rather than about the branches.
   */
  const hasRef = (ref) => {
    try {
      execFileSync('git', ['rev-parse', '--verify', '--quiet', ref], { cwd: ROOT, stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  };
  const haveBoth = hasRef('refs/remotes/origin/main') && hasRef('refs/remotes/origin/develop');

  if (haveBoth) {
    check(
      'DEVELOP_CONTAINS_MAIN — origin/develop contains origin/main',
      contains,
      'an integration branch behind production produces conflicts unrelated to any task; reconcile main into develop',
    );
  } else {
    warn('DEVELOP_CONTAINS_MAIN could not be checked — origin/main or origin/develop is not fetched here');
  }
}

/* A report-only CI job must carry a written exit criterion, not run forever. */
if (existsSync(join(ROOT, '.github/workflows/ci.yml'))) {
  const workflow = read('.github/workflows/ci.yml');
  const reportOnly = [...workflow.matchAll(/^ {2}([a-z0-9-]+):\s*\n\s*name: ([^\n]*report only[^\n]*)$/gim)];

  for (const [, jobId] of reportOnly) {
    /*
     * The job's own block, bounded by the next top-level job key. Slicing to
     * `steps:` does not work — it is indented four spaces, not two — and an
     * off-by-indent there silently truncated every job to its first line.
     */
    const start = workflow.indexOf(`\n  ${jobId}:`);
    const rest = workflow.slice(start + 1);
    const nextJob = /\n {2}[a-z0-9-]+:\n/.exec(rest);
    const body = nextJob ? rest.slice(0, nextJob.index) : rest;

    check(
      `report-only job "${jobId}" states a promotion path`,
      /promotion path|promotion criteri|promote (?:this job |it )?when|becomes required|move (?:this step |it )?into/i.test(
        body,
      ),
      'report-only without an exit criterion is permanent red CI nobody reads',
    );

    /*
     * BUG-0049 — a report-only job concludes `success` no matter what its tests
     * did, so its summary is the only place its real verdict can live. Both
     * report-only jobs used to print counts and stop there; a QA run then read
     * "all jobs green" off the conclusions and recorded a pass over 136 failed
     * tests. Requiring an explicit verdict token makes the summary say PASS or
     * FAIL rather than leaving the reader to infer it from a wall of output.
     */
    check(
      `report-only job "${jobId}" publishes an explicit PASS/FAIL verdict`,
      /RESULT:/.test(body) && /\bFAIL\b/.test(body),
      'a report-only job that only prints counts gets read as green — BUG-0049',
    );
  }
}

/* ===================================================================
 * Drift classes found by the 2026-08-17 documentation audit.
 *
 * Every check below corresponds to a defect that was real, that no test or
 * validator could see, and that survived precisely because nothing failed when
 * it went stale. The audit found both validators green while AGENTS.md claimed
 * 63 modules and listed 61, PLANS.md routed work to a role file deleted weeks
 * earlier, and 1,104 compiled build outputs sat in the index.
 *
 * The rule these encode: a documented claim about the repository must be
 * *derivable* from the repository. Prose that cannot be checked is prose that
 * will drift.
 * =================================================================== */

const trackedFiles = (() => {
  try {
    return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      .split('\n')
      .filter(Boolean);
  } catch {
    return null;
  }
})();

/* -- 1. The two top-tier instruction files must carry provenance -------------
 * Every .agent/context/ document already records what commit it was verified
 * against, which is what made the audit's findings triageable by age. AGENTS.md
 * and PLANS.md — which outrank all of them — carried nothing, and produced both
 * high-severity findings. */
for (const file of ['AGENTS.md', 'PLANS.md']) {
  const body = read(file);
  check(
    `${file} records Last verified`,
    body.includes('**Last verified:**'),
    'the highest-authority files must date their claims like every context document does',
  );
  check(
    `${file} records Verified against commit`,
    body.includes('**Verified against commit:**'),
    'a date without a commit cannot be re-derived',
  );
}

/* -- 2 & 8. Every tracked markdown relative link must resolve ----------------
 * Five were broken when the audit ran: a deleted agent role, two paths one
 * level too deep, a generated filename whose truncation the hand-written link
 * did not match, and a document that had moved directory.
 *
 * A link into `.agent/agents/` gets its own wording, because that failure has a
 * specific cause worth naming: PLANS.md routed step 3 of the plan lifecycle to
 * `implementer.md` for weeks after that role was deliberately deleted. Only
 * *links* are checked — prose and code spans naming the deleted file are
 * deliberate history (see integrator.md's delete/modify case) and must stay.
 *
 * Both live in one pass over the file list: reading 461 files twice to report
 * the same broken link under two descriptions is cost without information. */
if (trackedFiles) {
  for (const file of trackedFiles.filter((f) => f.endsWith('.md'))) {
    /*
     * A tracked file absent from the working tree is a finding, not a crash.
     *
     * This threw an unhandled ENOENT when a mutation test deleted a role file:
     * exit 1, so CI still blocked, but the output was a stack trace instead of a
     * named check — and a stack trace hides every other result in the run. The
     * same shape occurs in a partial checkout or a halted rebase, where the
     * useful message is "this tracked file is missing", not a Node trace.
     */
    if (!existsSync(join(ROOT, file))) {
      check(`tracked file exists in the working tree: ${file}`, false, 'tracked by Git, absent on disk');
      continue;
    }
    const body = readFileSync(join(ROOT, file), 'utf8');
    for (const [, target] of body.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      let path = target.split('#')[0];
      if (!path) continue;
      try {
        path = decodeURIComponent(path);
      } catch {
        /* a literal % in a filename is not an encoding error */
      }
      const resolved = path.startsWith('/') ? join(ROOT, path) : resolve(dirname(join(ROOT, file)), path);
      check(
        `${file} → ${target} resolves`,
        existsSync(resolved),
        /\.agent\/agents\/[a-z0-9-]+\.md$/.test(path)
          ? 'referenced agent role does not exist'
          : 'broken relative link',
      );
    }
  }
}

/* -- 3 & 4. The module inventory must match the filesystem -------------------
 * AGENTS.md claimed 63 modules, enumerated 61, and omitted `auth` and
 * `notifications` — while mandating, by name, that notifications route through
 * the module its own table did not list. */
const MODULES_DIR = 'services/api/src/modules';
if (existsSync(join(ROOT, MODULES_DIR))) {
  const agentsBody = read('AGENTS.md');
  const moduleDirs = readdirSync(join(ROOT, MODULES_DIR), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const stated = /\*\*(\d+) modules\*\* under `services\/api\/src\/modules\/`/.exec(agentsBody);
  check('AGENTS.md states a module count', Boolean(stated), 'the Domains section must state a count');
  if (stated) {
    check(
      `AGENTS.md module count (${stated[1]}) matches ${MODULES_DIR} (${moduleDirs.length})`,
      Number(stated[1]) === moduleDirs.length,
      're-derive with: ls services/api/src/modules | wc -l',
    );
  }

  /* Gathered line-by-line rather than by slicing to the next blank line: these
   * files use CRLF, so an indexOf('\n\n') finds nothing and the "table" would
   * swallow the rest of the document — every backticked word in AGENTS.md then
   * reads as a claimed module. */
  const agentsLines = agentsBody.split(/\r?\n/);
  const tableStart = agentsLines.findIndex((line) => line.startsWith('| Area | Modules |'));
  check('AGENTS.md carries the module inventory table', tableStart !== -1);
  if (tableStart !== -1) {
    const tableLines = [];
    for (let i = tableStart; i < agentsLines.length && agentsLines[i].startsWith('|'); i += 1) {
      tableLines.push(agentsLines[i]);
    }
    const table = tableLines.join('\n');

    for (const dir of moduleDirs) {
      check(`module "${dir}" appears in the AGENTS.md inventory`, table.includes(`\`${dir}\``));
    }

    /* The reverse direction catches a module renamed in the tree but left
     * standing in the table. Only lowercase-kebab tokens are considered, so
     * class names such as `JwtAuthGuard` in the same cells are not mistaken
     * for modules. */
    for (const [, token] of table.matchAll(/`([a-z][a-z0-9-]*)`/g)) {
      check(
        `inventory entry "${token}" is a real module directory`,
        moduleDirs.includes(token),
        `${MODULES_DIR}/${token} does not exist`,
      );
    }

    /* Modules AGENTS.md names as the *only* sanctioned route for a capability.
     * If one is missing from the inventory, the file mandates a destination it
     * does not acknowledge exists — exactly the `notifications` case. */
    const MANDATORY_ROUTING_MODULES = ['auth', 'notifications', 'audit', 'permissions', 'settings-runtime'];
    for (const name of MANDATORY_ROUTING_MODULES) {
      check(`mandatory routing target "${name}" exists`, moduleDirs.includes(name));
      check(`mandatory routing target "${name}" is in the inventory`, table.includes(`\`${name}\``));
    }
  }
}

/* -- 5 & 6. Documented CI must match the workflow ---------------------------
 * The gate gained browser-e2e on 2026-08-17; AGENTS.md and ci.md both still
 * said ten, and ci.md documented lint-api-report, promoted away the same day. */
const CI_WORKFLOW_PATH = '.github/workflows/ci.yml';
if (existsSync(join(ROOT, CI_WORKFLOW_PATH))) {
  const workflow = read(CI_WORKFLOW_PATH);
  const needsMatch = /ci-required:[\s\S]*?needs:\s*\n?\s*\[([^\]]+)\]/.exec(workflow);
  check('ci.yml declares the required-gate needs list', Boolean(needsMatch));

  if (needsMatch) {
    const requiredJobs = needsMatch[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    /* Scoped to the `jobs:` block. Matching two-space keys across the whole
     * file also collects `push:` from the `on:` trigger, which would let a
     * document claim a job named "push" and pass. */
    const jobsBlock = workflow.slice(workflow.search(/^jobs:$/m));
    const jobKeys = [...jobsBlock.matchAll(/^ {2}([a-z0-9-]+):$/gm)].map((m) => m[1]);
    for (const job of requiredJobs) {
      check(`required job "${job}" is defined in ${CI_WORKFLOW_PATH}`, jobKeys.includes(job));
    }

    /* Per-job properties. Two real defects on 2026-08-18 were invisible to
     * every check above, because both were about HOW a job is declared rather
     * than whether it exists:
     *
     *   - browser-e2e was named in ci-required.needs while carrying
     *     `continue-on-error: true`. Such a job reports `success` to
     *     needs.*.result even when it fails, so the aggregate gate could not
     *     see a browser failure at all. It was named as required and was not.
     *   - no job declared timeout-minutes, so every one inherited GitHub's
     *     360-minute default. The report-only database e2e job then ran for 36
     *     minutes unbounded and was stopped only by a superseding push.
     */
    const jobBodies = new Map();
    {
      const starts = [...jobsBlock.matchAll(/^ {2}([a-z0-9-]+):$/gm)];
      starts.forEach((match, index) => {
        const end = index + 1 < starts.length ? starts[index + 1].index : jobsBlock.length;
        jobBodies.set(match[1], jobsBlock.slice(match.index, end));
      });
    }

    /* The evidence resolver is what stops every ref-push integration running a
     * second full pipeline over a byte-identical tree. */
    check(
      'ci-required depends on the `resolve` evidence job',
      requiredJobs.includes('resolve'),
      'without it every integrated SHA re-runs the whole pipeline for a tree already proven',
    );

    const failOpen = requiredJobs.filter(
      (job) =>
        job !== 'resolve' &&
        /^ {4}continue-on-error:\s*true\s*$/m.test(jobBodies.get(job) ?? ''),
    );
    check(
      'no required job is fail-open through continue-on-error',
      failOpen.length === 0,
      failOpen.length
        ? `${failOpen.join(', ')} — reports success to needs.*.result even when it fails, so the gate cannot see the failure`
        : '',
    );

    const unbounded = [...jobBodies.entries()]
      .filter(([, body]) => !/^ {4}timeout-minutes:/m.test(body))
      .map(([id]) => id);
    check(
      'every ci.yml job declares timeout-minutes',
      unbounded.length === 0,
      unbounded.length
        ? `${unbounded.join(', ')} would inherit GitHub's 360-minute default`
        : '',
    );

    const NUMBER_WORDS = {
      seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
      twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
    };
    const documentedCount = (body, label) => {
      const m = /\*\*(\w+)\*\*\s+jobs|Aggregates the \*\*(\w+)\*\*\s+jobs|\*\*(\w+)\*\* required jobs/.exec(body);
      if (!m) return warn(`${label} states no CI job count to check`);
      const word = (m[1] || m[2] || m[3]).toLowerCase();
      const value = NUMBER_WORDS[word] ?? Number(word);
      check(
        `${label} CI job count (${word}) equals the gate's needs list (${requiredJobs.length})`,
        value === requiredJobs.length,
        'count them in ci-required.needs rather than editing one document',
      );
    };
    documentedCount(read('AGENTS.md'), 'AGENTS.md');
    if (existsSync(join(ROOT, 'docs/development/ci.md'))) {
      const ciDoc = read('docs/development/ci.md');
      documentedCount(ciDoc, 'docs/development/ci.md');

      /* Every job named in the ci.md table must exist in the workflow. This is
       * what would have caught lint-api-report surviving its own promotion. */
      for (const [, name] of ciDoc.matchAll(/^\|\s*`([a-z0-9-]+)`\s*\|/gm)) {
        check(`ci.md documents job "${name}", which exists in the workflow`, jobKeys.includes(name));
      }
    }
  }
}

/* -- 7. Engineering-history records must be finalized ------------------------
 * Two records sat with literal "TODO —" in Merge Commit, Final Target SHA and
 * CI Result, while the generator that writes them prints "Every TODO must be
 * resolved before the task reports COMPLETE." The generator template itself
 * legitimately contains them, so only the records are checked. */
for (const file of markdownFilesIn('docs/engineering-history/tasks')) {
  const body = read(file);
  check(
    `${file} has no unresolved TODO`,
    !body.includes('TODO —'),
    'a history record filed before the merge must be returned to and completed with real Git/CI evidence',
  );
}

/* -- 9. Obsidian parity must be a verified field, not an assumed one ---------
 * The vault was 40 generated files behind while every task reported its sync
 * done. Syncing and *verifying the sync* are different acts. */
{
  const contract = read('.agent/context/task-completion-contract.md');
  /* Anchored to a line of its own, which is how the contract lists a field.
   * `includes()` alone passed while the field was deleted from the list,
   * because the prose below it still mentioned the name — a check that cannot
   * fail is worse than no check, since it reads as coverage. */
  const declaresField = (name) => new RegExp(`^${name}\\s*$`, 'm').test(contract);
  check(
    'completion contract declares OBSIDIAN_SYNC_STATUS',
    declaresField('OBSIDIAN_SYNC_STATUS'),
  );
  check(
    'completion contract declares OBSIDIAN_VERIFICATION_STATUS',
    declaresField('OBSIDIAN_VERIFICATION_STATUS'),
    'a sync that was run but never verified is how the vault fell 40 files behind',
  );
  check(
    'completion contract names the verification command',
    contract.includes('knowledge:verify'),
    'the field needs a command that produces its value',
  );
}

/* -- 10. No tracked build output --------------------------------------------
 * 1,104 files — 977 compiled .dll/.exe under bin/ and 127 under obj/, 11 MB —
 * were tracked under gateway/. They regenerate on every `dotnet build`, so a
 * clean checkout always reported them modified and every agent began in a dirty
 * tree it was told not to touch. Nothing consumed them. */
if (trackedFiles) {
  const BUILD_OUTPUT = /(^|\/)(bin|obj)\//;
  /* Deliberate exceptions go here with a reason. Empty is the correct state. */
  const BUILD_OUTPUT_ALLOWLIST = [];
  const tracked = trackedFiles.filter(
    (f) => BUILD_OUTPUT.test(f) && !BUILD_OUTPUT_ALLOWLIST.some((a) => f.startsWith(a)),
  );
  check(
    'no compiler build output is tracked',
    tracked.length === 0,
    tracked.length
      ? `${tracked.length} tracked, e.g. ${tracked[0]} — untrack with "git rm -r --cached" and confirm .gitignore covers it`
      : '',
  );
}

// ------------------------------- simulations 30-38: agents, database, Obsidian
//
// Each of these was written because the corresponding rule could otherwise be
// deleted without any check noticing. Where a rule is behavioural the simulation
// executes it; where a rule is a written boundary the check names the exact
// sentence that carries it, so a rewrite that drops the boundary fails rather
// than passing on a file that still merely mentions the topic.

{
  /* 30 — Architect autonomy. The loophole this task itself fell through: with
   * dependency-ready work remaining, the Architect asked the user whether to
   * continue. That converts an autonomous framework back into a supervised one
   * and hands the user the job of tracking a plan the Architect chose. */
  const architect = read('.agent/agents/architect.md');
  const contract = read(CONTRACT);

  check(
    'simulation 30: the Architect forbids asking to continue while work remains',
    /PARENT_TASK\s*=\s*IN_PROGRESS/.test(architect) &&
      /NEXT_READY_WORK_PACKAGE/.test(architect) &&
      /USER_CONFIRMATION_REQUIRED/.test(architect),
    'architect.md must state the rule in terms of PARENT_TASK, NEXT_READY_WORK_PACKAGE and USER_CONFIRMATION_REQUIRED',
  );
  check(
    'simulation 30b: the completion contract refuses USER_CONFIRMATION_REQUIRED as terminal',
    /USER_CONFIRMATION_REQUIRED` is not a terminal state/.test(contract),
    'a ready work package must not be endable by asking the user',
  );
  check(
    'simulation 30c: capacity exhaustion is a checkpoint, not a question',
    /RESUME_REQUIRED/.test(architect) && /NEXT_READY_WP/.test(architect),
    'architect.md must define the persist-and-resume checkpoint',
  );
  /* The three legitimate stopping states must still be named, or the rule reads
   * as "never stop", which is a different and worse defect. */
  check(
    'simulation 30d: the legitimate stopping states are still named',
    /PRODUCT_DECISION/.test(architect) && /BLOCKED_EXTERNAL/.test(architect),
    'continuing automatically must not erase the cases where stopping is correct',
  );
}

{
  /* 31 — Security is a first-class permanent role, routed automatically. */
  const security = existsSync(join(ROOT, '.agent/agents/security.md'))
    ? read('.agent/agents/security.md')
    : '';
  const handoffs = read('.agent/context/agent-handoffs.md');

  check('simulation 31: the Security role exists', security.length > 0);
  check(
    'simulation 31b: Security is in the required-agent matrix with routing triggers',
    /\*\*Security\*\*/.test(handoffs) &&
      /tenant scope/.test(handoffs) &&
      /SECURITY_POST_REVIEW_STATUS/.test(handoffs),
    'the matrix row must name the triggers and both statuses',
  );
  check(
    'simulation 31c: Security carries a two-stage review and a blocking post-review',
    /SECURITY_POST_REVIEW_STATUS = FAILED\*\* blocks completion/.test(security) ||
      /`SECURITY_POST_REVIEW_STATUS = FAILED` blocks completion/.test(security),
    'a post-review failure must block, not advise',
  );
  check(
    'simulation 31d: Security findings become records, not prose',
    /KNOWN_SECURITY_FAILURES_TO_AVOID/.test(security) &&
      /No material finding may exist only in a report/.test(security),
    'CRITICAL/HIGH must route to a bug record, a fix, a negative test and a retest',
  );
  check(
    'simulation 31e: Security does not replace QA or the Reviewer',
    /Security says what must be attacked/.test(security) &&
      /final independent technical reviewer/.test(security),
    'merging the roles removes the check each provides',
  );
}

{
  /* 32 — Database preflight. Behavioural: the script must actually run and emit
   * every field, with UNKNOWN reachable rather than silently defaulted. */
  const preflight = runScript('scripts/db-preflight.mjs', ['--json']);
  let fields = null;
  try {
    fields = JSON.parse(preflight.output.slice(preflight.output.indexOf('{')));
  } catch {
    /* left null; the check below reports it */
  }

  check(
    'simulation 32: db-preflight emits the seven Database Agent fields',
    fields !== null &&
      [
        'DATABASE_AGENT_STATUS',
        'SCHEMA_STATUS',
        'MIGRATION_STATUS',
        'PRISMA_CLIENT_STATUS',
        'LOCAL_DATABASE_STATUS',
        'DATABASE_WRITE_REQUIRED',
        'DATABASE_WRITE_LEASE_STATUS',
      ].every((key) => key in fields),
    preflight.output.split('\n').filter(Boolean).slice(0, 3).join(' | '),
  );

  const database = read('.agent/agents/database.md');
  check(
    'simulation 32b: UNKNOWN is refused as a resting state',
    /UNKNOWN` is not an acceptable resting state/.test(database),
    'an unresolved preflight field means nobody looked',
  );
  check(
    'simulation 32c: repair is bounded — no reset, no data loss without a strategy',
    /No reset, and no data loss, without evidence and a migration strategy/.test(database) &&
      /MIGRATION_DRIFT` is a finding/.test(database),
    'flattening drift destroys the evidence of how the histories diverged',
  );
  check(
    'simulation 32d: Backend may request but not author a schema change',
    /Backend\/API\s+may\s+\*request\*\s+a\s+schema\s+change\s+and\s+must\s+not\s+author\s+one/.test(database) &&
      /Release\/DevOps\s+\*executes\*\s+migrations\s+during\s+deployment\s+and\s+does\s+not\s+design\s+them/.test(database),
    'ownership of the database lifecycle is exclusive to the Database Agent',
  );

  /*
   * 32e — BUG-0083, and deliberately behavioural rather than textual.
   *
   * 32b above asserts that database.md *says* UNKNOWN is unacceptable. That
   * sentence was present and true the whole time the script reported PASS over
   * two UNKNOWN fields — a check on prose cannot see a defect in the code the
   * prose describes. These call the verdict function with the exact state the
   * user's machine was in and require a failing answer.
   */
  const { classifyVerdict } = await import(pathToFileURL(join(ROOT, 'scripts/db-preflight.mjs')).href);

  const coherent = {
    schema: { status: 'CURRENT' },
    prismaClient: { status: 'CURRENT' },
    migration: { status: 'CURRENT' },
    database: { status: 'CURRENT' },
  };

  check(
    'simulation 32e: a database behind the committed history cannot report PASS',
    classifyVerdict({
      ...coherent,
      migration: { status: 'PENDING_MIGRATIONS' },
      database: { status: 'DATABASE_MISMATCH' },
    }).verdict === 'BLOCKED',
    'db-preflight reported PASS and exit 0 against 213 unapplied migrations — BUG-0083',
  );

  check(
    'simulation 32f: an UNKNOWN field cannot report PASS',
    ['schema', 'prismaClient', 'migration', 'database'].every(
      (field) => classifyVerdict({ ...coherent, [field]: { status: 'UNKNOWN' } }).verdict === 'INCOMPLETE',
    ) && classifyVerdict(coherent).verdict === 'PASS',
    'INCOMPLETE exists so the headline cannot contradict "UNKNOWN is not an acceptable resting state"',
  );

  check(
    'simulation 32g: the coherence invariant is checked after the work, not only before',
    /--postflight/.test(read('scripts/db-preflight.mjs')) &&
      /DATABASE_COHERENCE_STATUS/.test(read('.agent/context/task-completion-contract.md')) &&
      /"db:postflight"/.test(read('package.json')),
    'a preflight certifies coherence the same task then breaks by authoring the migration',
  );
}

{
  /* 33 — Role instances. The same permanent role runs in many chats; reads are
   * parallel, schema writes are exclusive. Simulation 3 already proves the lease
   * behaviour; these prove the role files declare the instance model, so results
   * from one chat cannot be mistaken for another's. */
  const database = read('.agent/agents/database.md');
  const security = existsSync(join(ROOT, '.agent/agents/security.md'))
    ? read('.agent/agents/security.md')
    : '';

  for (const [label, body] of [['Database', database], ['Security', security]]) {
    check(
      `simulation 33: the ${label} role declares a session-scoped instance identity`,
      /## Instance identity/.test(body) &&
        /SESSION_ID/.test(body) &&
        /WORK_PACKAGE_ID/.test(body),
      'a role execution must state which session and work package it belongs to',
    );
  }
  check(
    'simulation 33b: Database reads are parallel and schema writes exclusive',
    /\*\*Reads are parallel; writes are exclusive\.\*\*/.test(database),
    'concurrent preflights must not serialise behind one another',
  );
  check(
    'simulation 33c: Security review instances are explicitly concurrent-safe',
    /Concurrent Security instances are safe and expected/.test(security),
    'review is read-only, so two sessions may review at once',
  );
  /* No per-chat duplicates of a permanent role may exist. */
  const duplicated = readdirSync(join(ROOT, '.agent/agents'))
    .filter((name) => /-(\d+)\.md$/.test(name));
  check(
    'simulation 33d: no per-chat duplicate role files exist',
    duplicated.length === 0,
    duplicated.join(', '),
  );
}

{
  /* 34 — Obsidian ownership and the two orphan kinds. */
  const sync = read('scripts/sync-obsidian.mjs');
  check(
    'simulation 34: the verifier distinguishes SOURCE_ORPHAN from GRAPH_ORPHAN',
    /OBSIDIAN_SOURCE_ORPHANS/.test(sync) && /OBSIDIAN_GRAPH_ORPHANS/.test(sync),
    'a note can have a valid source and still be an isolated dot',
  );
  check(
    'simulation 34b: an orphan and a stale generated note are separate classifications',
    /ORPHAN_GENERATED_NODE/.test(sync) && /STALE_GENERATED_NODE/.test(sync),
    'source-gone and source-no-longer-published are different problems',
  );
  check(
    'simulation 34c: graph exemptions are explicit and carry a reason',
    /STANDALONE_CATEGORIES/.test(sync) && /NAVIGATION_AGGREGATES/.test(sync),
    'an unexplained exemption is indistinguishable from an oversight',
  );
  check(
    'simulation 34d: verification reads only agent-owned folders',
    /MANUAL_NOTES_UNTOUCHED/.test(sync),
    'manual notes must never be read, modified or counted',
  );
  /* The nesting trap: mapping targets nest, and a naive recursive walk reports
   * ~94 orphans in a vault that has none. */
  check(
    'simulation 34e: the orphan scan excludes subtrees owned by another mapping',
    /MAPPING TARGETS NEST/.test(sync),
    'without this the checker cries wolf on first contact and gets skipped',
  );
}

{
  /* 35 — Generated relationships are projected, never invented. */
  const qa = read('scripts/rebuild-qa.mjs');
  const taskGen = read('scripts/rebuild-tasks.mjs');
  check(
    'simulation 35: QA scenarios project their existing frontmatter into links',
    /GRAPH:BEGIN/.test(qa) && /planByArea/.test(qa),
    'the plan edge comes from shared AREA, which loadQaRecords already validates',
  );
  check(
    'simulation 35b: module links require an exact name match',
    /EXACT match/.test(qa) || /exact match/i.test(qa),
    'a plausible-looking wrong edge is worse than an absent one',
  );
  check(
    'simulation 35c: task records link the bug and item ids they already name',
    /GRAPH:BEGIN/.test(taskGen) && /BUG\|ITEM/.test(taskGen),
    'the relationship exists in prose; it just was not a wikilink',
  );
  check(
    'simulation 35d: REG ids are not linkified',
    /REG ids are deliberately NOT wikilinked/.test(qa),
    'regressions are sections in one register, so [[REG-002]] resolves to nothing',
  );
}

{
  /* 36 — KNOWLEDGE_IMPACT must travel with every handoff, and the Reviewer must
   * check it. Behaviour that exists only in code and chat is behaviour that has
   * to be rediscovered. */
  const handoffs = read('.agent/context/agent-handoffs.md');
  const reviewer = read('.agent/agents/reviewer.md');
  check(
    'simulation 36: the handoff contract carries KNOWLEDGE_IMPACT and OBSIDIAN_IMPACT',
    /KNOWLEDGE_IMPACT/.test(handoffs) && /OBSIDIAN_IMPACT/.test(handoffs),
  );
  check(
    'simulation 36b: the Reviewer rejects a declared knowledge impact with no update',
    /KNOWLEDGE_IMPACT/.test(reviewer),
    'a specialist declaring MODULE_KNOWLEDGE with no note is an incomplete handoff',
  );
}


{
  /*
   * 37 — the primary worktree is first-class.
   *
   * Every one of these runs `repo-health.mjs` against a throwaway repository
   * with real worktrees attached, because the defect being guarded here was a
   * *structural* check that passed while the behaviour was absent: per-worktree
   * dirtiness was computed, dropped from the report, and gated on a branch
   * comparison that could never be true for the branch the primary checkout is
   * actually on. Asserting that the document mentions PRIMARY_WORKTREE_STATUS
   * would have passed against every version of the code that had the bug.
   */
  const sandbox = mkdtempSync(join(tmpdir(), 'dijipeople-primary-'));
  const primary = join(sandbox, 'primary');
  const taskWorktree = join(sandbox, 'task');
  const otherWorktree = join(sandbox, 'other');

  const git = (args, cwd = primary) =>
    execFileSync('git', args, { cwd, stdio: 'pipe', encoding: 'utf8' }).trim();

  const health = (args) => {
    const result = runScript('scripts/repo-health.mjs', ['--json', '--root', primary, ...args]);
    if (!result.ok) return null;
    try {
      return JSON.parse(result.output);
    } catch {
      return null;
    }
  };

  let ready = true;
  try {
    mkdirSync(primary, { recursive: true });
    git(['init', '--initial-branch=main', '.']);
    git(['config', 'user.email', 'probe@example.com']);
    git(['config', 'user.name', 'probe']);
    mkdirSync(join(primary, 'docs/sessions'), { recursive: true });
    writeFileSync(join(primary, 'docs/sessions/README.md'), '# sessions\n');
    writeFileSync(join(primary, 'tracked.txt'), 'base\n');
    git(['add', '.']);
    git(['commit', '-m', 'base']);
    git(['branch', 'develop']);
    git(['checkout', 'develop']);
    git(['worktree', 'add', '-b', 'agent/task', taskWorktree]);
    git(['worktree', 'add', '-b', 'agent/other', otherWorktree]);
  } catch (error) {
    ready = false;
    warn(`primary-worktree simulations could not initialise — ${String(error.message).split('\n')[0]}`);
  }

  if (ready) {
    /* A — a clean task worktree does not make repository health PASS. */
    writeFileSync(join(primary, 'tracked.txt'), 'edited by nobody in particular\n');
    const dirtyPrimary = health(['--task-branch', 'agent/task']);
    check(
      'simulation 37A: an unexplained dirty file in the primary worktree is DIRTY_UNEXPLAINED',
      dirtyPrimary?.PRIMARY_WORKTREE_STATUS === 'DIRTY_UNEXPLAINED',
      `got ${dirtyPrimary?.PRIMARY_WORKTREE_STATUS}`,
    );
    check(
      'simulation 37A: the task worktree being clean does not clear it',
      dirtyPrimary?.TASK_WORKTREE_STATUS === 'CLEAN' &&
        dirtyPrimary?.PRIMARY_WORKTREE_STATUS === 'DIRTY_UNEXPLAINED',
      'a spotless task worktree is exactly the state the failing task reported PASS from',
    );
    check(
      'simulation 37A: an unexplained primary file blocks, it does not merely warn',
      Array.isArray(dirtyPrimary?.blockers) &&
        dirtyPrimary.blockers.some((entry) => /unexplained/i.test(entry)),
      'dirtiness was a warning before, and a warning cannot fail a task',
    );
    check(
      'simulation 37A: the unexplained path is named, with UNKNOWN ownership',
      dirtyPrimary?.unexplainedDirtyFiles?.some(
        (file) => file.path === 'tracked.txt' && file.owner === 'UNKNOWN',
      ),
      'a count with no paths cannot be acted on',
    );

    /* B — work that predates the task is preserved, and may complete. */
    const baselined = health(['--task-branch', 'agent/task', '--primary-baseline', 'tracked.txt']);
    check(
      'simulation 37B: a path already dirty at task start is DIRTY_USER_OWNED',
      baselined?.PRIMARY_WORKTREE_STATUS === 'DIRTY_USER_OWNED',
      `got ${baselined?.PRIMARY_WORKTREE_STATUS} — the user's own in-flight work must not block them`,
    );
    check(
      'simulation 37B: user-owned dirt does not block completion',
      baselined?.UNEXPLAINED_DIRTY_FILES === undefined
        ? baselined?.unexplainedDirtyFiles?.length === 0
        : true,
      'preserved user work is reported, never counted as unexplained',
    );
    check(
      'simulation 37B: the file is still on disk — nothing was reverted to tidy the report',
      readFileSync(join(primary, 'tracked.txt'), 'utf8').includes('edited by nobody'),
      'repo-health reports; it must never restore, reset or clean',
    );

    /* C — a generator writing a tracked file after the final commit is caught. */
    rmSync(join(primary, 'tracked.txt'), { force: true });
    git(['checkout', '--', 'tracked.txt']);
    mkdirSync(join(primary, 'docs/backlog'), { recursive: true });
    writeFileSync(join(primary, 'docs/backlog/index.md'), '# regenerated after the commit\n');
    const generated = health(['--task-branch', 'agent/task']);
    check(
      'simulation 37C: a post-integration generator writing a tracked file is detected',
      generated?.primaryDirtyFiles?.some(
        (file) => file.owner === 'GENERATED_BY_FRAMEWORK' && /docs\/backlog/.test(file.path),
      ),
      'generator output left uncommitted is repository work, not a clean tree',
    );
    check(
      'simulation 37C: uncommitted generator output does not pass as CLEAN',
      generated?.PRIMARY_WORKTREE_STATUS !== 'CLEAN',
      'running a tracked-file generator after the final commit and declaring cleanup done is the defect',
    );
    rmSync(join(primary, 'docs/backlog'), { recursive: true, force: true });

    /* D — a session record left behind by `start` blocks until reconciled. */
    writeFileSync(
      join(primary, 'docs/sessions/SESSION-9001-stranded.md'),
      '---\nSESSION_ID: SESSION-9001\nSTATUS: COMPLETE\nTASK_BRANCH: agent/task\n---\n\n# stranded\n',
    );
    const stranded = health(['--task-branch', 'agent/task']);
    check(
      'simulation 37D: a session record for a finished session is an ORPHANED_SESSION_STUB',
      stranded?.orphanedSessionStubs?.some((file) => /SESSION-9001/.test(file.path)),
      `got ${JSON.stringify(stranded?.primaryDirtyFiles)}`,
    );
    check(
      'simulation 37D: a stranded session record blocks completion until reconciled',
      stranded?.PRIMARY_WORKTREE_STATUS === 'DIRTY_UNEXPLAINED',
      'SESSION-0016 left exactly this stub in the primary checkout and the task still reported DONE',
    );

    /*
     * D2 — a stub that was already there is somebody else's mess, and must not
     * block this task. It is still named and still attributed to its session:
     * "pre-existing" is a reason not to block, never a reason to stop
     * reporting.
     */
    const preExistingStub = health([
      '--task-branch',
      'agent/task',
      '--primary-baseline',
      'docs/sessions/SESSION-9001-stranded.md',
    ]);
    check(
      'simulation 37D2: a pre-existing orphaned stub does not block the task that found it',
      preExistingStub?.PRIMARY_WORKTREE_STATUS !== 'DIRTY_UNEXPLAINED',
      `got ${preExistingStub?.PRIMARY_WORKTREE_STATUS}`,
    );
    check(
      'simulation 37D2: it is still attributed to the session that left it, not to the user',
      preExistingStub?.primaryDirtyFiles?.some(
        (file) => file.owner === 'SESSION-9001' && file.classification === 'PRE_EXISTING_ORPHANED_STUB',
      ),
      'attributing it to USER would send somebody to ask the wrong person',
    );

    /* E — an ACTIVE session's record is another chat's, and is left alone. */
    writeFileSync(
      join(primary, 'docs/sessions/SESSION-9001-stranded.md'),
      '---\nSESSION_ID: SESSION-9001\nSTATUS: ACTIVE\nTASK_BRANCH: agent/other\n---\n\n# live\n',
    );
    const live = health(['--task-branch', 'agent/task']);
    check(
      'simulation 37E: an ACTIVE session record is owned by that session, not orphaned',
      live?.primaryDirtyFiles?.some(
        (file) => file.owner === 'SESSION-9001' && file.classification === 'ACTIVE_SESSION_RECORD',
      ),
      'reading committed indexes instead of the file itself reported a live session as an orphan',
    );
    check(
      'simulation 37E: another session\'s record is DIRTY_OTHER_SESSION_OWNED, not a blocker',
      live?.PRIMARY_WORKTREE_STATUS === 'DIRTY_OTHER_SESSION_OWNED',
      `got ${live?.PRIMARY_WORKTREE_STATUS}`,
    );
    check(
      'simulation 37E: a dirty worktree owned by another session is reported, never cleaned',
      existsSync(join(primary, 'docs/sessions/SESSION-9001-stranded.md')),
      'the framework must not delete or revert another session\'s work',
    );

    /* E2 — a dirty sibling worktree is surfaced and left alone. */
    writeFileSync(join(otherWorktree, 'tracked.txt'), 'another session is mid-edit\n');
    const sibling = health(['--task-branch', 'agent/task']);
    check(
      'simulation 37E: a dirty sibling worktree is listed under OTHER_DIRTY_WORKTREES',
      sibling?.otherDirtyWorktrees?.some((entry) => entry.branch === 'agent/other'),
      `got ${JSON.stringify(sibling?.otherDirtyWorktrees)}`,
    );
    check(
      'simulation 37E: the sibling worktree\'s changes are still there afterwards',
      readFileSync(join(otherWorktree, 'tracked.txt'), 'utf8').includes('mid-edit'),
      'reporting a worktree must never mutate it',
    );
    execFileSync('git', ['-C', otherWorktree, 'checkout', '--', 'tracked.txt'], { stdio: 'pipe' });
    rmSync(join(primary, 'docs/sessions/SESSION-9001-stranded.md'), { force: true });

    /* F — line-ending-only drift is still drift, and is classified not ignored. */
    writeFileSync(join(primary, 'tracked.txt'), 'base\r\n');
    const crlf = health(['--task-branch', 'agent/task']);
    check(
      'simulation 37F: a line-ending-only change is detected rather than silently accumulated',
      crlf?.PRIMARY_WORKTREE_STATUS === 'CLEAN' ||
        crlf?.primaryDirtyFiles?.some((file) => file.path === 'tracked.txt'),
      'either .gitattributes normalises it away, or it is reported — never invisible',
    );
    writeFileSync(join(primary, 'tracked.txt'), 'base\n');

    /*
     * G — behind the remote while dirty must not become a blind pull.
     *
     * The assertion is non-mutation, captured either side of the call, rather
     * than "the tree is clean afterwards": a health check has to be safe to run
     * on an unhealthy repository, which is the only kind worth running it on.
     */
    writeFileSync(join(primary, 'tracked.txt'), 'dirty while behind the remote\n');
    const branchBefore = git(['rev-parse', '--abbrev-ref', 'HEAD']);
    const statusBefore = git(['status', '--porcelain']);
    const headBefore = git(['rev-parse', 'HEAD']);
    const behindAndDirty = health(['--task-branch', 'agent/task']);
    check(
      'simulation 37G: repo-health returns a report rather than failing on a dirty tree',
      behindAndDirty !== null,
      'a health check that cannot run on an unhealthy repository is no use',
    );
    check(
      'simulation 37G: repo-health does not switch, pull or merge the branch it inspects',
      git(['rev-parse', '--abbrev-ref', 'HEAD']) === branchBefore &&
        git(['rev-parse', 'HEAD']) === headBefore,
      `branch/HEAD moved — a report must never reconcile, and never on a dirty tree`,
    );
    check(
      'simulation 37G: repo-health leaves the working tree exactly as it found it',
      git(['status', '--porcelain']) === statusBefore,
      `working tree changed from ${JSON.stringify(statusBefore)} to ${JSON.stringify(git(['status', '--porcelain']))}`,
    );
    check(
      'simulation 37G: the dirty file is still dirty — nothing was pulled over it',
      readFileSync(join(primary, 'tracked.txt'), 'utf8').includes('dirty while behind'),
      'classify and preserve local changes first; only then reconcile',
    );
    check(
      'simulation 37G: an unexplained primary is reported before any sync decision',
      typeof behindAndDirty?.PRIMARY_WORKTREE_STATUS === 'string' &&
        typeof behindAndDirty?.DEVELOP_SYNC_STATUS === 'string',
      'classify and preserve local changes first; only then reconcile',
    );

    /* Unfinished operations are aggregated across worktrees, not just this one. */
    check(
      'simulation 37: unfinished Git operations are aggregated per worktree',
      Array.isArray(behindAndDirty?.unfinishedByWorktree),
      'a rebase abandoned in a sibling checkout is invisible to --git-common-dir',
    );
    check(
      'simulation 37: every worktree carries a PRIMARY / TASK / OTHER role',
      behindAndDirty?.worktrees?.length >= 3 &&
        behindAndDirty.worktrees.filter((w) => w.role === 'PRIMARY').length === 1 &&
        behindAndDirty.worktrees.some((w) => w.role === 'TASK') &&
        behindAndDirty.worktrees.some((w) => w.role === 'OTHER'),
      `got ${JSON.stringify(behindAndDirty?.worktrees?.map((w) => w.role))}`,
    );
  }

  rmSync(sandbox, { recursive: true, force: true });
}

{
  /*
   * 38 — the rules above are also *written down*, because a check that only
   * lives in code is a check the next Architect cannot reason about before
   * running it.
   */
  const health = read('.agent/context/repository-health.md');
  const contract = read('.agent/context/task-completion-contract.md');
  const releaseDevops = read('.agent/agents/release-devops.md');
  const architect = read('.agent/agents/architect.md');
  const agents = read('AGENTS.md');

  check(
    'simulation 38: repository health names the primary worktree as first-class',
    /PRIMARY_WORKTREE_STATUS/.test(health) && /TASK_WORKTREE/.test(health),
  );
  check(
    'simulation 38b: DIRTY_UNEXPLAINED is documented as blocking completion',
    /DIRTY_UNEXPLAINED/.test(health) && /blocks completion/i.test(health),
  );
  check(
    'simulation 38c: every dirty path must carry an owner',
    /GENERATED_BY_FRAMEWORK/.test(health) && /UNKNOWN/.test(health),
    'USER, SESSION-nnnn, GENERATED_BY_FRAMEWORK or UNKNOWN',
  );
  check(
    'simulation 38d: the completion contract carries the worktree fields',
    /PRIMARY_WORKTREE_STATUS/.test(contract) &&
      /UNEXPLAINED_DIRTY_FILES/.test(contract) &&
      /POST_INTEGRATION_GENERATOR_STATUS/.test(contract),
  );
  check(
    'simulation 38e: PRIMARY_WORKTREE_STATUS is never NOT_REQUIRED',
    /Never — a task worktree being clean is not repository health/.test(contract),
    'the field exists precisely because a clean task worktree was mistaken for repository health',
  );
  check(
    'simulation 38f: Release/DevOps is LEAD for worktree health',
    /LEAD for worktree health/i.test(releaseDevops) && /PRIMARY_WORKTREE_STATUS/.test(releaseDevops),
  );
  check(
    'simulation 38g: the Architect reports worktree state rather than burying it',
    /UNEXPLAINED_DIRTY_FILES/.test(architect) && /may not report/i.test(architect),
  );
  check(
    'simulation 38h: post-integration generators must be committed or proven diff-free',
    /Post-integration generators are repository work/.test(health) &&
      /no diff/i.test(health),
  );
  check(
    'simulation 38i: session records must not be stranded in the primary checkout',
    /stranded in the primary checkout/i.test(health) || /PRIMARY_WORKTREE_ARTIFACT/.test(health),
  );
  check(
    'simulation 38j: AGENTS.md states that a clean task worktree is not repository health',
    /not a property of the worktree you are standing in/i.test(agents),
  );
  check(
    'simulation 38k: cleanup may never mean making git status empty',
    /Cleanup never means making `git status` empty/.test(contract),
    'reverting to tidy the report is how somebody else\'s afternoon disappears',
  );

  /* session.mjs must actually implement the artifact warning, not just describe it. */
  const sessionScript = read('scripts/session.mjs');
  check(
    'simulation 38l: session.mjs detects a record written into the primary checkout',
    /PRIMARY_WORKTREE_ARTIFACT/.test(sessionScript) &&
      /'worktree',\s*'list'/.test(sessionScript) &&
      /strandedInPrimary/.test(sessionScript),
    'the root cause was session.mjs resolving its root from its own location',
  );

  /* repo-health must expose the fields the contract now depends on. */
  const healthScript = read('scripts/repo-health.mjs');
  for (const field of [
    'PRIMARY_WORKTREE_STATUS',
    'TASK_WORKTREE_STATUS',
    'unexplainedDirtyFiles',
    'otherDirtyWorktrees',
    'unfinishedByWorktree',
  ]) {
    check(
      `simulation 38m: repo-health emits ${field}`,
      new RegExp(field).test(healthScript),
    );
  }
}

{
  /*
   * 39 — session.mjs actually refuses to strand a record silently.
   *
   * This is executed rather than grepped because the grepped version of this
   * check (38l) survived a mutation that set the detection to a constant
   * `false` while leaving every identifier it searched for in place. A check
   * that reads the source for a word cannot tell whether the word still does
   * anything.
   */
  const sandbox = mkdtempSync(join(tmpdir(), 'dijipeople-session-root-'));
  const git = (args, cwd = sandbox) =>
    execFileSync('git', args, { cwd, stdio: 'pipe', encoding: 'utf8' }).trim();

  let ready = true;
  try {
    git(['init', '--initial-branch=develop', '.']);
    git(['config', 'user.email', 'probe@example.com']);
    git(['config', 'user.name', 'probe']);
    mkdirSync(join(sandbox, 'docs/sessions'), { recursive: true });
    writeFileSync(join(sandbox, 'docs/sessions/README.md'), '# sessions\n');
    git(['add', '.']);
    git(['commit', '-m', 'base']);
  } catch (error) {
    ready = false;
    warn(`session-root simulation could not initialise — ${String(error.message).split('\n')[0]}`);
  }

  if (ready) {
    const startSession = (branch) => {
      const result = runScript('scripts/session.mjs', [
        'start',
        `probe ${branch}`,
        '--json',
        '--branch',
        branch,
        '--root',
        sandbox,
      ]);
      try {
        return JSON.parse(result.output);
      } catch {
        return null;
      }
    };

    /* Registering for a branch this checkout does not have is the stranding case. */
    const stranded = startSession('agent/somewhere-else');
    check(
      'simulation 39: registering a session for another branch flags PRIMARY_WORKTREE_ARTIFACT',
      stranded?.PRIMARY_WORKTREE_ARTIFACT === true,
      `got ${JSON.stringify(stranded?.PRIMARY_WORKTREE_ARTIFACT)} — SESSION-0015 and SESSION-0016 both stranded a stub this way`,
    );
    check(
      'simulation 39: the record reports which worktree it was written into',
      typeof stranded?.worktree === 'string' && stranded.worktree.length > 0,
      'a record that does not say where it lives cannot be reconciled later',
    );

    /* Registering for the branch actually checked out here is the ordinary case. */
    const ordinary = startSession('develop');
    check(
      'simulation 39b: registering on the checked-out branch is not flagged',
      ordinary?.PRIMARY_WORKTREE_ARTIFACT === false,
      `got ${JSON.stringify(ordinary?.PRIMARY_WORKTREE_ARTIFACT)} — a warning that always fires is a warning nobody reads`,
    );
  }

  rmSync(sandbox, { recursive: true, force: true });
}

// ================================================================================
// TASK-0012 — the agent operating system, simulations 40-62
// ================================================================================
//
// Every simulation here EXECUTES the mechanism against a fixture and asserts on
// the outcome. None of them greps.
//
// That is not a style preference. Check 38l — a grepped check — survived a
// mutation that set its detection to a constant false while every identifier it
// searched for stayed in place. A check that reads source for a word cannot tell
// whether the word still does anything, so it passes for exactly as long as the
// vocabulary survives, which is longer than the behaviour does.
//
// Each block below was also mutation-tested during WP-12: the mechanism was
// broken and the check observed to fail. A check nobody has seen fail is a check
// nobody has tested.

{
  /*
   * 40-41 — the question protocol.
   *
   * The two shapes that lose an answer: options routed to the user with no
   * recommendation, and a durable question answered without an ADR.
   */
  const sandbox = mkdtempSync(join(tmpdir(), 'dijipeople-questions-'));
  mkdirSync(join(sandbox, 'docs/questions'), { recursive: true });

  const question = (fields, body) => ['---', ...fields, '---', '', '# probe', '', body].join('\n');

  const sections = (recommendation, answer) =>
    [
      '## Question',
      'Should trial tenants keep their data after expiry?',
      '',
      '## Why It Matters',
      'The retention job cannot be written until this is settled.',
      '',
      '## Options',
      '| OPTION | WHAT IT MEANS | COST | RISK |',
      '|---|---|---|---|',
      '| purge | delete after 30 days | low | irreversible |',
      '',
      '## Agent Recommendation',
      recommendation,
      '',
      '## Answer',
      answer,
    ].join('\n');

  const base = () => [
    'QUESTION_ID: QUESTION-0001',
    'TITLE: probe',
    'STATUS: OPEN',
    'CATEGORY: USER_DECISION_REQUIRED',
    'ASKED_BY_AGENT: Backend/API',
    'ASKED_AT: 2026-08-21',
    'TASK_ID: TASK-0001',
    'WORK_PACKAGE_ID: WP-01',
    'BLOCKING: PACKAGE',
    'ANSWER:',
    'DECISION_ID:',
    'KNOWLEDGE_IMPACT: DECISION',
  ];

  const write = (text) =>
    writeFileSync(join(sandbox, 'docs/questions/QUESTION-0001-probe.md'), text, 'utf8');
  /*
   * Generate first, then check. A fresh sandbox has no indexes at all, so a bare
   * `--check` reports staleness for every record — which masks the validation
   * failure actually under test and makes the accepting cases fail for a reason
   * that has nothing to do with them.
   *
   * The rebuild refuses to write indexes for invalid records, so the negative
   * cases still reach `--check` with no indexes; record errors take precedence
   * over staleness there, which is the ordering this relies on.
   */
  const run = () => {
    runScript('scripts/rebuild-questions.mjs', ['--root', sandbox]);
    return runScript('scripts/rebuild-questions.mjs', ['--check', '--root', sandbox]);
  };

  write(question(base(), sections('', 'Pending.')));
  const noRecommendation = run();
  check(
    'simulation 40: an OPEN question with no Agent Recommendation is refused',
    !noRecommendation.ok && /Agent Recommendation/i.test(noRecommendation.output),
    noRecommendation.output.split('\n').filter(Boolean).slice(0, 3).join(' | '),
  );

  /* With one, the same record is accepted — a check that always fires is unread. */
  write(question(base(), sections('Purge. It is the only option the Terms already permit.', 'Pending.')));
  const withRecommendation = run();
  check(
    'simulation 40b: the same question carrying a recommendation is accepted',
    withRecommendation.ok,
    withRecommendation.output.split('\n').filter(Boolean).slice(0, 3).join(' | '),
  );

  /*
   * 41 — an answered durable question with no ADR. Nothing retrieves questions
   * by module, so this is precisely the answer the next task will not find.
   */
  const answered = (extra) =>
    base().map((line) => {
      if (line.startsWith('STATUS:')) return 'STATUS: ANSWERED';
      if (line.startsWith('ANSWER:')) return 'ANSWER: purge after 30 days';
      if (line.startsWith('DECISION_ID:') && extra) return 'DECISION_ID: ADR-0003';
      return line;
    });

  write(question(answered(false), sections('Purge.', 'Purge after 30 days; the Terms already say so.')));
  const noDecision = run();
  check(
    'simulation 41: an ANSWERED durable question without a DECISION_ID is refused',
    !noDecision.ok && /DECISION_ID/.test(noDecision.output),
    noDecision.output.split('\n').filter(Boolean).slice(0, 3).join(' | '),
  );

  write(question(answered(true), sections('Purge.', 'Purge after 30 days; the Terms already say so.')));
  const withDecision = run();
  check(
    'simulation 41b: the same answer carrying an ADR is accepted',
    withDecision.ok,
    withDecision.output.split('\n').filter(Boolean).slice(0, 3).join(' | '),
  );

  rmSync(sandbox, { recursive: true, force: true });
}

{
  /*
   * 42-46 — work-package persistence, continuation and the context budget.
   *
   * The behaviours that let a killed session resume without rediscovery.
   */
  const sandbox = mkdtempSync(join(tmpdir(), 'dijipeople-wp-'));
  const taskSlug = 'TASK-0001-probe';
  mkdirSync(join(sandbox, 'docs/tasks', taskSlug, 'work-packages'), { recursive: true });

  const parent = (rows, next) =>
    [
      '---',
      'TASK_ID: TASK-0001',
      'TITLE: probe',
      'TYPE: FRAMEWORK',
      'SIZE: PROGRAM',
      'STATUS: IN_PROGRESS',
      'PRIORITY: P0',
      'CREATED_AT: 2026-08-21',
      'AFFECTED_MODULES: [framework]',
      'AGENTS: [Architect]',
      'DEPENDENCIES: none',
      'CURRENT_PACKAGE: WP-01',
      'NEXT_READY_WORK_PACKAGE: ' + next,
      'COMPLETED_PACKAGES: []',
      'BLOCKED_PACKAGES: []',
      'OWNER_DECISIONS: 0',
      'FINAL_STATUS:',
      '---',
      '',
      '# TASK-0001 — probe',
      '',
      '## Objective',
      'Probe.',
      '',
      '## Work Packages',
      '',
      '| WP_ID | TITLE | STATUS | DEPENDENCIES | AGENTS | BRANCH | SHA | QA_STATUS | BUGS | CI_STATUS | MERGE_STATUS |',
      '|---|---|---|---|---|---|---|---|---|---|---|',
      ...rows,
      '',
      '## Assumptions',
      'None.',
      '',
      '## Owner Decisions',
      'None.',
      '',
      '## Repository Health',
      'Probe.',
      '',
      '## History',
      '- probe',
    ].join('\n');

  const pkg = (options) => {
    const {
      id,
      status,
      deps = [],
      manifest = true,
      assumption = 'VERIFIED',
      questions = 'None.',
      evidence = 'Executed against a fixture.',
    } = options;

    return [
      '---',
      'WP_ID: ' + id,
      'TASK_ID: TASK-0001',
      'TITLE: probe ' + id,
      'STATUS: ' + status,
      'OWNER_AGENT: Architect',
      'DEPENDENCIES: [' + deps.join(', ') + ']',
      'LAST_VERIFIED_SHA: abc1234',
      'KNOWLEDGE_IMPACT: [NONE]',
      'OBSIDIAN_IMPACT: NONE',
      '---',
      '',
      '# ' + id,
      '',
      '## Goal',
      'Probe.',
      '',
      '## Context Manifest',
      '',
      'REQUIRED:',
      '- AGENTS.md',
      '',
      'OPTIONAL:',
      '- none',
      '',
      ...(manifest ? ['DO_NOT_LOAD:', '- the bug backlog', ''] : []),
      'LAST_VERIFIED_SHA: abc1234',
      '',
      '## Relevant Files',
      '- none',
      '',
      '## Assumptions',
      '',
      '| ASSUMPTION_ID | STATEMENT | STATE | EVIDENCE |',
      '|---|---|---|---|',
      '| A-01 | probe | ' + assumption + ' | probe |',
      '',
      '## Implementation State',
      'Probe.',
      '',
      '## Validation State',
      'Probe.',
      '',
      '## Evidence',
      evidence,
      '',
      '## Questions',
      questions,
      '',
      '## Handoff',
      'Probe.',
    ].join('\n');
  };

  const writeParent = (rows, next) =>
    writeFileSync(join(sandbox, 'docs/tasks', taskSlug + '.md'), parent(rows, next), 'utf8');
  const writePkg = (name, text) =>
    writeFileSync(join(sandbox, 'docs/tasks', taskSlug, 'work-packages', name), text, 'utf8');
  const run = () => runScript('scripts/check-work-packages.mjs', ['--json', '--root', sandbox]);

  const row = (id, title, status, deps) =>
    '| ' + id + ' | ' + title + ' | ' + status + ' | ' + (deps || '—') +
    ' | Architect | agent/probe | — | — | — | — | — |';

  /*
   * 42 — a package that says it waits on the user must name the question.
   * Without the reference, WAITING_USER and "stalled" are indistinguishable and
   * nobody can tell whether an answer would even help.
   */
  writeParent([row('WP-01', 'waiting', 'WAITING_USER'), row('WP-02', 'independent', 'READY')], 'WP-02');
  writePkg('WP-01-waiting.md', pkg({ id: 'WP-01', status: 'WAITING_USER', questions: 'Waiting.' }));
  writePkg('WP-02-independent.md', pkg({ id: 'WP-02', status: 'READY' }));
  const unnamed = run();
  check(
    'simulation 42: WAITING_USER without a QUESTION-nnnn reference is refused',
    !unnamed.ok && /WAITING_USER/.test(unnamed.output),
    (unnamed.output.split('\n').filter((line) => /WAITING_USER/.test(line))[0] || '').slice(0, 160),
  );

  /*
   * 43 — one package waits on the user; every independent package keeps moving.
   * This is what stops a single unanswered question stalling a whole program —
   * the state TASK-0004 has been sitting in with eleven packages behind it.
   */
  writePkg(
    'WP-01-waiting.md',
    pkg({ id: 'WP-01', status: 'WAITING_USER', questions: 'Blocked on QUESTION-0001.' }),
  );
  const parallelRun = run();
  let parallelReport = null;
  try {
    parallelReport = JSON.parse(parallelRun.output);
  } catch {
    parallelReport = null;
  }
  const readyIds = parallelReport?.tasks?.[0]?.ready ?? [];
  check(
    'simulation 43: a WAITING_USER package does not stop an independent READY package',
    parallelRun.ok && readyIds.includes('WP-02') && !readyIds.includes('WP-01'),
    'ready = ' + JSON.stringify(readyIds),
  );

  /*
   * 44 — resumption. The continuation pointer is recomputed from the dependency
   * graph, never trusted: a stale pointer sends the next session to a package
   * whose dependencies are unmet, or to nothing at all while work remains.
   */
  writeParent([row('WP-01', 'done', 'DONE'), row('WP-02', 'next', 'NOT_STARTED', 'WP-01')], 'WP-01');
  writePkg('WP-01-waiting.md', pkg({ id: 'WP-01', status: 'DONE' }));
  writePkg('WP-02-independent.md', pkg({ id: 'WP-02', status: 'NOT_STARTED', deps: ['WP-01'] }));
  const stalePointer = run();
  check(
    'simulation 44: a stale NEXT_READY_WORK_PACKAGE is caught by recomputation',
    !stalePointer.ok && /NEXT_READY_WORK_PACKAGE/.test(stalePointer.output),
    (stalePointer.output.split('\n').filter((line) => /NEXT_READY/.test(line))[0] || '').slice(0, 160),
  );

  writeParent([row('WP-01', 'done', 'DONE'), row('WP-02', 'next', 'NOT_STARTED', 'WP-01')], 'WP-02');
  const freshPointer = run();
  check(
    'simulation 44b: the corrected pointer is accepted, so a resuming session has a start',
    freshPointer.ok,
    freshPointer.output.split('\n').filter(Boolean).slice(0, 3).join(' | '),
  );

  /*
   * 45 — the context budget. A manifest naming nothing to skip is not a budget:
   * the agent falls back to reading whatever looks relevant, which is exactly
   * the behaviour the manifest exists to stop.
   */
  writePkg(
    'WP-02-independent.md',
    pkg({ id: 'WP-02', status: 'NOT_STARTED', deps: ['WP-01'], manifest: false }),
  );
  const noExclusions = run();
  check(
    'simulation 45: a context manifest with no DO_NOT_LOAD entries is refused',
    !noExclusions.ok && /DO_NOT_LOAD/.test(noExclusions.output),
    (noExclusions.output.split('\n').filter((line) => /DO_NOT_LOAD/.test(line))[0] || '').slice(0, 160),
  );

  /*
   * 46 — a package cannot reach DONE on an assumption nobody proved, or with no
   * evidence at all. Both are states where a guess has already been built on.
   */
  writeParent([row('WP-01', 'done', 'DONE'), row('WP-02', 'next', 'DONE', 'WP-01')], 'NONE');
  writePkg(
    'WP-02-independent.md',
    pkg({ id: 'WP-02', status: 'DONE', deps: ['WP-01'], assumption: 'UNVERIFIED' }),
  );
  const unverified = run();
  check(
    'simulation 46: a DONE package with an UNVERIFIED assumption is refused',
    !unverified.ok && /UNVERIFIED/.test(unverified.output),
    (unverified.output.split('\n').filter((line) => /UNVERIFIED/.test(line))[0] || '').slice(0, 160),
  );

  writePkg(
    'WP-02-independent.md',
    pkg({ id: 'WP-02', status: 'DONE', deps: ['WP-01'], evidence: 'None.' }),
  );
  const noEvidence = run();
  check(
    'simulation 46b: a DONE package with no Evidence is refused',
    !noEvidence.ok && /Evidence/.test(noEvidence.output),
    (noEvidence.output.split('\n').filter((line) => /Evidence/.test(line))[0] || '').slice(0, 160),
  );

  rmSync(sandbox, { recursive: true, force: true });
}

{
  /*
   * 47-49 — evidence reuse and invalidation.
   *
   * Executed against real git history in a throwaway repository. The whole
   * mechanism is a question about what changed between two commits, and a mocked
   * answer would prove nothing about it.
   */
  const sandbox = mkdtempSync(join(tmpdir(), 'dijipeople-evidence-'));
  const git = (args) =>
    execFileSync('git', args, { cwd: sandbox, stdio: 'pipe', encoding: 'utf8' }).trim();

  let ready = true;
  let baseSha = '';
  try {
    git(['init', '--initial-branch=main', '.']);
    git(['config', 'user.email', 'probe@example.com']);
    git(['config', 'user.name', 'probe']);
    mkdirSync(join(sandbox, 'src'), { recursive: true });
    mkdirSync(join(sandbox, 'docs'), { recursive: true });
    writeFileSync(join(sandbox, 'src/app.ts'), 'export const a = 1;\n');
    writeFileSync(join(sandbox, 'docs/readme.md'), 'notes\n');
    git(['add', '.']);
    git(['commit', '-m', 'base']);
    baseSha = git(['rev-parse', '--short', 'HEAD']);
  } catch (error) {
    ready = false;
    warn('evidence simulation could not initialise — ' + String(error.message).split('\n')[0]);
  }

  if (ready) {
    const evidence = (args) => runScript('scripts/evidence.mjs', [...args, '--root', sandbox]);

    evidence([
      'record',
      'DB-E2E-001',
      '--command',
      'suite',
      '--scope',
      'src',
      '--result',
      'PASS',
      '--sha',
      baseSha,
    ]);

    /* 47 — an unrelated documentation commit must not invalidate expensive evidence. */
    writeFileSync(join(sandbox, 'docs/readme.md'), 'notes, revised\n');
    git(['add', '.']);
    git(['commit', '-m', 'docs only']);

    const afterDocs = evidence(['check', 'DB-E2E-001']);
    check(
      'simulation 47: evidence survives a change outside its declared scope',
      afterDocs.ok && /REUSABLE/.test(afterDocs.output),
      afterDocs.output.split('\n').filter(Boolean).slice(0, 3).join(' | '),
    );

    /* 48 — a change inside the scope invalidates it, and names the file. */
    writeFileSync(join(sandbox, 'src/app.ts'), 'export const a = 2;\n');
    git(['add', '.']);
    git(['commit', '-m', 'in scope']);

    const afterCode = evidence(['check', 'DB-E2E-001']);
    check(
      'simulation 48: evidence is invalidated by a change inside its scope',
      !afterCode.ok && /INVALIDATED/.test(afterCode.output) && /src\/app\.ts/.test(afterCode.output),
      afterCode.output.split('\n').filter(Boolean).slice(0, 4).join(' | '),
    );

    /*
     * 49 — a record with no scope is refused at the point of recording. Without
     * it, the laziest possible evidence would be the most durable thing in the
     * ledger, because nothing could ever invalidate it.
     */
    const noScope = evidence(['record', 'NO-SCOPE-001', '--command', 'suite', '--result', 'PASS']);
    check(
      'simulation 49: evidence with no declared scope is refused',
      !noScope.ok && /scope/i.test(noScope.output),
      noScope.output.split('\n').filter(Boolean).slice(0, 3).join(' | '),
    );
  }

  rmSync(sandbox, { recursive: true, force: true });
}

{
  /*
   * 50-53 — test resource ownership and cleanup.
   *
   * The registry is exercised directly. Every one of these is a behaviour about
   * what happens when something goes wrong, and all of them are invisible to a
   * suite that only exercises the happy path.
   */
  const { createRegistry } = await import('./lib/test-resources.mjs');

  /* 50 — the ordinary case: everything created is accounted for. */
  const clean = createRegistry('RUN-001');
  clean.register({ type: 'tenant', id: 't1' });
  clean.register({ type: 'employee', id: 'e1' });
  await clean.cleanup(async () => 'CLEANED');
  const cleanSummary = clean.summary();
  check(
    'simulation 50: a run that cleans what it created reports zero unaccounted',
    cleanSummary.TEST_RESOURCES_CREATED === 2 &&
      cleanSummary.TEST_RESOURCES_CLEANED === 2 &&
      cleanSummary.UNACCOUNTED_TEST_RESOURCES === 0,
    JSON.stringify(cleanSummary),
  );

  /*
   * 51 — setup fails halfway. Teardown must clean exactly the two things that
   * were made, not the six the fixture intended, and must not throw on ids that
   * never existed.
   */
  const partial = createRegistry('RUN-002');
  const cleaned = [];
  try {
    partial.register({ type: 'tenant', id: 't1' });
    partial.register({ type: 'business-unit', id: 'bu1' });
    throw new Error('setup failed on step three');
  } catch {
    /* the fixture aborts here, exactly as a real one would */
  }
  await partial.cleanup(async (resource) => {
    cleaned.push(resource.type + ':' + resource.id);
    return 'CLEANED';
  });
  check(
    'simulation 51: a partially failed setup cleans only what was actually created',
    cleaned.length === 2 &&
      cleaned.includes('tenant:t1') &&
      cleaned.includes('business-unit:bu1') &&
      partial.summary().UNACCOUNTED_TEST_RESOURCES === 0,
    JSON.stringify(cleaned),
  );

  /* Reverse order, so a cascade or a foreign key does not defeat the teardown. */
  check(
    'simulation 51b: cleanup runs in reverse creation order',
    cleaned[0] === 'business-unit:bu1',
    JSON.stringify(cleaned),
  );

  /*
   * 52 — a cleanup that fails must be visible and must stop a PASS. A
   * try/catch around teardown turns a leaked tenant into a green suite.
   */
  const leaked = createRegistry('RUN-003');
  leaked.register({ type: 'tenant', id: 't1' });
  leaked.register({ type: 'stripe-customer', id: 'cus_1' });
  await leaked.cleanup(async (resource) => {
    if (resource.type === 'stripe-customer') throw new Error('provider refused');
    return 'CLEANED';
  });
  const leakedVerdict = leaked.mayPass();
  check(
    'simulation 52: a failed owned-resource cleanup blocks a QA PASS',
    !leakedVerdict.ok &&
      leaked.summary().TEST_RESOURCE_CLEANUP_FAILURES === 1 &&
      /provider refused/.test(leaked.summary().failures.join(' ')),
    JSON.stringify(leakedVerdict.reasons),
  );

  /*
   * 53 — durable evidence is not an ephemeral resource. Deleting the screenshot
   * because the row it was taken against was deleted destroys the proof the run
   * existed to produce.
   */
  const withEvidence = createRegistry('RUN-004');
  withEvidence.register({ type: 'tenant', id: 't1' });
  withEvidence.register({ type: 'screenshot', id: 'shot-1.png' });
  const touched = [];
  await withEvidence.cleanup(async (resource) => {
    touched.push(resource.type);
    return 'CLEANED';
  });
  const evidenceSummary = withEvidence.summary();
  check(
    'simulation 53: durable evidence is retained, not cleaned with the resource',
    !touched.includes('screenshot') &&
      evidenceSummary.TEST_RESOURCES_RETAINED_AS_EVIDENCE === 1 &&
      evidenceSummary.UNACCOUNTED_TEST_RESOURCES === 0,
    JSON.stringify({ touched, summary: evidenceSummary }),
  );

  /*
   * 53c — a provider that will not delete an object reports the limitation. A
   * false CLEANED is worse than an honest one, because the next run trusts it.
   */
  const provider = createRegistry('RUN-005');
  provider.register({ type: 'stripe-price', id: 'price_1', cleanup: 'archive' });
  await provider.cleanup(async () => 'ARCHIVED_PROVIDER_LIMITATION');
  const providerSummary = provider.summary();
  check(
    'simulation 53c: an undeletable provider object is ARCHIVED, never reported CLEANED',
    providerSummary.TEST_RESOURCES_ARCHIVED_PROVIDER_LIMITATION === 1 &&
      providerSummary.TEST_RESOURCES_CLEANED === 0 &&
      providerSummary.UNACCOUNTED_TEST_RESOURCES === 0,
    JSON.stringify(providerSummary),
  );
}

{
  /*
   * 54 — id allocation for every numbered shared resource.
   *
   * Successive allocations must not collide. This repository has twice had to
   * renumber colliding records, both times because an id was chosen by scanning
   * a directory rather than reserved through the allocator.
   */
  const { allocateId } = await import('./lib/id-allocator.mjs');

  for (const kind of ['regression', 'bug', 'question']) {
    const ids = new Set();
    let failed = '';
    try {
      for (let index = 0; index < 4; index += 1) {
        ids.add(allocateId(ROOT, kind, { note: 'validate-framework allocation probe' }));
      }
    } catch (error) {
      failed = String(error.message).split('\n')[0];
    }

    check(
      'simulation 54: four successive ' + kind + ' allocations are all distinct',
      !failed && ids.size === 4,
      failed || 'got ' + JSON.stringify([...ids]),
    );
  }
}

{
  /*
   * 55-56 — semantic record validation.
   *
   * A record whose terminal status contradicts its own prose, and — just as
   * important — a record stating an honest gap that must NOT be flagged.
   */
  const { loadRecords } = await import('./lib/backlog-records.mjs');

  const sandbox = mkdtempSync(join(tmpdir(), 'dijipeople-semantic-'));
  mkdirSync(join(sandbox, 'docs/bugs'), { recursive: true });

  const bug = (retest) =>
    [
      '---',
      'ID: BUG-0001',
      'Title: probe',
      'Status: VERIFIED',
      'Severity: HIGH',
      'Priority: P1',
      'Type: BUG',
      'Source: QA_RUN',
      'DetectedDate: 2026-08-01',
      'DetectedInSha: abc1234',
      'AffectedModules: [services/api]',
      'OwnerAgent: backend-api',
      'ArchitectDisposition: DONE',
      'QAReport:',
      'RegressionId:',
      'RelatedBacklogItem:',
      'RelatedDecision:',
      'RelatedImplementation:',
      'CreatedAt: 2026-08-01',
      'UpdatedAt: 2026-08-02',
      'ResolvedAt: 2026-08-02',
      '---',
      '',
      '# BUG-0001 — probe',
      '',
      '## Summary',
      'Probe.',
      '',
      '## Expected Behavior',
      'Probe.',
      '',
      '## Actual Behavior',
      'Probe.',
      '',
      '## Reproduction',
      'Probe.',
      '',
      '## Evidence',
      'Probe.',
      '',
      '## Root Cause',
      'Probe.',
      '',
      '## Impact',
      'Probe.',
      '',
      '## Affected Areas',
      'Probe.',
      '',
      '## Proposed Resolution',
      'Probe.',
      '',
      '## Acceptance Criteria',
      'Probe.',
      '',
      '## Regression Coverage',
      'Probe.',
      '',
      '## Dependencies',
      'Probe.',
      '',
      '## Related Items',
      'Probe.',
      '',
      '## Resolution',
      'The guard now scopes by tenant.',
      '',
      '## QA Retest',
      retest,
      '',
      '## History',
      '- probe',
    ].join('\n');

  const path = join(sandbox, 'docs/bugs/BUG-0001-probe.md');

  /* 55 — VERIFIED above a section saying the retest never ran. */
  writeFileSync(path, bug('The retest has not yet been run.'), 'utf8');
  const contradictory = loadRecords(sandbox);
  check(
    'simulation 55: VERIFIED contradicting its own QA Retest section is caught',
    contradictory.errors.some((error) => /contradicts its own/.test(error)),
    contradictory.errors.slice(0, 2).join(' | '),
  );

  /*
   * 56 — the false positive that must not happen. BUG-0034 is a real record that
   * ran its retest, passed, and stated precisely what it could not cover. It was
   * this check's first output, and flagging it would teach people to stop
   * writing their limits down.
   */
  writeFileSync(
    path,
    bug(
      [
        'Pass, with one honest gap.',
        '',
        'The unit suites cover the scoped query.',
        '',
        'Not verified end-to-end. There is no staging environment here, so no',
        'agent has actually installed through this path.',
      ].join('\n'),
    ),
    'utf8',
  );
  const honest = loadRecords(sandbox);
  check(
    'simulation 56: a passing retest that declares a scoped gap is NOT flagged',
    !honest.errors.some((error) => /contradicts its own/.test(error)),
    honest.errors.slice(0, 2).join(' | '),
  );

  rmSync(sandbox, { recursive: true, force: true });
}

{
  /*
   * 57-58 — the QA evidence hierarchy.
   *
   * A static source-shape test is useful and is not behavioural proof. Three
   * authorization defects shipped here behind tests asserting a decorator was
   * present while the guard was inert.
   */
  const { evidenceSatisfies, evidenceRank } = await import('./lib/qa-records.mjs');

  const below = evidenceSatisfies('L4_REAL_POSTGRESQL', 'L1_STATIC_SOURCE_SHAPE', 'PASS');
  check(
    'simulation 57: a PASS below its required evidence level is refused',
    !below.ok && /below/.test(below.reason),
    below.reason,
  );

  const met = evidenceSatisfies('L2_UNIT_BEHAVIORAL', 'L4_REAL_POSTGRESQL', 'PASS');
  check('simulation 58: a PASS at or above the required level is accepted', met.ok, met.reason);

  /*
   * Only success is gated. Reporting a FAIL on weak evidence is honest, and a
   * rule blocking it would discourage saying anything is broken.
   */
  const failing = evidenceSatisfies('L5_BROWSER_JOURNEY', 'L1_STATIC_SOURCE_SHAPE', 'FAIL');
  check(
    'simulation 58b: a FAIL on low evidence is still allowed to be reported',
    failing.ok,
    failing.reason,
  );

  check(
    'simulation 58c: the hierarchy is ordered, so levels are comparable',
    evidenceRank('L0_DOCUMENTATION') < evidenceRank('L4_REAL_POSTGRESQL') &&
      evidenceRank('L4_REAL_POSTGRESQL') < evidenceRank('L7_PRODUCTION_SMOKE'),
    'ranks are not monotonic',
  );
}

{
  /*
   * 59-60 — the Obsidian node contract.
   *
   * Provenance round-trip, status parity, and the link rules that stop a
   * detected inconsistency being converted into a fabricated one.
   */
  const { renderNote, readProvenance } = await import('./lib/obsidian-node.mjs');
  const { relationshipIsValid, nodeTypeFor } = await import('./lib/obsidian-mappings.mjs');

  const source = [
    '---',
    'ID: BUG-0005',
    'Status: VERIFIED',
    'AffectedModules: [services/api/src/modules/auth]',
    '---',
    '',
    '# BUG-0005 — probe',
    '',
    'Body.',
  ].join('\n');

  const rendered = renderNote({
    source,
    sourcePath: 'docs/bugs/BUG-0005-probe.md',
    filename: 'BUG-0005-probe.md',
    nodeType: 'bug',
    sourceCommit: 'abc1234',
    lastVerified: '2026-08-19',
  });
  const provenance = readProvenance(rendered);

  check(
    'simulation 59: a generated note carries provenance derived from its record',
    provenance !== null &&
      provenance.sourceId === 'BUG-0005' &&
      provenance.sourcePath === 'docs/bugs/BUG-0005-probe.md' &&
      provenance.nodeType === 'bug' &&
      provenance.status === 'VERIFIED' &&
      provenance.sourceCommit === 'abc1234',
    JSON.stringify(provenance),
  );

  /*
   * 59b — a note without generated:true belongs to a human. Reading it as
   * generated is what would let the sync overwrite somebody's own notes.
   */
  check(
    'simulation 59b: a note without generated:true is not treated as generated',
    readProvenance('---\nID: BUG-0005\n---\n\nManual note.\n') === null,
    'manual notes must never be claimed by the generator',
  );

  /*
   * 59c — status parity. A vault saying OPEN while the record says VERIFIED is
   * worse than a vault with no status: somebody reads it and acts on it.
   */
  const staleNote = rendered.replace('status: VERIFIED', 'status: OPEN');
  check(
    'simulation 59c: a status mismatch between note and record is detectable',
    readProvenance(staleNote).status === 'OPEN' && /^Status: VERIFIED$/m.test(source),
    'the note and its record must be comparable on status',
  );

  /*
   * 60 — semantic links.
   *
   * This rule was rewritten mid-package, and the rewrite is the lesson. The
   * first version enumerated which pairs were legitimate and produced 607
   * errors against the real vault — almost all of them *good* links: an item
   * pointing at the bug pattern it addresses, an item citing the requirement it
   * came from. The grammar was describing one author's guess, not the graph.
   *
   * What survives is the rule that is actually defensible: knowledge may link to
   * knowledge, and nothing may link into a generated listing surface. That still
   * forbids the move the framework cares about — pointing an isolated note at
   * the index so the dot disappears — without inventing relationships.
   */
  check(
    'simulation 60: knowledge linking to knowledge is accepted',
    relationshipIsValid('bug', 'regression') &&
      relationshipIsValid('task', 'work-package') &&
      relationshipIsValid('backlog-item', 'bug-pattern') &&
      relationshipIsValid('product-knowledge', 'bug'),
    'the enumerated grammar rejected the last two, and the vault was right',
  );
  check(
    'simulation 60b: linking into a generated listing surface is a semantic link error',
    !relationshipIsValid('bug', 'dashboard') && !relationshipIsValid('backlog-item', 'dashboard'),
    'linking at the index is the cheapest way to fake a relationship',
  );
  check(
    'simulation 60c: a listing surface linking outward is exempt',
    relationshipIsValid('dashboard', 'bug') && relationshipIsValid('dashboard', 'session'),
    'a listing surface links everywhere by design; that is its whole job',
  );

  /*
   * 60d — a work package is not its parent task. They take part in different
   * relationships, so sharing a node type would make both sets of checks wrong.
   */
  check(
    'simulation 60d: a work-package file is typed separately from its parent task',
    nodeTypeFor({ from: 'docs/tasks', nodeType: 'task' }, 'TASK-0012-x/work-packages/WP-01-y.md') ===
      'work-package' &&
      nodeTypeFor({ from: 'docs/tasks', nodeType: 'task' }, 'TASK-0012-x.md') === 'task',
    'the parent and its packages must not share a type',
  );
}

{
  /*
   * 61-62 — backlog stewardship and agent health.
   *
   * Both are reporting mechanisms, and both are worth having only if they report
   * the truth rather than a comfortable number.
   */
  const review = runScript('scripts/backlog-review.mjs', ['--json']);
  let stewardReport = null;
  try {
    stewardReport = JSON.parse(review.output);
  } catch {
    stewardReport = null;
  }

  check(
    'simulation 61: the steward view computes record-health detectors',
    stewardReport !== null &&
      typeof stewardReport.health === 'object' &&
      'OWNERLESS' in stewardReport.health &&
      'NO_ACCEPTANCE_CRITERIA' in stewardReport.health &&
      'NO_NEXT_ACTION' in stewardReport.health,
    review.output.split('\n').slice(0, 2).join(' | '),
  );

  /*
   * 61b — the ranking must be able to disagree with severity, or it is severity
   * sorting with extra steps. Every entry carries the reasons that produced it,
   * so a human argues with the evidence rather than the number.
   */
  const ranked = stewardReport?.nextBestActions ?? [];
  check(
    'simulation 61b: NEXT_BEST_ACTIONS ranks with stated reasons, not severity alone',
    ranked.length > 0 &&
      ranked.every((entry) => Array.isArray(entry.reasons) && entry.reasons.length > 0) &&
      ranked.some((entry) => entry.reasons.some((reason) => !/^severity/.test(reason))),
    JSON.stringify(ranked.slice(0, 1)),
  );

  const health = runScript('scripts/agent-health.mjs', ['--json']);
  let healthReport = null;
  try {
    healthReport = JSON.parse(health.output);
  } catch {
    healthReport = null;
  }

  /*
   * 62 — signals the records cannot support are reported as NOT_DERIVABLE with a
   * reason, never estimated. A number invented to fill a column gets trusted,
   * which makes it worse than an empty column.
   */
  check(
    'simulation 62: agent health reports non-derivable signals rather than fabricating them',
    healthReport !== null &&
      typeof healthReport.NOT_DERIVABLE === 'object' &&
      Object.keys(healthReport.NOT_DERIVABLE).length > 0 &&
      Object.values(healthReport.NOT_DERIVABLE).every((reason) => String(reason).length > 20),
    JSON.stringify(Object.keys(healthReport?.NOT_DERIVABLE ?? {})),
  );

  check(
    'simulation 62b: agent health canonicalises role names before deriving anything',
    healthReport !== null &&
      Array.isArray(healthReport.roles) &&
      healthReport.roles.length > 0 &&
      healthReport.roles.every((role) => !role.role.includes('/')),
    'a role spelled two ways splits its history and makes every signal plausible and false',
  );
}

{
  /*
   * 63 — a concurrent session dirties the primary checkout mid-task.
   *
   * The model used to assume only the running task changes the primary
   * worktree, so a path another session touched had nowhere to land but
   * UNEXPLAINED — which blocks completion. The only escape was to list it in
   * --primary-baseline, asserting it predated the task when it did not.
   *
   * TASK-0012 hit this for real: SESSION-0025 edited services/api/package.json
   * in the primary checkout while this program was running.
   *
   * Both directions are asserted, because attribution is only safe if it cannot
   * be used to wave through a file nobody owns.
   */
  const sandbox = mkdtempSync(join(tmpdir(), 'dijipeople-attribution-'));
  const origin = join(sandbox, 'origin.git');
  const work = join(sandbox, 'work');

  const git = (args, cwd) =>
    execFileSync('git', args, { cwd, stdio: 'pipe', encoding: 'utf8' }).trim();

  let ready = true;
  try {
    mkdirSync(work, { recursive: true });
    git(['init', '--bare', '--initial-branch=main', origin], sandbox);
    git(['init', '--initial-branch=main', '.'], work);
    git(['config', 'user.email', 'probe@example.com'], work);
    git(['config', 'user.name', 'probe'], work);
    git(['remote', 'add', 'origin', origin], work);

    mkdirSync(join(work, 'docs/sessions'), { recursive: true });
    mkdirSync(join(work, 'services/api'), { recursive: true });
    writeFileSync(join(work, 'services/api/package.json'), '{"name":"api"}\n');
    writeFileSync(
      join(work, 'docs/sessions/SESSION-0025-probe.md'),
      ['---', 'SESSION_ID: SESSION-0025', 'STATUS: ACTIVE', '---', '', '# probe', ''].join('\n'),
    );
    git(['add', '.'], work);
    git(['commit', '-m', 'base'], work);
    git(['push', '-q', 'origin', 'main'], work);
    git(['branch', 'develop'], work);
    git(['push', '-q', 'origin', 'develop'], work);
    git(['fetch', '-q', 'origin'], work);

    /* The concurrent session's edit: present, uncommitted, and not this task's. */
    writeFileSync(join(work, 'services/api/package.json'), '{"name":"api","heap":1536}\n');
  } catch (error) {
    ready = false;
    warn('attribution simulation could not initialise — ' + String(error.message).split('\n')[0]);
  }

  if (ready) {
    const health = (args) => {
      const result = runScript('scripts/repo-health.mjs', ['--root', work, '--json', ...args]);
      try {
        return JSON.parse(result.output);
      } catch {
        return null;
      }
    };

    const unattributed = health([]);
    check(
      'simulation 63: an unowned change in the primary checkout is UNEXPLAINED',
      unattributed?.PRIMARY_WORKTREE_STATUS === 'DIRTY_UNEXPLAINED',
      'got ' + JSON.stringify(unattributed?.PRIMARY_WORKTREE_STATUS),
    );

    const attributed = health(['--primary-attributed', 'SESSION-0025:services/api/package.json']);
    check(
      'simulation 63b: attributing it to an ACTIVE session resolves it without touching the file',
      attributed?.PRIMARY_WORKTREE_STATUS === 'DIRTY_OTHER_SESSION_OWNED' &&
        (attributed?.unexplainedDirtyFiles?.length ?? 1) === 0,
      'got ' +
        JSON.stringify(attributed?.PRIMARY_WORKTREE_STATUS) +
        ' with ' +
        JSON.stringify(attributed?.unexplainedDirtyFiles),
    );

    /*
     * 63c — the guard. Naming a session that is not active must NOT resolve the
     * path, or attribution becomes a way to launder any file at all.
     */
    const bogus = health(['--primary-attributed', 'SESSION-9999:services/api/package.json']);
    check(
      'simulation 63c: attributing to a session that is not ACTIVE leaves it UNEXPLAINED',
      bogus?.PRIMARY_WORKTREE_STATUS === 'DIRTY_UNEXPLAINED',
      'got ' + JSON.stringify(bogus?.PRIMARY_WORKTREE_STATUS),
    );

    /* The file is reported, never modified — that is the whole point. */
    check(
      'simulation 63d: the attributed file is left exactly as the other session left it',
      readFileSync(join(work, 'services/api/package.json'), 'utf8').includes('1536'),
      'repo-health reports; it never writes',
    );
  }

  rmSync(sandbox, { recursive: true, force: true });
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
