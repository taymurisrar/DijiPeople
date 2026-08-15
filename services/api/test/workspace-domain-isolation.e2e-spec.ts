import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';

/**
 * Workspace addressing, proved against a real PostgreSQL.
 *
 * Every property here is enforced by the database — a unique index on the
 * hostname, a partial unique index for one primary per tenant, cascade on
 * tenant deletion. A mocked Prisma returns whatever it was told to return, so it
 * can "prove" a constraint that the schema does not actually have. Two tenants
 * both holding `maseer.dijipeople.com` is the failure this suite exists to make
 * impossible, and only the real index can demonstrate that.
 *
 * Environment isolation is tested here too, because in this architecture a UAT
 * workspace is a *separate tenant* of the same customer. That is the whole
 * design: if UAT were a flag on one tenant row, test data and production data
 * would share every table.
 */
function createTestPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for database-backed tests.');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

describeWithDatabase()(
  'Workspace domains and environment isolation (DB-backed)',
  () => {
    jest.setTimeout(120_000);

    const prisma = createTestPrismaClient();
    const fixtures = new DbFixtures(prisma, 'workspace-domains');

    let tenantA: Awaited<ReturnType<DbFixtures['createTenant']>>;
    let tenantB: Awaited<ReturnType<DbFixtures['createTenant']>>;
    let uat: Awaited<ReturnType<DbFixtures['createTenant']>>;

    beforeAll(async () => {
      await prisma.$connect();
      tenantA = await fixtures.createTenant('prod-a');
      tenantB = await fixtures.createTenant('prod-b');
      /* Same customer account, different environment — a second tenant. */
      uat = await fixtures.createTenant('uat-a', {
        customerAccountId: tenantA.customerAccountId,
        environmentType: 'UAT',
      });
    });

    afterAll(async () => {
      await fixtures.cleanup();
      await prisma.$disconnect();
    });

    describe('hostname uniqueness', () => {
      it('refuses to let two tenants hold the same hostname', async () => {
        const hostname = `${fixtures.runId}-shared.example.invalid`;

        await prisma.tenantDomain.create({
          data: {
            tenantId: tenantA.id,
            domain: hostname,
            type: 'SYSTEM_SUBDOMAIN',
            isPrimary: true,
            verificationStatus: 'VERIFIED',
            tlsStatus: 'ACTIVE',
          },
        });

        /*
         * The attack this prevents: tenant B claiming tenant A's hostname and
         * receiving requests — and session cookies — intended for A.
         */
        await expect(
          prisma.tenantDomain.create({
            data: {
              tenantId: tenantB.id,
              domain: hostname,
              type: 'CUSTOM_DOMAIN',
              isPrimary: false,
              verificationStatus: 'PENDING',
              tlsStatus: 'PENDING',
            },
          }),
        ).rejects.toThrow();
      });

      it('resolves a hostname to exactly one tenant', async () => {
        const hostname = `${fixtures.runId}-resolve.example.invalid`;
        await prisma.tenantDomain.create({
          data: {
            tenantId: tenantB.id,
            domain: hostname,
            type: 'SYSTEM_SUBDOMAIN',
            isPrimary: true,
            verificationStatus: 'VERIFIED',
            tlsStatus: 'ACTIVE',
          },
        });

        const found = await prisma.tenantDomain.findUnique({
          where: { domain: hostname },
          select: { tenantId: true },
        });
        expect(found?.tenantId).toBe(tenantB.id);
        expect(found?.tenantId).not.toBe(tenantA.id);
      });
    });

    describe('one primary hostname per tenant', () => {
      it('refuses a second primary for the same tenant', async () => {
        /*
         * Two primaries would make "the workspace URL" ambiguous, and every
         * generated link — invitations, password resets — would depend on row
         * ordering.
         */
        await expect(
          prisma.tenantDomain.create({
            data: {
              tenantId: tenantA.id,
              domain: `${fixtures.runId}-second-primary.example.invalid`,
              type: 'CUSTOM_DOMAIN',
              isPrimary: true,
              verificationStatus: 'VERIFIED',
              tlsStatus: 'ACTIVE',
            },
          }),
        ).rejects.toThrow();
      });

      it('allows any number of non-primary hostnames', async () => {
        const created = await prisma.tenantDomain.create({
          data: {
            tenantId: tenantA.id,
            domain: `${fixtures.runId}-secondary.example.invalid`,
            type: 'CUSTOM_DOMAIN',
            isPrimary: false,
            verificationStatus: 'PENDING',
            tlsStatus: 'PENDING',
          },
        });
        expect(created.isPrimary).toBe(false);
      });

      it('allows a new primary once the old one is demoted, in one transaction', async () => {
        const hostname = `${fixtures.runId}-promote.example.invalid`;
        const candidate = await prisma.tenantDomain.create({
          data: {
            tenantId: tenantB.id,
            domain: hostname,
            type: 'CUSTOM_DOMAIN',
            isPrimary: false,
            verificationStatus: 'VERIFIED',
            tlsStatus: 'ACTIVE',
          },
        });

        await prisma.$transaction(async (tx) => {
          await tx.tenantDomain.updateMany({
            where: { tenantId: tenantB.id, isPrimary: true },
            data: { isPrimary: false },
          });
          await tx.tenantDomain.update({
            where: { id: candidate.id },
            data: { isPrimary: true },
          });
        });

        const primaries = await prisma.tenantDomain.findMany({
          where: { tenantId: tenantB.id, isPrimary: true },
          select: { domain: true },
        });
        expect(primaries).toEqual([{ domain: hostname }]);
      });
    });

    describe('environment isolation', () => {
      it('gives the same customer separate tenants per environment', () => {
        expect(uat.customerAccountId).toBe(tenantA.customerAccountId);
        expect(uat.id).not.toBe(tenantA.id);
        expect(uat.environmentType).toBe('UAT');
        expect(tenantA.environmentType).toBe('PRODUCTION');
      });

      it('does not leak production rows into a UAT-scoped query', async () => {
        const role = await prisma.role.create({
          data: {
            tenantId: tenantA.id,
            key: `${fixtures.runId}-prod-role`,
            name: 'Production only',
          },
        });

        const visibleToUat = await prisma.role.findFirst({
          where: { id: role.id, tenantId: uat.id },
        });
        expect(visibleToUat).toBeNull();
      });

      it('binds a gateway to one environment, so a UAT gateway cannot serve production', async () => {
        /*
         * The concrete risk: a gateway paired against UAT pushing device punches
         * into the production workspace. Because environments are separate
         * tenants, the tenant-scoped read is the whole defence — and this asserts
         * it holds at the database.
         */
        const gateway = await prisma.integrationGateway.create({
          data: {
            tenantId: uat.id,
            name: `${fixtures.runId}-uat-gateway`,
            status: 'PENDING',
          },
        });

        const fromProduction = await prisma.integrationGateway.findFirst({
          where: { id: gateway.id, tenantId: tenantA.id },
        });
        expect(fromProduction).toBeNull();

        const fromUat = await prisma.integrationGateway.findFirst({
          where: { id: gateway.id, tenantId: uat.id },
        });
        expect(fromUat?.id).toBe(gateway.id);
      });

      it('lets each environment hold its own hostname', async () => {
        const prodHost = `${fixtures.runId}-env-prod.example.invalid`;
        const uatHost = `${fixtures.runId}-env-uat.example.invalid`;

        await prisma.tenantDomain.create({
          data: {
            tenantId: uat.id,
            domain: uatHost,
            type: 'SYSTEM_SUBDOMAIN',
            isPrimary: true,
            verificationStatus: 'VERIFIED',
            tlsStatus: 'ACTIVE',
          },
        });
        await prisma.tenantDomain.create({
          data: {
            tenantId: tenantA.id,
            domain: prodHost,
            type: 'CUSTOM_DOMAIN',
            isPrimary: false,
            verificationStatus: 'VERIFIED',
            tlsStatus: 'ACTIVE',
          },
        });

        const [uatRow, prodRow] = await Promise.all([
          prisma.tenantDomain.findUnique({ where: { domain: uatHost } }),
          prisma.tenantDomain.findUnique({ where: { domain: prodHost } }),
        ]);
        expect(uatRow?.tenantId).toBe(uat.id);
        expect(prodRow?.tenantId).toBe(tenantA.id);
      });
    });

    describe('lifecycle', () => {
      it('releases every hostname when its tenant is erased', async () => {
        /*
         * A hostname left behind after erasure is a name nobody can reclaim, and a
         * row pointing at a tenant that no longer exists.
         */
        const scratch = new DbFixtures(prisma, 'workspace-domains-erase');
        const doomed = await scratch.createTenant('doomed');
        const hostname = `${scratch.runId}-doomed.example.invalid`;
        await prisma.tenantDomain.create({
          data: {
            tenantId: doomed.id,
            domain: hostname,
            type: 'SYSTEM_SUBDOMAIN',
            isPrimary: true,
            verificationStatus: 'VERIFIED',
            tlsStatus: 'ACTIVE',
          },
        });

        await scratch.cleanup();

        const orphan = await prisma.tenantDomain.findUnique({
          where: { domain: hostname },
        });
        expect(orphan).toBeNull();
      });
    });
  },
);
