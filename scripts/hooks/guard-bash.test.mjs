import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evaluate, RULES } from './guard-bash.mjs';

const blocked = {
  'git push origin main': 'GIT-001',
  'git push origin HEAD:main': 'GIT-001',
  'git push --force origin agent/x': 'GIT-002',
  'git push -f origin develop': 'GIT-002',
  'git checkout -- apps/web/x.ts': 'GIT-003',
  'git reset --hard origin/develop': 'GIT-003',
  'git restore services/api/a.ts': 'GIT-003',
  'git worktree remove ../wt': 'GIT-004',
  'git stash': 'GIT-005',
  'Remove-Item -Recurse -Force ..\\wt': 'FS-001',
  'npx prisma migrate reset --config prisma.config.ts': 'DB-001',
  'psql -c "DROP TABLE users"': 'DB-001',
  'npm run seed:commercial': 'DB-002',
  'vercel deploy --prod': 'DEPLOY-001',
  'git commit --no-verify -m x': 'CI-001',
};
const allowed = [
  'git push origin agent/engineering-governance',
  'git push origin HEAD:develop',
  'git push origin agent/main-sync-fix',
  'git restore --staged file.ts',
  'git stash list',
  'git status --short',
  'npm run validate:framework',
  'git push --dry-run origin main',
  'npx prisma migrate status --config prisma.config.ts',
];

for (const [cmd, id] of Object.entries(blocked))
  test(`blocks ${id}: ${cmd}`, () => assert.ok(evaluate(cmd).some((h) => h.id === id), JSON.stringify(evaluate(cmd))));
for (const cmd of allowed) test(`allows: ${cmd}`, () => assert.deepEqual(evaluate(cmd), []));

test('every rule has an id, a reason and is exercised by a blocked case', () => {
  const covered = new Set(Object.values(blocked));
  for (const r of RULES) {
    assert.ok(r.id && r.why.length > 20, r.id);
    if (r.id !== 'CI-002') assert.ok(covered.has(r.id), `rule ${r.id} has no test`);
  }
});

test('hook protocol: exit 2 + stderr on a blocked command, exit 0 otherwise or on bad input', () => {
  const run = (stdin) => spawnSync(process.execPath, [fileURLToPath(new URL('./guard-bash.mjs', import.meta.url))], { input: stdin, encoding: 'utf8' });
  const bad = run(JSON.stringify({ tool_input: { command: 'git push origin main' } }));
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /GIT-001/);
  assert.equal(run(JSON.stringify({ tool_input: { command: 'git status' } })).status, 0);
  assert.equal(run('not json').status, 0);
});
