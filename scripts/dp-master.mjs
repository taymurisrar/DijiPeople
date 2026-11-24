#!/usr/bin/env node
/*
 * DP-MASTER program control (docs/programs/dp-master).
 *
 *   node scripts/dp-master.mjs check    # structure, hash, DAG, traceability coverage
 *   node scripts/dp-master.mjs status   # verdict and the next dependency-ready slices
 *
 * The master plan is an owner-approved baseline: its SHA-256 (line endings
 * normalised) is pinned in program-state.json, so an edit that is not an
 * explicit amendment fails here instead of drifting silently.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'docs', 'programs', 'dp-master');
const read = (name) => readFileSync(join(dir, name), 'utf8');
const state = JSON.parse(read('program-state.json'));
const trace = JSON.parse(read('traceability.json'));
const plan = read('MASTER-PLAN.md');

const CLASSIFICATIONS = new Set(['VERIFIED_EXISTING', 'PARTIAL', 'MISSING', 'BLOCKED', 'OUT_OF_SCOPE_APPROVED', 'PENDING_AUDIT']);
const STATUSES = new Set(['NOT_STARTED', 'READY', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'ACCEPTED', 'INTEGRATED', 'DEFERRED_APPROVED']);
const DONE = new Set(['ACCEPTED', 'INTEGRATED', 'DEFERRED_APPROVED']);

function findCycle(nodes, edges) {
  const colour = new Map();
  const visit = (id, path) => {
    if (colour.get(id) === 2) return null;
    if (colour.get(id) === 1) return [...path, id];
    colour.set(id, 1);
    for (const next of edges(id)) {
      const hit = visit(next, [...path, id]);
      if (hit) return hit;
    }
    colour.set(id, 2);
    return null;
  };
  for (const id of nodes) {
    const hit = visit(id, []);
    if (hit) return hit;
  }
  return null;
}

function check() {
  const errors = [];
  const hash = createHash('sha256').update(plan.replace(/\r\n/g, '\n')).digest('hex');
  if (hash !== state.masterSha256) errors.push(`master plan hash ${hash.slice(0, 12)} != pinned ${state.masterSha256.slice(0, 12)} (baseline edited without an amendment)`);

  const planWps = [...plan.matchAll(/^\*\*(WP-\d+) — /gm)].map((m) => m[1]);
  const ids = new Set(state.wps.map((w) => w.id));
  if (planWps.length !== 38) errors.push(`master plan lists ${planWps.length} WPs, expected 38`);
  for (const id of planWps) if (!ids.has(id)) errors.push(`${id} missing from program-state.json`);
  for (const w of state.wps) {
    if (!planWps.includes(w.id)) errors.push(`${w.id} is not in the master plan`);
    if (!CLASSIFICATIONS.has(w.classification) && w.classification !== 'PARTIAL') errors.push(`${w.id} bad classification`);
    if (!STATUSES.has(w.status)) errors.push(`${w.id} bad status ${w.status}`);
    for (const d of w.hardDeps) if (!ids.has(d)) errors.push(`${w.id} depends on unknown ${d}`);
  }
  const wpCycle = findCycle([...ids], (id) => state.wps.find((w) => w.id === id).hardDeps);
  if (wpCycle) errors.push(`WP dependency cycle: ${wpCycle.join(' -> ')}`);

  const sliceIds = new Set(state.slices.map((s) => s.id));
  for (const s of state.slices) {
    if (!ids.has(s.wp)) errors.push(`${s.id} belongs to unknown ${s.wp}`);
    if (!STATUSES.has(s.status)) errors.push(`${s.id} bad status ${s.status}`);
    for (const d of s.deps) if (!sliceIds.has(d)) errors.push(`${s.id} depends on unknown slice ${d}`);
  }
  const sliceCycle = findCycle([...sliceIds], (id) => state.slices.find((s) => s.id === id).deps);
  if (sliceCycle) errors.push(`slice dependency cycle: ${sliceCycle.join(' -> ')}`);

  const planCc = [...plan.matchAll(/^(?:- )?\*\*([UAOMHLSIV]\d{2})\b/gm)].map((m) => m[1]);
  const traced = new Set(trace.requirements.map((r) => r.id));
  if (planCc.length !== 53) errors.push(`master plan has ${planCc.length} numbered requirements, expected 53`);
  for (const id of planCc) if (!traced.has(id)) errors.push(`requirement ${id} is not in traceability.json`);
  for (const r of trace.requirements) {
    if (!CLASSIFICATIONS.has(r.classification)) errors.push(`${r.id} bad classification ${r.classification}`);
    if (r.slice && !sliceIds.has(r.slice)) errors.push(`${r.id} points at unknown slice ${r.slice}`);
  }
  for (let i = 1; i <= 20; i += 1) {
    const id = `D${String(i).padStart(2, '0')}`;
    if (!state.decisions.some((d) => d.id === id && d.status === 'APPROVED')) errors.push(`${id} missing or not APPROVED`);
  }
  return errors;
}

function ready() {
  const done = new Set(state.slices.filter((s) => DONE.has(s.status)).map((s) => s.id));
  return state.slices.filter((s) => !DONE.has(s.status) && s.status !== 'IN_PROGRESS' && s.deps.every((d) => done.has(d)));
}

const command = process.argv[2] ?? 'status';
if (command === 'check') {
  const errors = check();
  if (errors.length) {
    console.error(errors.map((e) => `x ${e}`).join('\n'));
    process.exit(1);
  }
  console.log(`DP-MASTER ok: ${state.wps.length} WPs, ${trace.requirements.length} cross-cutting requirements, ${state.slices.length} slices, DAG acyclic`);
} else if (command === 'status') {
  console.log(`DP-MASTER r1=${state.r1.verdict} baseline=${state.baselineSha}`);
  const byStatus = {};
  for (const s of state.slices) byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
  console.log(`slices: ${JSON.stringify(byStatus)}`);
  console.log('dependency-ready:');
  for (const s of ready()) console.log(`  ${s.id} [${s.release}/${s.workstream}] ${s.title}`);
  for (const d of state.openDecisions) console.log(`open decision ${d.id}: ${d.title}`);
} else {
  console.error('usage: dp-master.mjs check|status');
  process.exit(2);
}
