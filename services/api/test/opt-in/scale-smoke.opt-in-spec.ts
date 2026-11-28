/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call -- supertest response bodies are untyped JSON; assertions read them directly. */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../../src/app.module';
import { ROLE_KEYS } from '../../src/common/constants/rbac-matrix';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { AccessRevocationSweeperWorker } from '../../src/modules/employees/access-revocation-sweeper.worker';
import { DbFixtures, describeWithDatabase } from '../helpers/db-fixtures';
import { HttpActors, type HttpActor } from '../helpers/http-actors';

/**
 * DP-MASTER WP-26 / T-SCALE smoke. OPT-IN and deliberately NOT named *.e2e-spec.ts, so the
 * CI database job never collects it (that job fails on any skipped suite). Run it with
 *   DP_SCALE_SMOKE=1 npx jest --config ./test/jest-e2e.json --testRegex "opt-in-spec.ts$" scale-smoke
 * against an isolated test database. Set DP_SCALE_SMOKE=1 (a 250-employee
 * tenant is the plan's reference size; this seeds 1,000 terminated employees to
 * measure the sweeper at four times that).
 *
 * It measures, on the local database and one process, and prints the numbers:
 *   - the access-revocation sweep over N due employees (every one of them
 *     disabled, with web and agent tokens revoked);
 *   - authenticated request latency, sequential and concurrent.
 * It is a smoke measurement on a workstation, not a capacity claim.
 */
const enabled = process.env.DP_SCALE_SMOKE === '1';
const N = Number(process.env.DP_SCALE_EMPLOYEES ?? 1000);

