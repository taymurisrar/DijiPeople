/*
 * Durable questions raised by a specialist and routed to the user.
 *
 * Two failures meet here, and they pull in opposite directions.
 *
 * The framework used to carry a blanket "do not ask questions" rule, meant to
 * stop agents interrupting for things the repository already answers. What it
 * actually produced was agents guessing at material business decisions to
 * preserve autonomy, and revealing the guess in the final report — after the
 * work that depended on it was built.
 *
 * The opposite failure is a question asked, answered, and then lost, because the
 * answer lived only in chat. The next session asks again. A user who answers the
 * same pricing question three times is right to conclude the framework does not
 * remember anything.
 *
 * So a question is a record: it names who asked, what it blocks, what the
 * options are and what the asker recommends — and once answered it carries the
 * ADR that made the answer durable. `ANSWER` without `DECISION_ID` is the state
 * this file is most interested in catching, because that is exactly the shape of
 * an answer that will be lost.
 *
 * The dialect is the same flat `Key: value` frontmatter as every other record
 * system here. Two dialects is how agents learn one and get the other wrong.
 *
 * No dependencies.
 */

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

import {
  recordFilesIn,
  splitFrontmatter,
  parseFrontmatter,
  writeIfChanged,
  slugify,
} from './backlog-records.mjs';

export { writeIfChanged, slugify };

// ------------------------------------------------------------------ vocabulary

export const QUESTION_DIR = 'docs/questions';

/**
 * Why this could not be answered from the repository.
 *
 * The list is deliberately specific. "I was unsure" is not a category; every
 * entry names a kind of uncertainty that repository evidence genuinely cannot
 * settle, which is the test for whether asking is legitimate at all.
 */
export const QUESTION_CATEGORIES = [
  'USER_DECISION_REQUIRED',
  'BUSINESS_RULE_UNCLEAR',
  'MATERIAL_ASSUMPTION',
  'CONFLICTING_REQUIREMENTS',
  'CONFLICTING_SOURCES',
  'EXTERNAL_CAPABILITY_UNKNOWN',
  'DESTRUCTIVE_ACTION_UNCERTAIN',
  'SECURITY_OR_LEGAL_AMBIGUITY',
  'TECHNICAL_DOUBT_WITH_MATERIAL_CONSEQUENCE',
  'BLOCKER',
];

export const QUESTION_STATUSES = ['OPEN', 'ANSWERED', 'WITHDRAWN', 'SUPERSEDED'];

/**
 * How far the question reaches.
 *
 * PACKAGE is the common and desirable case: one package waits, every
 * independent package keeps moving. TASK stops the parent and should be rare —
 * if a question genuinely blocks everything, the decomposition is usually
 * wrong.
 */
export const QUESTION_BLOCKING = ['NONE', 'PACKAGE', 'TASK'];

export const QUESTION_REQUIRED_FIELDS = [
  'QUESTION_ID',
  'TITLE',
  'STATUS',
  'CATEGORY',
  'ASKED_BY_AGENT',
  'ASKED_AT',
  'TASK_ID',
  'WORK_PACKAGE_ID',
  'BLOCKING',
  'ANSWER',
  'DECISION_ID',
  'KNOWLEDGE_IMPACT',
];

/** Body sections every question carries, in order. */
export const QUESTION_SECTIONS = [
  'Question',
  'Why It Matters',
  'Options',
  'Agent Recommendation',
  'Answer',
];

// --------------------------------------------------------------------- parsing

/*
 * The `## <name>` block of a body, or '' when absent or empty.
 *
 * `[^\S\r\n]*` rather than `\s*` after the heading, and the difference is the
 * whole check. `\s*` is greedy across newlines, so for an *empty* section it
 * swallows the blank line and the boundary with it, and the capture runs on
 * into the next section — which means an empty "## Agent Recommendation"
 * silently returns the text of "## Answer" and reads as populated.
 *
 * The empty section is precisely the case this validator exists to catch, so
 * the greedy version failed in exactly the situation it was written for.
 */
function sectionText(body, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(
    `##[^\\S\\r\\n]+${escaped}[^\\S\\r\\n]*\\r?\\n([\\s\\S]*?)(?=\\r?\\n##[^\\S\\r\\n]|$)`,
  ).exec(body);
  return match ? match[1].trim() : '';
}

const EMPTY = /^(none|n\/a|tbd|pending|—|-)\.?$/i;

