import test from 'node:test';
import assert from 'node:assert/strict';
import { affectsApp, shouldBuild, APPS } from './vercel-ignore-build.mjs';

test('own app changes build only that app', () => {
  assert.equal(shouldBuild('web', ['apps/web/app/page.tsx']), true);
  assert.equal(shouldBuild('admin', ['apps/web/app/page.tsx']), false);
  assert.equal(shouldBuild('landing', ['apps/web/app/page.tsx']), false);
});

test('a shared package change builds EVERY app', () => {
  for (const app of APPS) {
    assert.equal(shouldBuild(app, ['packages/config/index.js']), true, app);
    assert.equal(shouldBuild(app, ['packages/ui/src/button.tsx']), true, app);
  }
});

test('manifest, lockfile, turbo and npm config build every app', () => {
  for (const f of ['package.json', 'package-lock.json', 'turbo.json', '.npmrc', 'vercel.json']) {
    for (const app of APPS) assert.equal(shouldBuild(app, [f]), true, `${app} ${f}`);
  }
});

test('API, docs, scripts, CI and markdown changes skip every app', () => {
  const files = ['services/api/src/main.ts', 'docs/engineering/x.md', 'scripts/a.mjs', '.github/workflows/ci.yml', 'README.md', 'gateway/x.cs'];
  for (const app of APPS) assert.equal(shouldBuild(app, files), false, app);
});

test('one relevant file among many irrelevant ones still builds', () => {
  assert.equal(shouldBuild('admin', ['docs/a.md', 'services/api/x.ts', 'apps/admin/y.ts']), true);
});

test('any doubt builds: empty diff, unknown path, unknown app', () => {
  assert.equal(shouldBuild('web', []), true);
  assert.equal(shouldBuild('web', ['somenewtoplevel/file.ts']), true);
  assert.equal(affectsApp('nope', 'docs/a.md'), true);
});

test('windows separators are handled', () => {
  assert.equal(affectsApp('web', 'apps\web\app\page.tsx'), true);
  assert.equal(affectsApp('web', 'packages\config\index.js'), true);
});
