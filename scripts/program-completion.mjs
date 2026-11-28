#!/usr/bin/env node
/*
 * Deterministic completion verifier for the master engineering program.
 *
 *   node scripts/program-completion.mjs                  # human summary
 *   node scripts/program-completion.mjs --json
 *   node scripts/program-completion.mjs --commands       # also run command gates
 *   node scripts/program-completion.mjs --root <dir>
 *
 * Exit codes: 0 READY_TO_MERGE_MAIN · 10 IN_PROGRESS · 11 BLOCKED_OWNER_ACTION ·
 *             12 BLOCKED_EXTERNAL · 13 VALIDATION_FAILED
 *
 * Read-only. See scripts/lib/program-completion.mjs for what each verdict means.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyProgram } from './lib/program-completion.mjs';

const argv = process.argv.slice(2);
const rootIndex = argv.indexOf('--root');
const root =
  rootIndex === -1 ? resolve(dirname(fileURLToPath(import.meta.url)), '..') : resolve(argv[rootIndex + 1] ?? '.');

const result = verifyProgram(root, { allowCommands: argv.includes('--commands') });

if (argv.includes('--json')) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`PROGRAM_COMPLETION: ${result.verdict} — ${result.reason}`);
  for (const problem of result.problems ?? []) console.log(`  manifest: ${problem}`);
  for (const gate of result.gates) {
    console.log(`  [${gate.state}] ${gate.id} ${gate.title}`);
    for (const check of gate.results.filter((r) => r.state !== 'PASS')) {
      console.log(`      - ${check.type}: ${check.detail}`);
    }
    if (gate.waitingOwner.length) console.log(`      waits on owner decision: ${gate.waitingOwner.join(', ')}`);
  }
  if (result.nextGate) console.log(`NEXT_GATE: ${result.nextGate.id} — ${result.nextGate.firstFailing}`);
}

process.exit(
  { READY_TO_MERGE_MAIN: 0, IN_PROGRESS: 10, BLOCKED_OWNER_ACTION: 11, BLOCKED_EXTERNAL: 12, VALIDATION_FAILED: 13 }[
    result.verdict
  ],
);
