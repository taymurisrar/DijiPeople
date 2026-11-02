import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildHotfixPlan, NEVER_SKIPPABLE, slug } from './hotfix.mjs';

const base = { severity: 'P0', title: 'Tenant leak in employee list', baseSha: 'a'.repeat(40), prodSha: 'a'.repeat(40) };

test('P0/P1 get an emergency plan; P2/P3 are refused the fast path', () => {
  assert.equal(buildHotfixPlan(base).ok, true);
  assert.equal(buildHotfixPlan({ ...base, severity: 'P1' }).ok, true);
  for (const s of ['P2', 'P3', 'P9', undefined]) assert.equal(buildHotfixPlan({ ...base, severity: s }).ok, false, String(s));
});

test('a plan cannot exist without a verified production baseline or a title', () => {
  assert.equal(buildHotfixPlan({ ...base, baseSha: undefined }).ok, false);
  assert.equal(buildHotfixPlan({ ...base, title: '  ' }).ok, false);
});

test('approval is always PENDING_OWNER and the tool exposes no way to set it', () => {
  const p = buildHotfixPlan({ ...base, approval: { status: 'APPROVED' } });
  assert.equal(p.approval.status, 'PENDING_OWNER');
  const src = readFileSync(new URL('./hotfix.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /'push'|'merge'|execFileSync\('(vercel|render|gh)'/, 'the tool has no push, merge or deploy call');
});

test('narrowing scope never drops lint, build or the authorization regression', () => {
  const p = buildHotfixPlan({ ...base, paths: ['README.md'] });
  const ids = p.gates.map((g) => g.id);
  for (const id of NEVER_SKIPPABLE) assert.ok(ids.includes(id), id);
  assert.ok(p.gates.filter((g) => NEVER_SKIPPABLE.includes(g.id)).every((g) => g.skippable === false));
});

test('path-driven gates: controller change pulls authz + api-completeness; schema pulls prisma + migration safety', () => {
  const ids = buildHotfixPlan({ ...base, paths: ['services/api/src/modules/leave/leave.controller.ts'] }).gates.map((g) => g.id);
  assert.ok(ids.includes('authz-regression') && ids.includes('api-completeness') && ids.includes('api-typecheck'));
  assert.ok(!ids.includes('web-typecheck'));
  const m = buildHotfixPlan({ ...base, paths: ['services/api/prisma/migrations/20261103_x/migration.sql'] });
  assert.ok(m.gates.some((g) => g.id === 'migration-safety'));
  assert.equal(m.migrationsIncluded.length, 1);
  assert.ok(m.warnings.some((w) => /MIGRATION IN HOTFIX/.test(w)));
  assert.ok(m.rollback.some((r) => /expand-only|down-migration/.test(r)));
});

test('warns when the deployed SHA is unknown or differs from the baseline', () => {
  assert.ok(buildHotfixPlan({ ...base, prodSha: undefined }).warnings.some((w) => /not verified/.test(w)));
  assert.ok(buildHotfixPlan({ ...base, prodSha: 'b'.repeat(40) }).warnings.some((w) => /differs/.test(w)));
});

test('branch name is derived from the incident, under hotfix/', () => {
  assert.equal(slug('Tenant leak: employee list!'), 'tenant-leak-employee-list');
  assert.match(buildHotfixPlan(base).branch, /^hotfix\/[a-z0-9-]+$/);
});

test('rollback and the stop-for-approval step are always present', () => {
  const p = buildHotfixPlan(base);
  assert.ok(p.rollback.length >= 3);
  assert.ok(p.steps.some((s) => /STOP: owner approval/.test(s)));
});
