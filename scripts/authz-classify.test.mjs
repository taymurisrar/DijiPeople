import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseController } from './lib/api-routes.mjs';
import { classifyRoute } from './lib/authz-classify.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'authz-'));
const ctrlFile = path.join(dir, 'x.controller.ts');
const svcFile = path.join(dir, 'x.service.ts');

fs.writeFileSync(
  svcFile,
  `export class XService {
  async guarded(user: U): Promise<{ rows: R[]; counts: Record<string, number> }> {
    this.assertPlatform(user);
    return { rows: [], counts: {} };
  }
  private assertPlatform(user: U) {
    if (!user.platform?.id) throw new Error('no');
  }
  async tenantOnly(user: U) {
    return this.prisma.thing.findMany({ where: { tenantId: user.tenantId } });
  }
  async nothing() {
    return 1;
  }
  async mine(user: U, opts: { a: number }) {
    return this.prisma.thing.findFirst({ where: { userId: user.userId } });
  }
}
`,
);
const ctrlText = `import { XService } from './x.service';
@Controller('x')
@UseGuards(JwtAuthGuard)
export class XController {
  constructor(private readonly svc: XService) {}

  @Get('platform')
  platform(@CurrentUser() u: U) { return this.svc.guarded(u); }

  @Get('tenant')
  tenant(@CurrentUser() u: U) { return this.svc.tenantOnly(u); }

  @Get('nothing')
  nothing() { return this.svc.nothing(); }

  @Get('mine')
  mine(@CurrentUser() u: U) { return this.svc.mine(u, { a: 1 }); }

  @Post('open/:id')
  @Permissions('x.manage')
  @RequirePermission(ENTITY_KEYS.X, 'manage')
  declared() { return 1; }

  @AuthenticationOnly()
  @Get('me')
  me() { return 1; }
}

@Controller('machine')
@UseGuards(GatewayAuthGuard)
export class MachineController {
  @Get('cfg') cfg() { return 1; }
}
`;
fs.writeFileSync(ctrlFile, ctrlText);

const routes = parseController(ctrlFile, ctrlText).map((r) => ({ ...r, file: ctrlFile.replace(/\\/g, '/') }));
const by = (p) => classifyRoute(routes.find((r) => r.path === p), ctrlText);

test('declared contracts are recognised without tracing', () => {
  assert.equal(by('x/open/:id').cls, 'PERMISSION_DECLARED');
  assert.equal(by('x/me').cls, 'AUTHENTICATION_ONLY_DECLARED');
  assert.equal(by('machine/cfg').cls, 'MACHINE_OR_TOKEN_GUARD');
});

test('platform assertion is found through a private helper, past a return-type literal', () => {
  const c = by('x/platform');
  assert.equal(c.cls, 'SERVICE_ENFORCED_PLATFORM');
  assert.equal(c.declared, false, 'service enforcement is evidence, not a declared contract');
  assert.ok(c.traced.some((t) => t.endsWith('#guarded')));
});

test('tenant-scoped-only access is a gap, not a pass', () => {
  const c = by('x/tenant');
  assert.equal(c.cls, 'TENANT_SCOPED_NO_ACTION_AUTHZ');
  assert.equal(c.priority, 'P2');
});

test('no evidence at all is P0', () => {
  assert.equal(by('x/nothing').cls, 'NO_AUTHZ_EVIDENCE');
  assert.equal(by('x/nothing').priority, 'P0');
});

test('self-scoped = caller-only and no path parameter', () => {
  assert.equal(by('x/mine').cls, 'SELF_SCOPED');
});
