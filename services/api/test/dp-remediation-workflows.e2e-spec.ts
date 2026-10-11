/**
 * DP platform remediation (SESSION-0121) — the cross-module workflows over HTTP.
 *
 * The unit specs for teams, assignment rules and the support-case lifecycle
 * mock Prisma, so none of them proves the parts that only exist against a real
 * database: the round-robin cursor staying fair when creations race, the
 * merge moving rows inside one transaction, the relation unique constraint,
 * and the customer → tenant lookup filtering on a real foreign key. This suite
 * drives those through the real guards with a minted platform operator.
 *
 * Every row it creates is scoped by `runId` (the assignment rule matches only
 * cases whose category is the run id), so a concurrent suite on the same
 * database never sees this rule fire.
 */

import { randomUUID } from 'node:crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import {
  DbFixtures,
  describeWithDatabase,
  type FixtureTenant,
} from './helpers/db-fixtures';
import { HttpActors, type HttpActor } from './helpers/http-actors';

interface CaseBody {
  id: string;
  status: string;
  assignedToUserId: string | null;
  assignedTeamId: string | null;
  customerAccountId: string | null;
  escalationLevel: number;
  mergedIntoCaseId: string | null;
}

describeWithDatabase()('DP remediation workflows (e2e)', () => {
  jest.setTimeout(240_000);

  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fixtures: DbFixtures;
  let actors: HttpActors;
  let admin: HttpActor;
  let agentA: HttpActor;
  let agentB: HttpActor;
  let tenantA: FixtureTenant;
  let tenantB: FixtureTenant;

  const runId = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const teamIds: string[] = [];
  const ruleIds: string[] = [];

  const http = () => request(app.getHttpServer());
  const as = (actor: HttpActor) => ({
    Authorization: `Bearer ${actor.token}`,
    'X-DijiPeople-App': actor.client,
  });

  async function createCase(
    body: Record<string, unknown>,
    expected = 201,
  ): Promise<CaseBody> {
    const response = await http()
      .post('/api/support-cases')
      .set(as(admin))
      .send({
        title: `DP e2e ${runId}`,
        description: 'Created by the DP remediation e2e suite.',
        category: runId,
        ...body,
      });
    expect(response.status).toBe(expected);
    return response.body as CaseBody;
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    // As main.ts does: the error contract (`errorCode`) is what the admin UI
    // reads, so the assertions below check the rendered shape, not the
    // exception object.
    app.useGlobalFilters(app.get(HttpExceptionFilter));
    app.setGlobalPrefix('api');
    await app.init();

    prisma = app.get(PrismaService);
    fixtures = new DbFixtures(prisma, 'dp-remediation');
    actors = new HttpActors(app, runId);

    admin = await actors.platformUser('SUPER_ADMIN', 'dp-admin');
    agentA = await actors.platformUser('SUPPORT_AGENT', 'dp-agent-a');
    agentB = await actors.platformUser('SUPPORT_AGENT', 'dp-agent-b');
    tenantA = await fixtures.createTenant('dp-a');
    tenantB = await fixtures.createTenant('dp-b');
  });

  afterAll(async () => {
    if (prisma) {
      const cases = await prisma.supportCase.findMany({
        where: { category: runId },
        select: { id: true },
      });
      const ids = cases.map((row) => row.id);
      if (ids.length > 0) {
        await prisma.supportCaseRelation.deleteMany({
          where: {
            OR: [{ sourceCaseId: { in: ids } }, { targetCaseId: { in: ids } }],
          },
        });
        await prisma.supportCaseTimeline.deleteMany({
          where: { supportCaseId: { in: ids } },
        });
        await prisma.supportCaseCommunication.deleteMany({
          where: { supportCaseId: { in: ids } },
        });
        await prisma.supportCaseIncident.deleteMany({
          where: { supportCaseId: { in: ids } },
        });
        await prisma.supportCaseAttachment.deleteMany({
          where: { supportCaseId: { in: ids } },
        });
        // Merges point source → target with Restrict, so clear them first.
        await prisma.supportCase.updateMany({
          where: { id: { in: ids } },
          data: { mergedIntoCaseId: null, parentCaseId: null },
        });
        await prisma.supportCase.deleteMany({ where: { id: { in: ids } } });
      }
      await prisma.recordAssignmentRule.deleteMany({
        where: { id: { in: ruleIds } },
      });
      await prisma.platformTeam.deleteMany({ where: { id: { in: teamIds } } });
    }
    await fixtures?.cleanup();
    await actors?.cleanup();
    await app?.close();
  });

  it('lists only the selected customer’s tenants (WS09)', async () => {
    const response = await http()
      .get(
        `/api/super-admin/tenants?customerAccountId=${tenantA.customerAccountId}`,
      )
      .set(as(admin));
    expect(response.status).toBe(200);
    const ids = (response.body as Array<{ id: string }>).map((row) => row.id);
    expect(ids).toContain(tenantA.id);
    expect(ids).not.toContain(tenantB.id);

    const invalid = await http()
      .get('/api/super-admin/tenants?customerAccountId=not-a-uuid')
      .set(as(admin));
    expect(invalid.status).toBe(400);
  });

  it('refuses a tenant that belongs to another customer, and derives the customer from a tenant (WS09)', async () => {
    const mismatch = await http()
      .post('/api/support-cases')
      .set(as(admin))
      .send({
        title: `DP e2e ${runId}`,
        description: 'mismatch',
        category: runId,
        customerAccountId: tenantA.customerAccountId,
        tenantId: tenantB.id,
        assignedToUserId: admin.id,
      });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body).toMatchObject({
      errorCode: 'SUPPORT_CASE_TENANT_CUSTOMER_MISMATCH',
    });

    const derived = await createCase({
      tenantId: tenantA.id,
      assignedToUserId: admin.id,
    });
    expect(derived.customerAccountId).toBe(tenantA.customerAccountId);
  });

  it('manages a team and rotates unowned cases fairly across its members, even when created concurrently (WS07/WS10)', async () => {
    const team = await http()
      .post('/api/platform-teams')
      .set(as(admin))
      .send({ name: `DP Team ${runId}`, category: 'SUPPORT' });
    expect(team.status).toBe(201);
    const teamId = (team.body as { id: string }).id;
    teamIds.push(teamId);

    const duplicate = await http()
      .post('/api/platform-teams')
      .set(as(admin))
      .send({ name: `dp team ${runId}`.toUpperCase(), category: 'SUPPORT' });
    expect(duplicate.status).toBe(409);

    for (const member of [agentA, agentB]) {
      const added = await http()
        .post(`/api/platform-teams/${teamId}/members`)
        .set(as(admin))
        .send({ platformUserId: member.id });
      expect(added.status).toBe(201);
    }

    const rule = await http()
      .post('/api/super-admin/assignment-rules')
      .set(as(admin))
      .send({
        moduleKey: 'support-cases',
        name: `DP rotation ${runId}`,
        conditions: { category: runId },
        strategy: 'TEAM_ROUND_ROBIN',
        targetTeamId: teamId,
      });
    expect(rule.status).toBe(201);
    const ruleId = (rule.body as { id: string; isActive: boolean }).id;
    ruleIds.push(ruleId);
    // Rules are created disabled: nothing is assigned until an operator opts in.
    expect((rule.body as { isActive: boolean }).isActive).toBe(false);
    const enabled = await http()
      .post(`/api/super-admin/assignment-rules/${ruleId}/enable`)
      .set(as(admin));
    expect([200, 201]).toContain(enabled.status);

    const created = await Promise.all(
      Array.from({ length: 6 }, () => createCase({})),
    );
    const owners = created.map((row) => row.assignedToUserId);
    expect(owners.filter((id) => id === agentA.id)).toHaveLength(3);
    expect(owners.filter((id) => id === agentB.id)).toHaveLength(3);
    expect(created.every((row) => row.assignedTeamId === teamId)).toBe(true);

    // An explicit owner is never overridden by a rule.
    const explicit = await createCase({ assignedToUserId: admin.id });
    expect(explicit.assignedToUserId).toBe(admin.id);

    // A team still referenced by open cases cannot be archived without a target.
    const archive = await http()
      .post(`/api/platform-teams/${teamId}/archive`)
      .set(as(admin))
      .send({});
    expect(archive.status).toBe(409);

    await http()
      .post(`/api/super-admin/assignment-rules/${ruleId}/disable`)
      .set(as(admin));
  });

  it('enforces the lifecycle, escalates numerically and reopens (WS11)', async () => {
    const supportCase = await createCase({ assignedToUserId: admin.id });

    const resolveWithoutSummary = await http()
      .post(`/api/support-cases/${supportCase.id}/transition`)
      .set(as(admin))
      .send({ toStatus: 'RESOLVED' });
    expect(resolveWithoutSummary.status).toBe(400);
    expect(resolveWithoutSummary.body).toMatchObject({
      errorCode: 'SUPPORT_CASE_TRANSITION_REQUIRES_INFO',
    });

    // The defect that made Escalate always fail: the UI sent "ESCALATED".
    const escalated = await http()
      .post(`/api/support-cases/${supportCase.id}/escalate`)
      .set(as(admin))
      .send({ reason: 'Customer is blocked from payroll.' });
    expect([200, 201]).toContain(escalated.status);
    expect((escalated.body as CaseBody).escalationLevel).toBe(1);

    const resolved = await http()
      .post(`/api/support-cases/${supportCase.id}/resolve`)
      .set(as(admin))
      .send({
        resolutionSummary: 'Configuration corrected.',
        resolutionCategory: 'CONFIGURATION',
      });
    expect([200, 201]).toContain(resolved.status);
    expect((resolved.body as CaseBody).status).toBe('RESOLVED');

    const illegal = await http()
      .post(`/api/support-cases/${supportCase.id}/transition`)
      .set(as(admin))
      .send({ toStatus: 'INVESTIGATING' });
    expect(illegal.status).toBe(400);

    const reopened = await http()
      .post(`/api/support-cases/${supportCase.id}/reopen`)
      .set(as(admin))
      .send({ reason: 'The issue came back.' });
    expect([200, 201]).toContain(reopened.status);
    expect((reopened.body as CaseBody).status).toBe('REOPENED');

    const timeline = await prisma.supportCaseTimeline.count({
      where: { supportCaseId: supportCase.id },
    });
    expect(timeline).toBeGreaterThanOrEqual(3);
  });

  it('links cases without duplicates or cycles and merges atomically (WS11)', async () => {
    const base = {
      customerAccountId: tenantA.customerAccountId,
      assignedToUserId: admin.id,
    };
    const a = await createCase(base);
    const b = await createCase(base);
    const other = await createCase({
      customerAccountId: tenantB.customerAccountId,
      assignedToUserId: admin.id,
    });

    const link = await http()
      .post(`/api/support-cases/${a.id}/relations`)
      .set(as(admin))
      .send({ targetCaseId: b.id, relationType: 'BLOCKS' });
    expect(link.status).toBe(201);

    const again = await http()
      .post(`/api/support-cases/${a.id}/relations`)
      .set(as(admin))
      .send({ targetCaseId: b.id, relationType: 'BLOCKS' });
    expect(again.status).toBe(409);

    const cycle = await http()
      .post(`/api/support-cases/${b.id}/relations`)
      .set(as(admin))
      .send({ targetCaseId: a.id, relationType: 'BLOCKS' });
    expect(cycle.status).toBe(400);

    const crossCustomer = await http()
      .post(`/api/support-cases/${a.id}/merge`)
      .set(as(admin))
      .send({ targetCaseId: other.id, reason: 'Duplicate report.' });
    expect(crossCustomer.status).toBe(400);

    await http()
      .post(`/api/support-cases/${a.id}/customer-updates`)
      .set(as(admin))
      .send({ subject: 'Update', body: 'We are looking into it.' });

    const merged = await http()
      .post(`/api/support-cases/${a.id}/merge`)
      .set(as(admin))
      .send({ targetCaseId: b.id, reason: 'Duplicate report.' });
    expect([200, 201]).toContain(merged.status);

    const source = await prisma.supportCase.findUniqueOrThrow({
      where: { id: a.id },
      select: { status: true, mergedIntoCaseId: true },
    });
    expect(source).toEqual({ status: 'CLOSED', mergedIntoCaseId: b.id });
    expect(
      await prisma.supportCaseCommunication.count({
        where: { supportCaseId: a.id },
      }),
    ).toBe(0);

    const editMerged = await http()
      .post(`/api/support-cases/${a.id}/reopen`)
      .set(as(admin))
      .send({ reason: 'Try to reopen a merged case.' });
    expect(editMerged.status).toBe(400);
  });

  it('keeps every new route behind platform authentication', async () => {
    for (const path of [
      '/api/platform-teams',
      '/api/super-admin/assignment-rules',
      '/api/contracts/template-eligibility?sourceType=customer&sourceId=x',
    ]) {
      const response = await http().get(path);
      expect(response.status).toBe(401);
    }
  });
});
