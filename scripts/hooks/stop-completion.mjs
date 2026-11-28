#!/usr/bin/env node
/*
 * Stop hook: keeps the master program running until the deterministic verifier
 * says it may stop.
 *
 * Scoped, so it never touches an unrelated session: it acts only when
 *   1. `.claude/program-session.local.json` exists and is `active` (created by
 *      `node scripts/program-resume.mjs activate`, never committed), and
 *   2. the session's cwd is inside one of the worktrees that file lists.
 *
 * Decision:
 *   - verdict READY_TO_MERGE_MAIN / BLOCKED_OWNER_ACTION / BLOCKED_EXTERNAL → allow stop;
 *   - otherwise block once with the next gate named, unless the loop guards say stop.
 *
 * Loop guards (Claude Code re-runs this hook with stop_hook_active=true after a
 * block): no progress between two blocks (same HEAD and same gate states) three
 * times running, or `maxBlocks` blocks in total, allows the stop and records
 * why. An unfinished program is then reported as unfinished — never as done.
 *
 * It grants no permission and bypasses no control: it only asks the model to
 * keep working under the same permission settings.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { STOPPABLE, progressFingerprint, verifyProgram } from '../lib/program-completion.mjs';

const STATE_FILE = '.claude/program-session.local.json';

function inside(child, parent) {
  const c = resolve(child).toLowerCase();
  const p = resolve(parent).toLowerCase();
  return c === p || c.startsWith(p + sep);
}

/** Pure decision, so tests can drive it without a process. */
export function decide({ root, input, state, verify = verifyProgram }) {
  if (!state || !state.active) return { action: 'allow', why: 'program not active' };
  const cwd = input?.cwd ?? root;
  if (!(state.worktrees ?? []).some((tree) => inside(cwd, tree))) {
    return { action: 'allow', why: 'session is outside the program worktrees' };
  }

  const verifyRoot = state.verifyRoot ? resolve(state.verifyRoot) : root;
  const result = verify(verifyRoot, {});
  if (STOPPABLE.has(result.verdict)) {
    return { action: 'allow', why: result.verdict, result };
  }

  const fingerprint = progressFingerprint(verifyRoot, result);
  const next = { ...state };
  next.blocks = (state.blocks ?? 0) + 1;
  // Not conditional on stop_hook_active: a fresh user turn after a release must
  // not reset the counter while nothing has changed.
  const sameAsLast = fingerprint === state.lastFingerprint;
  next.stagnant = sameAsLast ? (state.stagnant ?? 0) + 1 : 0;
  next.lastFingerprint = fingerprint;

  const maxStagnant = state.maxStagnant ?? 3;
  const maxBlocks = state.maxBlocks ?? 60;
  if (next.stagnant >= maxStagnant) {
    next.lastRelease = `no progress across ${next.stagnant} consecutive blocks; stop allowed, program NOT complete (${result.verdict})`;
    return { action: 'allow', why: next.lastRelease, result, state: next };
  }
  if (next.blocks > maxBlocks) {
    next.lastRelease = `block budget of ${maxBlocks} exhausted; stop allowed, program NOT complete (${result.verdict})`;
    return { action: 'allow', why: next.lastRelease, result, state: next };
  }

  const gate = result.nextGate;
  const lines = [
    `The DijiPeople master program is ${result.verdict} (${result.reason}). Do not stop.`,
    gate
      ? `Next required gate: ${gate.id}${gate.title ? ` — ${gate.title}` : ''}. First unmet evidence: ${gate.firstFailing}.`
      : 'Run `node scripts/program-completion.mjs` to see the unmet gates.',
    'Continue executing the remaining authorized work. A status you write does not satisfy a gate; only repository, review and CI evidence does.',
    'If the only remaining work needs an owner decision, record it in docs/engineering/program-completion.json ownerDecisions and send one ACTION REQUIRED message.',
  ];
  return { action: 'block', reason: lines.join('\n'), result, state: next };
}

const HEARTBEAT_FILE = '.claude/program-hook-heartbeat.local.json';

/**
 * The only proof that a live session really invoked this hook: every call, even
 * one that allows the stop or is outside the program, leaves a timestamped
 * record naming the session cwd, the root the hook resolved and its decision.
 * Best-effort and bounded — it must never fail or trap a session.
 */
export function recordHeartbeat(root, input, outcome, now = new Date()) {
  try {
    const path = join(root, HEARTBEAT_FILE);
    let previous = { invocations: 0 };
    if (existsSync(path)) previous = JSON.parse(readFileSync(path, 'utf8'));
    writeFileSync(
      path,
      `${JSON.stringify(
        {
          invocations: (previous.invocations ?? 0) + 1,
          lastInvokedAt: now.toISOString(),
          sessionId: input?.session_id ?? null,
          sessionCwd: input?.cwd ?? null,
          resolvedRoot: root,
          action: outcome?.action ?? 'unknown',
          why: outcome?.why ?? outcome?.reason?.split('\n')[0] ?? '',
        },
        null,
        2,
      )}\n`,
    );
  } catch {
    // diagnostics only
  }
}

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  let input = {};
  try {
    input = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    process.exit(0); // never fail a session over a malformed payload
  }

  const root = process.env.CLAUDE_PROJECT_DIR
    ? resolve(process.env.CLAUDE_PROJECT_DIR)
    : resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const statePath = join(root, STATE_FILE);
  let state = null;
  if (existsSync(statePath)) {
    try {
      state = JSON.parse(readFileSync(statePath, 'utf8'));
    } catch {
      process.exit(0);
    }
  }

  let outcome;
  try {
    outcome = decide({ root, input, state });
  } catch {
    process.exit(0); // an internal failure must never trap a session
  }

  if (outcome.state) writeFileSync(statePath, `${JSON.stringify(outcome.state, null, 2)}\n`);
  recordHeartbeat(root, input, outcome);
  if (outcome.action === 'block') {
    process.stdout.write(`${JSON.stringify({ decision: 'block', reason: outcome.reason })}\n`);
  } else if (state?.active) {
    process.stderr.write(`program stop allowed: ${outcome.why}\n`);
  }
  process.exit(0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
