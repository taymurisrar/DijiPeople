#!/usr/bin/env node
/*
 * Owner-launched, bounded resume of the master engineering program.
 *
 *   node scripts/program-resume.mjs activate --worktree <path>[,<path>…]
 *   node scripts/program-resume.mjs deactivate
 *   node scripts/program-resume.mjs status
 *   node scripts/program-resume.mjs run [--attempts 5] [--pause-seconds 120] [--worktree <path>]
 *
 * `run` starts a headless Claude Code session that resumes from the durable
 * ledger (docs/engineering/program-completion.json + the handoff in
 * docs/engineering/enterprise-hardening-register.md), then re-checks the
 * deterministic verifier. It is deliberately NOT an uncontrolled loop:
 *   - at most `--attempts` sessions (default 5, hard cap 10);
 *   - stops on any terminal verdict;
 *   - stops when a session exits non-zero, or its output mentions a usage /
 *     rate limit — it never retries through a limit;
 *   - stops when an attempt made no progress (same HEAD and gate states);
 *   - a session that ends is never recorded as completion: only the verifier is.
 *
 * It grants nothing: the headless session runs under the project's own
 * permission settings, so owner-gated actions (main, production, credential
 * rotation) stay gated.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { needsShell, resolveClaudeExecutable } from './lib/claude-executable.mjs';
import { STOPPABLE, progressFingerprint, verifyProgram } from './lib/program-completion.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATE = join(root, '.claude', 'program-session.local.json');
const [command = 'status', ...rest] = process.argv.slice(2);

const option = (name, fallback = '') => {
  const index = rest.indexOf(`--${name}`);
  return index === -1 ? fallback : (rest[index + 1] ?? fallback);
};

function readState() {
  return existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : null;
}

switch (command) {
  case 'activate': {
    const worktrees = option('worktree', root).split(',').map((tree) => resolve(tree.trim()));
    writeFileSync(
      STATE,
      `${JSON.stringify({ active: true, verifyRoot: worktrees[0], worktrees, blocks: 0, stagnant: 0, maxStagnant: 3, maxBlocks: 60, lastFingerprint: '' }, null, 2)}\n`,
    );
    console.log(`program active for: ${worktrees.join(', ')}`);
    break;
  }
  case 'deactivate':
    rmSync(STATE, { force: true });
    console.log('program deactivated');
    break;
  case 'status': {
    const result = verifyProgram(root, {});
    console.log(`state file: ${readState() ? 'present' : 'absent'}`);
    console.log(`verdict: ${result.verdict} — ${result.reason}`);
    if (result.nextGate) console.log(`next gate: ${result.nextGate.id}`);
    break;
  }
  case 'run': {
    const attempts = Math.min(Number(option('attempts', '5')) || 5, 10);
    const pause = Math.max(Number(option('pause-seconds', '120')) || 120, 30);
    const cwd = resolve(option('worktree', root));
    let last = '';
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const result = verifyProgram(root, {});
      console.log(`[attempt ${attempt}/${attempts}] ${result.verdict} — ${result.reason}`);
      if (STOPPABLE.has(result.verdict)) process.exit(0);
      const fingerprint = progressFingerprint(root, result);
      if (fingerprint === last) {
        console.log('no progress since the previous attempt; stopping (not a completion)');
        process.exit(2);
      }
      last = fingerprint;
      const prompt =
        'DP: resume SESSION-0137 from the durable ledger. Read docs/engineering/program-completion.json and the handoff in ' +
        'docs/engineering/enterprise-hardening-register.md, run `node scripts/program-completion.mjs`, and continue the next unmet gate. ' +
        'Do not report completion unless the verifier says READY_TO_MERGE_MAIN.';
      let claudePath;
      try {
        claudePath = resolveClaudeExecutable();
      } catch (error) {
        console.log(`${error.message} State is preserved; nothing is marked complete.`);
        process.exit(5);
      }
      const run = spawnSync(claudePath, ['-p', prompt], { cwd, encoding: 'utf8', shell: needsShell(claudePath) });
      const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
      // run.error (spawn failure) leaves status null, which is also non-zero here.
      if (run.error || run.status !== 0 || /usage limit|rate limit|limit reached/i.test(output)) {
        console.log('session ended with an error or a usage limit; stopping without retry. State is preserved; nothing is marked complete.');
        process.exit(3);
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, pause * 1000);
    }
    console.log('attempt budget exhausted; program not complete');
    process.exit(4);
    break;
  }
  default:
    console.error('Usage: program-resume.mjs activate|deactivate|status|run');
    process.exit(2);
}
