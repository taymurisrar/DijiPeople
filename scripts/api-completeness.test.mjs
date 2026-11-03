// Mutation tests for the API completeness gate (policy API-001..API-004).
//
// Each case builds a throwaway repository root holding a copy of the gate, a
// hand-written controller and a manifest, then runs the gate against it. The real
// tree is never touched: the point is to prove the gate FAILS when it should, which
// a green run on today's tree cannot show.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REAL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'services/api/src/modules/widgets/widgets.controller.ts';

const verb = (decorator, route, name) => `
  ${decorator}(${route ? `'${route}'` : ''})
  @Permissions('widgets.x')
  @RequirePermission(ENTITY_KEYS.WIDGETS, 'read')
  ${name}() {}
`;

function controller(ops, { guarded = true } = {}) {
  const body = {
    list: verb('@Get', '', 'list'),
    get: verb('@Get', ':id', 'get'),
    create: verb('@Post', '', 'create'),
    update: verb('@Patch', ':id', 'update'),
    delete: verb('@Delete', ':id', 'remove'),
  };
  return `import { Controller, Get, Post, Patch, Delete, UseGuards } from '@nestjs/common';

@Controller('widgets')
${guarded ? '@UseGuards(JwtAuthGuard, PermissionsGuard)\n' : ''}export class WidgetsController {
${ops.map((o) => body[o]).join('')}}
`;
}

function run({ ops, resource, controllerText, extraFiles = {} }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-api-completeness-'));
  try {
    fs.cpSync(path.join(REAL, 'scripts/lib'), path.join(root, 'scripts/lib'), { recursive: true });
    for (const f of ['check-api-completeness.mjs', 'api-authorization-inventory.mjs'])
      fs.copyFileSync(path.join(REAL, 'scripts', f), path.join(root, 'scripts', f));
    const write = (rel, text) => {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), text);
    };
    write(FILE, controllerText ?? controller(ops));
    for (const [rel, text] of Object.entries(extraFiles)) write(rel, text);
    write(
      'docs/engineering/api-resource-contracts.json',
      JSON.stringify({ version: 1, resources: [{ controller: FILE, ...resource }, ...(extraFiles.__resources ?? [])], baseline: {} }),
    );
    write('docs/engineering/api-authorization-register.json', JSON.stringify({ entries: [] }));
    const r = spawnSync(process.execPath, ['scripts/check-api-completeness.mjs'], { cwd: root, encoding: 'utf8' });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const FULL = ['list', 'get', 'create', 'update', 'delete'];
const standard = (extra = {}) => ({
  type: 'standard-mutable',
  requires: FULL,
  notApplicable: {},
  ...extra,
});

test('control: a standard mutable resource with the whole lifecycle passes', () => {
  const r = run({ ops: FULL, resource: standard() });
  assert.equal(r.code, 0, r.out);
});

test('API-002: a standard mutable resource missing a lifecycle operation is flagged', () => {
  const r = run({ ops: ['list', 'get', 'create', 'update'], resource: standard() });
  assert.equal(r.code, 1);
  assert.match(r.out, /API-002 .*lacks "delete"/);
});

test('API-002: an explicit, justified exception passes; a token justification does not', () => {
  const ops = ['list', 'get', 'create', 'update'];
  const ok = run({
    ops,
    resource: standard({ notApplicable: { delete: 'Widgets are retained for audit; deactivate instead (ADR-0001).' } }),
  });
  assert.equal(ok.code, 0, ok.out);
  const weak = run({ ops, resource: standard({ notApplicable: { delete: 'n/a' } }) });
  assert.equal(weak.code, 1);
  assert.match(weak.out, /notApplicable\.delete needs a real justification/);
});

test('API-003: an immutable resource exposing update or delete is flagged', () => {
  const immutable = { type: 'immutable', requires: [], notApplicable: {} };
  assert.equal(run({ ops: ['list', 'get', 'create'], resource: immutable }).code, 0);
  for (const op of ['update', 'delete']) {
    const r = run({ ops: ['list', 'get', 'create', op], resource: immutable });
    assert.equal(r.code, 1, `${op} must be refused on an immutable resource`);
    assert.match(r.out, /API-003 .*immutable resource/);
  }
});

test('API-003: a read-only resource exposing a mutation is flagged, and an explicit allow lifts it', () => {
  const resource = { type: 'read-only', requires: [], notApplicable: {} };
  const r = run({ ops: ['list', 'get', 'update'], resource });
  assert.equal(r.code, 1);
  assert.match(r.out, /API-003 .*read-only resource/);
  const allowed = run({
    ops: ['list', 'get', 'update'],
    resource: { ...resource, allow: ['PATCH widgets/:id'] },
  });
  assert.equal(allowed.code, 0, allowed.out);
});

test('API-003: DELETE on a sensitive resource needs an explicit allow entry', () => {
  const resource = { type: 'sensitive', requires: [], notApplicable: {} };
  const r = run({ ops: ['list', 'get', 'create', 'delete'], resource });
  assert.equal(r.code, 1);
  assert.match(r.out, /API-003 .*DELETE on a sensitive resource/);
  assert.equal(
    run({ ops: ['list', 'get', 'create', 'delete'], resource: { ...resource, allow: ['DELETE widgets/:id'] } }).code,
    0,
  );
});

test('API-001: a controller absent from the manifest is flagged', () => {
  const other = 'services/api/src/modules/gadgets/gadgets.controller.ts';
  const r = run({
    ops: FULL,
    resource: standard(),
    extraFiles: { [other]: controller(['list']).replace('widgets', 'gadgets') },
  });
  assert.equal(r.code, 1);
  assert.match(r.out, /API-001 .*gadgets\.controller\.ts.*not classified/);
});

test('API-004: a route with no guard that is not public is flagged', () => {
  const r = run({ ops: ['list'], resource: standard({ requires: [] }), controllerText: controller(['list'], { guarded: false }) });
  assert.equal(r.code, 1);
  assert.match(r.out, /API-004/);
});
