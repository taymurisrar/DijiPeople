import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rehearse } from './hotfix-rehearsal.mjs';

const status = (report, id) => report.steps.find((s) => s.id === id)?.status;

test('without approval the rehearsal stops at the checkpoint and deploys nothing', async () => {
  const r = await rehearse();
  assert.equal(r.outcome, 'STOPPED_AT_APPROVAL');
  assert.equal(r.deployedAnywhere, false);
  assert.equal(status(r, 'OWNER_APPROVAL'), 'AWAITING_OWNER_APPROVAL');
  assert.equal(status(r, 'SIMULATED_DEPLOY_AND_HEALTH'), undefined, 'no deploy step may run before approval');
  assert.equal(status(r, 'ROLLBACK_REHEARSAL'), undefined);
});

test('baseline comes from the release metadata, not the branch tip', async () => {
  const r = await rehearse();
  const step = r.steps.find((s) => s.id === 'BASELINE_FROM_RELEASE_METADATA');
  assert.equal(step.status, 'PASS');
  assert.notEqual(step.baseSha, step.tipSha);
});

test('the regression is red on the released code, green after a one-file patch, and the build is reproducible', async () => {
  const r = await rehearse();
  for (const id of ['REGRESSION_RED_BEFORE_PATCH', 'MINIMAL_PATCH', 'REGRESSION_GREEN_AFTER_PATCH', 'BUILD_REPRODUCIBLE', 'RELEASE_EVIDENCE']) assert.equal(status(r, id), 'PASS', id);
});

test('the full path (simulated approval, fake target): deploy, health, smoke, rollback and backport all pass', async () => {
  const r = await rehearse({ simulateApproval: true });
  assert.equal(r.outcome, 'REHEARSED_END_TO_END');
  for (const id of ['SIMULATED_DEPLOY_AND_HEALTH', 'SMOKE_ON_DEPLOYED_SHA', 'ROLLBACK_REHEARSAL', 'BACKPORT_TO_DEVELOP']) assert.equal(status(r, id), 'PASS', id);
  assert.equal(r.deployedAnywhere, false);
  assert.ok(r.automationMap.some((m) => m.kind === 'REQUIRES_OWNER_APPROVAL'));
  assert.ok(r.automationMap.some((m) => m.kind === 'REQUIRES_EXTERNAL_CONFIGURATION'));
});

test('the rehearsal never touches the real repository', async () => {
  const before = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' });
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  await rehearse({ simulateApproval: true });
  assert.equal(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }), before);
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }), head);
});

test('no real deploy, push or merge command exists in the rehearsal source', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('./hotfix-rehearsal.mjs', import.meta.url), 'utf8');
  // Invocations, not prose: the automation map legitimately names Vercel and Render.
  assert.doesNotMatch(src, /git\([^)]*'(push|merge|remote|fetch|pull)'/);
  assert.doesNotMatch(src, /(execFileSync|spawn)\(\s*'(vercel|render|gh|curl)'/);
});