function validate(record, errors) {
  const { fields, relative, body } = record;
  const where = relative;

  for (const field of QUESTION_REQUIRED_FIELDS) {
    if (!(field in fields)) errors.push(`${where}: missing required field ${field}`);
  }

  const NON_EMPTY = ['QUESTION_ID', 'TITLE', 'STATUS', 'CATEGORY', 'ASKED_BY_AGENT', 'ASKED_AT', 'BLOCKING'];
  for (const field of NON_EMPTY) {
    if (field in fields && !String(fields[field] ?? '').trim()) {
      errors.push(`${where}: ${field} must not be empty`);
    }
  }

  const id = String(fields.QUESTION_ID ?? '').trim();
  if (id && !/^QUESTION-\d{4}$/.test(id)) {
    errors.push(`${where}: QUESTION_ID "${id}" does not match QUESTION-nnnn`);
  }
  if (id && !basename(where).startsWith(`${id}-`)) {
    errors.push(`${where}: filename must start with "${id}-" so the id and the file cannot drift`);
  }

  const enumCheck = (field, allowed) => {
    const value = String(fields[field] ?? '').trim();
    if (!value) return;
    if (!allowed.includes(value)) {
      errors.push(`${where}: ${field} = "${value}" is not one of ${allowed.join(' | ')}`);
    }
  };

  enumCheck('STATUS', QUESTION_STATUSES);
  enumCheck('CATEGORY', QUESTION_CATEGORIES);
  enumCheck('BLOCKING', QUESTION_BLOCKING);

  if (String(fields.ASKED_AT ?? '').trim() && !/^\d{4}-\d{2}-\d{2}$/.test(String(fields.ASKED_AT).trim())) {
    errors.push(`${where}: ASKED_AT = "${fields.ASKED_AT}" is not YYYY-MM-DD`);
  }

  for (const name of QUESTION_SECTIONS) {
    if (!new RegExp(`##\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\r?\\n`).test(body)) {
      errors.push(`${where}: missing required section "## ${name}"`);
    }
  }

  const status = String(fields.STATUS ?? '').trim();
  const answer = String(fields.ANSWER ?? '').trim();
  const decision = String(fields.DECISION_ID ?? '').trim();

  /*
   * An OPEN question that already records an answer is a question nobody
   * closed — and the package waiting on it is still waiting for no reason.
   */
  if (status === 'OPEN' && answer && !EMPTY.test(answer)) {
    errors.push(`${where}: STATUS OPEN but ANSWER is populated — close the question or clear the answer`);
  }

  if (status === 'ANSWERED') {
    if (!answer || EMPTY.test(answer)) {
      errors.push(`${where}: STATUS ANSWERED with no ANSWER`);
    }
    const prose = sectionText(body, 'Answer');
    if (!prose || EMPTY.test(prose)) {
      errors.push(`${where}: STATUS ANSWERED but the Answer section is empty — the record must carry the reasoning, not just the verdict`);
    }
  }

  /*
   * The rule this file exists for. A durable decision that lives only in a
   * question record is a decision the next task will not find, because nothing
   * retrieves questions by module — it retrieves decisions. USER_DECISION_REQUIRED
   * and BUSINESS_RULE_UNCLEAR are precisely the categories whose answers recur.
   */
  const durable = ['USER_DECISION_REQUIRED', 'BUSINESS_RULE_UNCLEAR', 'SECURITY_OR_LEGAL_AMBIGUITY'];
  if (status === 'ANSWERED' && durable.includes(String(fields.CATEGORY ?? '').trim())) {
    if (!decision || EMPTY.test(decision)) {
      errors.push(
        `${where}: a ${fields.CATEGORY} question was answered without a DECISION_ID — the answer would be lost and the user asked again`,
      );
    } else if (!/^ADR-\d{4}$/.test(decision)) {
      errors.push(`${where}: DECISION_ID "${decision}" does not match ADR-nnnn`);
    }
  }

  /* Options without a recommendation pushes the whole analysis onto the user. */
  if (status === 'OPEN') {
    const recommendation = sectionText(body, 'Agent Recommendation');
    if (!recommendation || EMPTY.test(recommendation)) {
      errors.push(
        `${where}: an OPEN question carries no Agent Recommendation — asking without a recommendation moves the analysis onto the user`,
      );
    }
  }
}

/** Load every question record under `root`, validated. Never throws. */
export function loadQuestions(root) {
  const questions = [];
  const errors = [];

  for (const file of recordFilesIn(root, QUESTION_DIR)) {
    if (['index.md', 'open.md', 'answered.md'].includes(file.name)) continue;

    let text;
    try {
      text = readFileSync(file.path, 'utf8');
    } catch (error) {
      errors.push(`${file.relative}: unreadable — ${error.message}`);
      continue;
    }

    const split = splitFrontmatter(text);
    if (!split) {
      errors.push(`${file.relative}: no --- frontmatter block`);
      continue;
    }

    const { fields, errors: parseErrors } = parseFrontmatter(split.raw);
    for (const message of parseErrors) errors.push(`${file.relative}: ${message}`);

    const record = {
      fields,
      body: split.body,
      relative: file.relative,
      path: file.path,
      id: String(fields.QUESTION_ID ?? '').trim(),
      title: String(fields.TITLE ?? '').trim(),
      status: String(fields.STATUS ?? '').trim(),
      category: String(fields.CATEGORY ?? '').trim(),
      askedBy: String(fields.ASKED_BY_AGENT ?? '').trim(),
      askedAt: String(fields.ASKED_AT ?? '').trim(),
      taskId: String(fields.TASK_ID ?? '').trim(),
      workPackageId: String(fields.WORK_PACKAGE_ID ?? '').trim(),
      blocking: String(fields.BLOCKING ?? '').trim(),
      answer: String(fields.ANSWER ?? '').trim(),
      decisionId: String(fields.DECISION_ID ?? '').trim(),
    };

    validate(record, errors);
    questions.push(record);
  }

  const seen = new Set();
  for (const question of questions) {
    if (question.id && seen.has(question.id)) errors.push(`${QUESTION_DIR}: duplicate id ${question.id}`);
    seen.add(question.id);
  }

  return { questions, errors };
}

/**
 * Which packages are legitimately waiting, and which are waiting on nothing.
 *
 * A package marked WAITING_USER whose question is already ANSWERED is the
 * expensive case: work that could have resumed and did not.
 */
export function stalledPackages(questions, waitingPackageIds) {
  const openByPackage = new Map();
  for (const question of questions) {
    if (question.status !== 'OPEN') continue;
    if (!question.workPackageId) continue;
    openByPackage.set(question.workPackageId, question.id);
  }

  return waitingPackageIds
    .filter((id) => !openByPackage.has(id))
    .map((id) => `${id} is WAITING_USER but no OPEN question names it`);
}
