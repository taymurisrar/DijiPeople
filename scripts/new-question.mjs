#!/usr/bin/env node
/*
 * Raise a durable question and route it to the user.
 *
 *   node scripts/new-question.mjs "Should trial tenants keep data after expiry?" \
 *     --category USER_DECISION_REQUIRED --agent Backend/API \
 *     --task TASK-0012 --wp WP-07 --blocking PACKAGE
 *
 * Any specialist may raise one, at any point. The bar is not seniority, it is
 * whether repository evidence can answer it: if reading the code, the records or
 * the context layer settles the matter, that is an assumption to verify, not a
 * question to ask.
 *
 * The id is allocated atomically, so two sessions raising questions at once
 * cannot collide. The scaffold deliberately leaves Options and Agent
 * Recommendation empty — a question routed to the user without a recommendation
 * moves the whole analysis onto them, and `rebuild-questions.mjs --check`
 * refuses an OPEN question in that state.
 *
 * Exit codes: 0 created · 1 refused · 2 usage error
 *
 * No dependencies.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { allocateId } from './lib/id-allocator.mjs';
import {
  QUESTION_DIR,
  QUESTION_CATEGORIES,
  QUESTION_BLOCKING,
  slugify,
} from './lib/question-records.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const title = argv.find((arg) => !arg.startsWith('--'));

function option(name, fallback = '') {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (argv[index + 1] ?? '');
}

if (!title || argv.includes('--help')) {
  console.error('Usage: node scripts/new-question.mjs "<question>" [options]');
  console.error('');
  console.error(`  --category   ${QUESTION_CATEGORIES.join(' | ')}`);
  console.error('  --agent      the specialist raising it                       (required)');
  console.error(`  --blocking   ${QUESTION_BLOCKING.join(' | ')}                (default PACKAGE)`);
  console.error('  --task       TASK-nnnn this arose in');
  console.error('  --wp         WP-nn this arose in');
  console.error('  --session    SESSION-nnnn, for the id allocation record');
  console.error('');
  console.error('Fill in Options and Agent Recommendation before routing it to the user.');
  process.exit(2);
}

const category = option('category', 'USER_DECISION_REQUIRED').trim();
if (!QUESTION_CATEGORIES.includes(category)) {
  console.error(`Refused: --category "${category}" is not one of ${QUESTION_CATEGORIES.join(' | ')}`);
  process.exit(1);
}

const blocking = option('blocking', 'PACKAGE').trim();
if (!QUESTION_BLOCKING.includes(blocking)) {
  console.error(`Refused: --blocking "${blocking}" is not one of ${QUESTION_BLOCKING.join(' | ')}`);
  process.exit(1);
}

const agent = option('agent').trim();
if (!agent) {
  console.error('Refused: --agent is required — a question with no asker cannot be routed back.');
  process.exit(1);
}

const askedAt = new Date().toISOString().slice(0, 10);
const id = allocateId(ROOT, 'question', {
  sessionId: option('session').trim(),
  note: title,
});

const filename = `${id}-${slugify(title).slice(0, 60)}.md`;
const dir = join(ROOT, QUESTION_DIR);
const path = join(dir, filename);

if (existsSync(path)) {
  console.error(`Refused: ${QUESTION_DIR}/${filename} already exists.`);
  process.exit(1);
}

/*
 * A durable category means the answer will be needed again by a task nobody has
 * written yet, so it has to become an ADR. The scaffold says so at the point the
 * question is raised rather than at the point it is answered, because that is
 * when the asker still has the context to say why it matters.
 */
const durable = ['USER_DECISION_REQUIRED', 'BUSINESS_RULE_UNCLEAR', 'SECURITY_OR_LEGAL_AMBIGUITY'];
const decisionNote = durable.includes(category)
  ? `This category is durable: once answered, record an ADR under \`docs/decisions/\`
and put its id in \`DECISION_ID\`. Without that the answer is lost and the user
is asked the same thing on the next task.`
  : `If the answer turns out to be a standing decision rather than a one-off,
record an ADR and put its id in \`DECISION_ID\`.`;

const body = `---
QUESTION_ID: ${id}
aliases: [${id}]
TITLE: ${title}
STATUS: OPEN
CATEGORY: ${category}
ASKED_BY_AGENT: ${agent}
ASKED_AT: ${askedAt}
TASK_ID: ${option('task').trim()}
WORK_PACKAGE_ID: ${option('wp').trim()}
BLOCKING: ${blocking}
ANSWER:
DECISION_ID:
KNOWLEDGE_IMPACT: DECISION
---

# ${id} — ${title}

## Question

${title}

State it so it can be answered without reading the codebase. If answering it
requires the user to reconstruct engineering context, the question is not ready
to route.

## Why It Matters

What breaks, or gets built wrong, if this is guessed. Name the work that depends
on it — that is what makes \`BLOCKING: ${blocking}\` true rather than asserted.

## Options

One row per genuinely available option. Do not list an option nobody would pick.

| OPTION | WHAT IT MEANS | COST | RISK |
|---|---|---|---|
|  |  |  |  |

## Agent Recommendation

Which option, and why. Required before this is routed to the user: asking
without a recommendation moves the analysis onto them.

## Answer

Filled in when answered, with the reasoning — not only the verdict. A record
that says "option B" tells a future reader nothing about why A was rejected.

${decisionNote}
`;

mkdirSync(dir, { recursive: true });
writeFileSync(path, body, 'utf8');

console.log(`Created ${QUESTION_DIR}/${filename}`);
console.log('');
console.log('Next, in this order:');
console.log('  1. Fill in Why It Matters, Options and Agent Recommendation.');
console.log(`  2. Set the waiting work package to WAITING_USER and name ${id} in its Questions section.`);
console.log('  3. node scripts/rebuild-questions.mjs');
console.log('  4. Ask the user — immediately, not in the final report. Keep every independent package moving.');