(enabled ? describeWithDatabase() : describe.skip)(
  'T-SCALE smoke (opt-in)',
  () => {
    jest.setTimeout(1_800_000);

    let moduleRef: TestingModule;
    let app: INestApplication<App>;
    let prisma: PrismaService;
    let fixtures: DbFixtures;
    let actors: HttpActors;
    let sweeper: AccessRevocationSweeperWorker;
    let tenantId: string;
    let admin: HttpActor;
    const suffix = randomUUID().slice(0, 6);

    beforeAll(async () => {
      moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = moduleRef.createNestApplication();
      app.useGlobalPipes(
        new ValidationPipe({ whitelist: true, transform: true }),
      );
      await app.init();
      prisma = app.get(PrismaService);
      sweeper = app.get(AccessRevocationSweeperWorker, { strict: false });
      fixtures = new DbFixtures(prisma, 'scale');
      actors = new HttpActors(app, suffix);
      const tenant = await fixtures.createTenant('scale');
      tenantId = tenant.id;
      const org = await fixtures.createOrganization(tenantId);
      const unit = await fixtures.createBusinessUnit(tenantId, org);
      admin = await actors.tenantUser(tenantId, unit, 'scale-admin');
      const role = await prisma.role.create({
        data: { tenantId, key: ROLE_KEYS.GLOBAL_ADMIN, name: 'Admin scale' },
        select: { id: true },
      });
      await prisma.userRole.create({
        data: { tenantId, userId: admin.id, roleId: role.id },
      });
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { ownerUserId: admin.id },
      });

      // Bulk-seed N staff in SQL. Timestamps are UTC to match what Prisma writes
      // (a bare now() uses the server time zone and would put dates in the future).
      //: identity, user, employee, web token, device, agent token.
      const bu = unit;
      await prisma.$executeRawUnsafe(`
      INSERT INTO "Identity"("id","email","passwordHash","updatedAt")
      SELECT 'sc-i-${suffix}-'||g, 'sc-${suffix}-'||g||'@example.invalid', 'x', (now() AT TIME ZONE 'utc') FROM generate_series(1,${N}) g`);
      await prisma.$executeRawUnsafe(`
      INSERT INTO "User"("id","tenantId","businessUnitId","identityId","firstName","lastName","email","passwordHash","status","updatedAt")
      SELECT 'sc-u-${suffix}-'||g, '${tenantId}', '${bu}', 'sc-i-${suffix}-'||g, 'S', g::text, 'sc-${suffix}-'||g||'@example.invalid', 'x', 'ACTIVE', (now() AT TIME ZONE 'utc') FROM generate_series(1,${N}) g`);
      await prisma.$executeRawUnsafe(`
      INSERT INTO "Employee"("id","tenantId","userId","employeeCode","firstName","lastName","phone","hireDate","businessUnitId","employmentStatus","terminationDate","updatedAt")
      SELECT 'sc-e-${suffix}-'||g, '${tenantId}', 'sc-u-${suffix}-'||g, 'SC-${suffix}-'||g, 'S', g::text, '0', (now() AT TIME ZONE 'utc') - interval '1 year', '${bu}', 'TERMINATED', (now() AT TIME ZONE 'utc') - interval '1 minute', (now() AT TIME ZONE 'utc') FROM generate_series(1,${N}) g`);
      await prisma.$executeRawUnsafe(`
      INSERT INTO "RefreshToken"("id","tenantId","userId","sessionId","appClientId","tokenHash","expiresAt","updatedAt")
      SELECT 'sc-r-${suffix}-'||g, '${tenantId}', 'sc-u-${suffix}-'||g, 'sc-s-${suffix}-'||g, 'web', md5('r'||g), (now() AT TIME ZONE 'utc') + interval '1 hour', (now() AT TIME ZONE 'utc') FROM generate_series(1,${N}) g`);
      await prisma.$executeRawUnsafe(`
      INSERT INTO "EmployeeDevice"("id","tenantId","employeeId","userId","deviceFingerprint","deviceName","os","platform","agentVersion","updatedAt")
      SELECT 'sc-d-${suffix}-'||g, '${tenantId}', 'sc-e-${suffix}-'||g, 'sc-u-${suffix}-'||g, 'fp-${suffix}-'||g, 'd', 'Windows', 'win32', '1', (now() AT TIME ZONE 'utc') FROM generate_series(1,${N}) g`);
      await prisma.$executeRawUnsafe(`
      INSERT INTO "AgentRefreshToken"("id","tenantId","userId","employeeId","deviceId","sessionId","tokenHash","expiresAt","updatedAt")
      SELECT 'sc-a-${suffix}-'||g, '${tenantId}', 'sc-u-${suffix}-'||g, 'sc-e-${suffix}-'||g, 'sc-d-${suffix}-'||g, 'sc-as-${suffix}-'||g, md5('a'||g), (now() AT TIME ZONE 'utc') + interval '1 hour', (now() AT TIME ZONE 'utc') FROM generate_series(1,${N}) g`);
    });

    afterAll(async () => {
      try {
        await prisma.agentRefreshToken.deleteMany({ where: { tenantId } });
        await prisma.employeeDevice.deleteMany({ where: { tenantId } });
        await prisma.employee.deleteMany({
          where: { tenantId, userId: { startsWith: 'sc-u-' } },
        });
        await prisma.refreshToken.deleteMany({
          where: { tenantId, userId: { startsWith: 'sc-u-' } },
        });
        await prisma.user.deleteMany({
          where: { tenantId, id: { startsWith: 'sc-u-' } },
        });
        await prisma.identity.deleteMany({
          where: { id: { startsWith: `sc-i-${suffix}` } },
        });
        await actors.cleanup();
        await fixtures.cleanup();
      } finally {
        await app.close();
      }
    });

    it(`sweeps ${N} due terminated employees and reports the time`, async () => {
      const started = Date.now();
      let revoked = 0;
      let ticks = 0;
      while (revoked < N && ticks < 50) {
        const result = await sweeper.tick();
        revoked += result.revoked;
        ticks += 1;
        if (result.revoked === 0) break;
      }
      const ms = Date.now() - started;
      const live = await prisma.user.count({
        where: { tenantId, id: { startsWith: 'sc-u-' }, status: 'ACTIVE' },
      });
      const tokens =
        (await prisma.refreshToken.count({
          where: { tenantId, revokedAt: null, userId: { startsWith: 'sc-u-' } },
        })) +
        (await prisma.agentRefreshToken.count({
          where: { tenantId, revokedAt: null },
        }));
      // eslint-disable-next-line no-console
      console.log(
        `SCALE sweep: ${N} employees revoked in ${ms} ms over ${ticks} tick(s) = ${(ms / N).toFixed(1)} ms/employee`,
      );
      expect(revoked).toBe(N);
      expect(live).toBe(0);
      expect(tokens).toBe(0);
      expect(ms).toBeLessThan(300_000);
    });

    it('serves authenticated requests: sequential and concurrent latency', async () => {
      const get = () =>
        request(app.getHttpServer())
          .get('/roles')
          .set('Authorization', `Bearer ${admin.token}`)
          .set('X-DijiPeople-App', 'web');
      await get(); // warm-up
      const seq: number[] = [];
      for (let i = 0; i < 100; i += 1) {
        const t = process.hrtime.bigint();
        const res = await get();
        seq.push(Number(process.hrtime.bigint() - t) / 1e6);
        expect(res.status).toBe(200);
      }
      const t0 = Date.now();
      const concurrent = await Promise.all(
        Array.from({ length: 50 }, async () => {
          const t = process.hrtime.bigint();
          const res = await get();
          return {
            ms: Number(process.hrtime.bigint() - t) / 1e6,
            status: res.status,
          };
        }),
      );
      const wall = Date.now() - t0;
      const pct = (xs: number[], p: number) =>
        [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) * p)];
      const conc = concurrent.map((c) => c.ms);
      // eslint-disable-next-line no-console
      console.log(
        `SCALE http GET /roles sequential x100: p50=${pct(seq, 0.5).toFixed(1)}ms p95=${pct(seq, 0.95).toFixed(1)}ms max=${Math.max(...seq).toFixed(1)}ms | concurrent x50: p50=${pct(conc, 0.5).toFixed(1)}ms p95=${pct(conc, 0.95).toFixed(1)}ms wall=${wall}ms`,
      );
      expect(concurrent.every((c) => c.status === 200)).toBe(true);
      expect(pct(seq, 0.95)).toBeLessThan(1000);
    });
  },
);
