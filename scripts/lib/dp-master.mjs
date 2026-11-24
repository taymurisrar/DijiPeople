/*
 * DP-MASTER program rules, kept pure so they can be tested against fixtures.
 *
 * What counts as "done" is deliberately narrow. A dependency is satisfied only by
 * a slice that was ACCEPTED or INTEGRATED. BLOCKED, IN_REVIEW, IN_PROGRESS and
 * DEFERRED_APPROVED never satisfy one: a deferred slice did not deliver its
 * capability, so a consumer built on it would be built on nothing. Completion also
 * needs evidence recorded next to the status, otherwise a status is just a claim.
 */
import { createHash } from 'node:crypto';

export const CLASSIFICATIONS = new Set(['VERIFIED_EXISTING', 'PARTIAL', 'MISSING', 'BLOCKED', 'OUT_OF_SCOPE_APPROVED', 'PENDING_AUDIT']);
export const STATUSES = new Set(['NOT_STARTED', 'READY', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'ACCEPTED', 'INTEGRATED', 'DEFERRED_APPROVED']);
/** The only statuses that satisfy a dependency. */
export const SATISFIES_DEPENDENCY = new Set(['ACCEPTED', 'INTEGRATED']);
const MIN_EVIDENCE = 12;

export function hashPlan(text) {
  return createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
}

export function findCycle(nodes, edges) {
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

const decisionApproved = (state, id) =>
  [...state.decisions, ...state.openDecisions].some((d) => d.id === id && d.status === 'APPROVED');

/** Why a slice cannot start, or [] when it is dependency-ready. */
export function blockers(state, slice) {
  const byId = new Map(state.slices.map((s) => [s.id, s]));
  const reasons = [];
  for (const dep of slice.deps) {
    const found = byId.get(dep);
    if (!found) reasons.push(`${dep} does not exist`);
    else if (!SATISFIES_DEPENDENCY.has(found.status)) reasons.push(`${dep} is ${found.status}, not ACCEPTED/INTEGRATED`);
  }
  for (const key of ['decision', 'decisionRequired']) {
    if (slice[key] && !decisionApproved(state, slice[key])) reasons.push(`decision ${slice[key]} is not APPROVED`);
  }
  return reasons;
}

/** Slices that can start now: not started, not blocked, every dependency really done. */
export function readySlices(state) {
  return state.slices.filter(
    (s) => (s.status === 'NOT_STARTED' || s.status === 'READY') && blockers(state, s).length === 0,
  );
}

export function validateProgram({ state, trace, plan }) {
  const errors = [];
  if (hashPlan(plan) !== state.masterSha256) errors.push('master plan hash differs from the pinned hash (baseline edited without an amendment)');

  const planWps = [...plan.matchAll(/^\*\*(WP-\d+) — /gm)].map((m) => m[1]);
  const ids = new Set(state.wps.map((w) => w.id));
  if (planWps.length !== 38) errors.push(`master plan lists ${planWps.length} WPs, expected 38`);
  for (const id of planWps) if (!ids.has(id)) errors.push(`${id} missing from program-state.json`);
  for (const w of state.wps) {
    if (!planWps.includes(w.id)) errors.push(`${w.id} is not in the master plan`);
    if (!CLASSIFICATIONS.has(w.classification)) errors.push(`${w.id} bad classification ${w.classification}`);
    if (!STATUSES.has(w.status)) errors.push(`${w.id} bad status ${w.status}`);
    for (const d of w.hardDeps) if (!ids.has(d)) errors.push(`${w.id} depends on unknown ${d}`);
  }
  const wpCycle = findCycle([...ids], (id) => state.wps.find((w) => w.id === id).hardDeps);
  if (wpCycle) errors.push(`WP dependency cycle: ${wpCycle.join(' -> ')}`);

  const byId = new Map(state.slices.map((s) => [s.id, s]));
  for (const s of state.slices) {
    if (!ids.has(s.wp)) errors.push(`${s.id} belongs to unknown ${s.wp}`);
    if (!STATUSES.has(s.status)) errors.push(`${s.id} bad status ${s.status}`);
    for (const d of s.deps) if (!byId.has(d)) errors.push(`${s.id} depends on unknown slice ${d}`);
    if (SATISFIES_DEPENDENCY.has(s.status)) {
      if (typeof s.evidence !== 'string' || s.evidence.trim().length < MIN_EVIDENCE) errors.push(`${s.id} is ${s.status} without recorded evidence`);
      for (const reason of blockers(state, s)) errors.push(`${s.id} is ${s.status} but ${reason}`);
    }
    if (s.status === 'INTEGRATED' && !/^[0-9a-f]{7,40}$/.test(s.integratedSha ?? '')) errors.push(`${s.id} is INTEGRATED without an integratedSha`);
    if (s.status === 'DEFERRED_APPROVED' && !s.deferralDecision) errors.push(`${s.id} is DEFERRED_APPROVED without a deferralDecision`);
    if (s.status === 'BLOCKED' && !s.blockedBy) errors.push(`${s.id} is BLOCKED without blockedBy`);
  }
  const sliceCycle = findCycle([...byId.keys()], (id) => byId.get(id).deps);
  if (sliceCycle) errors.push(`slice dependency cycle: ${sliceCycle.join(' -> ')}`);

  const planCc = [...plan.matchAll(/^(?:- )?\*\*([UAOMHLSIV]\d{2})\b/gm)].map((m) => m[1]);
  const traced = new Set(trace.requirements.map((r) => r.id));
  if (planCc.length !== 53) errors.push(`master plan has ${planCc.length} numbered requirements, expected 53`);
  for (const id of planCc) if (!traced.has(id)) errors.push(`requirement ${id} is not in traceability.json`);
  for (const r of trace.requirements) {
    if (!CLASSIFICATIONS.has(r.classification)) errors.push(`${r.id} bad classification ${r.classification}`);
    if (r.slice && !byId.has(r.slice)) errors.push(`${r.id} points at unknown slice ${r.slice}`);
    if (r.verification === 'VERIFIED' && !(r.tests?.length && r.evidence)) errors.push(`${r.id} is VERIFIED without tests and evidence`);
  }
  if (state.gates?.G0?.status === 'PASS') {
    for (const r of trace.requirements) {
      if (r.classification === 'PENDING_AUDIT') errors.push(`${r.id} is still PENDING_AUDIT after G0 PASS`);
    }
  }
  for (let i = 1; i <= 20; i += 1) {
    const id = `D${String(i).padStart(2, '0')}`;
    if (!state.decisions.some((d) => d.id === id && d.status === 'APPROVED')) errors.push(`${id} missing or not APPROVED`);
  }
  return errors;
}
