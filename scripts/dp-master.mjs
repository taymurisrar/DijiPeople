#!/usr/bin/env node
/*
 * DP-MASTER program control (docs/programs/dp-master).
 *
 *   node scripts/dp-master.mjs check    # structure, hash, DAG, evidence rules
 *   node scripts/dp-master.mjs status   # verdict, dependency-ready slices, what blocks the rest
 *
 * Rules live in scripts/lib/dp-master.mjs (unit-tested). The master plan is an
 * owner-approved baseline: its SHA-256 (line endings normalised) is pinned in
 * program-state.json, so an edit that is not an explicit amendment fails here.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { blockers, readySlices, validateProgram } from './lib/dp-master.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'docs', 'programs', 'dp-master');
const read = (name) => readFileSync(join(dir, name), 'utf8');
const state = JSON.parse(read('program-state.json'));
const trace = JSON.parse(read('traceability.json'));
const plan = read('MASTER-PLAN.md');

const command = process.argv[2] ?? 'status';
if (command === 'check') {
  const errors = validateProgram({ state, trace, plan });
  if (errors.length) {
    console.error(errors.map((e) => `x ${e}`).join('\n'));
    process.exit(1);
  }
  console.log(
    `DP-MASTER ok: ${state.wps.length} WPs, ${trace.requirements.length} cross-cutting requirements, ${state.slices.length} slices, DAG acyclic`,
  );
} else if (command === 'status') {
  console.log(`DP-MASTER r1=${state.r1.verdict} baseline=${state.baselineSha} integrated=${state.integratedSha ?? 'none'}`);
  const byStatus = {};
  for (const s of state.slices) byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
  console.log(`slices: ${JSON.stringify(byStatus)}`);
  console.log('dependency-ready:');
  for (const s of readySlices(state)) console.log(`  ${s.id} [${s.release}/${s.workstream}] ${s.title}`);
  for (const s of state.slices.filter((x) => x.status === 'NOT_STARTED' || x.status === 'READY')) {
    const why = blockers(state, s);
    if (why.length) console.log(`  blocked ${s.id}: ${why.join('; ')}`);
  }
  for (const d of state.openDecisions.filter((x) => x.status !== 'APPROVED')) {
    console.log(`open decision ${d.id}: ${d.title}`);
  }
} else {
  console.error('usage: dp-master.mjs check|status');
  process.exit(2);
}
