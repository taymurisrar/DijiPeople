import test from 'node:test';
import assert from 'node:assert/strict';
import { parseController, operationOf } from './lib/api-routes.mjs';

const dtoFirst = `
import { Controller, Get, Post, Patch, Delete, UseGuards } from '@nestjs/common';

export class ListThingsDto {}

@Controller('things')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ThingsController {
  @Get()
  @Permissions('things.read')
  @RequirePermission(ENTITY_KEYS.THINGS, 'read')
  list() {}

  @Get(':id')
  @Permissions('things.read')
  get() {}

  @Post()
  create() {}

  @Patch(':id')
  update() {}

  @Delete(':id')
  remove() {}

  @Public()
  @Get('open/ping')
  ping() {}

  @Post(':id/restore')
  restore() {}
}
`;

test('DTO classes before the controller do not hide class-level guards (LESSON-0003)', () => {
  const routes = parseController('things.controller.ts', dtoFirst);
  assert.equal(routes.length, 7);
  assert.ok(routes.every((r) => r.guarded), 'class-level @UseGuards applies to every route');
});

test('verbs and shapes map to lifecycle operations', () => {
  const routes = parseController('things.controller.ts', dtoFirst).map((r) => ({ ...r, op: operationOf(r) }));
  const ops = Object.fromEntries(routes.map((r) => [r.handler, r.op]));
  assert.deepEqual(ops, { list: 'list', get: 'get', create: 'create', update: 'update', remove: 'delete', ping: 'action', restore: 'restore' });
});

test('permission and public detection is per-route', () => {
  const byName = Object.fromEntries(parseController('t.ts', dtoFirst).map((r) => [r.handler, r]));
  assert.equal(byName.list.legacyPermission && byName.list.matrixPermission, true);
  assert.equal(byName.get.matrixPermission, false);
  assert.equal(byName.create.legacyPermission, false);
  assert.equal(byName.ping.public, true);
  assert.equal(byName.create.public, false);
  assert.equal(byName.update.path, 'things/:id');
});

test('a controller with no guard is reported unguarded', () => {
  const r = parseController('x.ts', `@Controller('x')\nexport class X {\n  @Get()\n  a() {}\n}\n`);
  assert.equal(r[0].guarded, false);
});
