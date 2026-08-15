import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

import {
  TENANT_ERASURE_DELETE_ORDER,
  TENANT_ERASURE_DETACHED_MODELS,
  TENANT_ERASURE_LINK_CLEANUPS,
  TENANT_ERASURE_SELF_REFERENCES,
} from '../src/modules/tenant-control-plane/tenant-erasure.constants';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';

/**
 * The erasure sequence, executed against a real PostgreSQL.
 *
 * WHY THIS CANNOT BE A MOCKED TEST. The whole problem is referential
 * enforcement: RESTRICT is checked immediately, and a cascade fires a child's
 * inbound RESTRICT checks while the referencing rows still exist. A mocked
 * Prisma returns whatever it was told to return, so it will happily "prove" a
 * delete order that PostgreSQL refuses.
 *
 * THE FAILURE THIS EXISTS FOR. `Payslip -> PayrollRunEmployee` is Restrict and
 * `PayrollRunEmployee` cascades from `PayrollRun`, which cascades from
 * `PayrollPeriod`. Deleting the period cascaded into `PayrollRunEmployee`, whose
 * payslips had not been deleted yet, and PostgreSQL refused — so every tenant
 * holding a single payslip was permanently un-erasable. Nothing referenced
 * `PayrollPeriod` directly, so the direct-edge ordering check saw nothing wrong.
 */
function createTestPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for database-backed tests.');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

describeWithDatabase()('Tenant erasure delete order (DB-backed)', () => {
  jest.setTimeout(180_000);

  const prisma = createTestPrismaClient();
  const fixtures = new DbFixtures(prisma, 'erasure-order');

  let tenant: Awaited<ReturnType<DbFixtures['createTenant']>>;

  beforeAll(async () => {
    await prisma.$connect();
    tenant = await fixtures.createTenant('erasable');
  });

  afterAll(async () => {
    await fixtures.cleanup();
    await prisma.$disconnect();
  });

  /**
   * The exact payroll chain from the production failure. Minimal on purpose:
   * only the rows needed to create the constraint, so the test states what it
   * depends on rather than passing for reasons nobody can see.
   */
  async function seedPayrollChain(tenantId: string, suffix: string) {
    const employee = await prisma.employee.create({
      data: {
        tenantId,
        employeeCode: `EMP-${suffix}`,
        firstName: 'Test',
        lastName: 'Employee',
        phone: '+971500000000',
        hireDate: new Date('2020-01-01'),
      },
    });
    const calendar = await prisma.payrollCalendar.create({
      data: {
        tenantId,
        name: `Calendar ${suffix}`,
        frequency: 'MONTHLY',
        currencyCode: 'AED',
      },
    });
    const period = await prisma.payrollPeriod.create({
      data: {
        tenantId,
        payrollCalendarId: calendar.id,
        name: `Period ${suffix}`,
        periodStart: new Date('2026-01-01'),
        periodEnd: new Date('2026-01-31'),
      },
    });
    const run = await prisma.payrollRun.create({
      data: { tenantId, payrollPeriodId: period.id },
    });
    const runEmployee = await prisma.payrollRunEmployee.create({
      data: {
        tenantId,
        payrollRunId: run.id,
        employeeId: employee.id,
        currencyCode: 'AED',
      },
    });
    const payslip = await prisma.payslip.create({
      data: {
        tenantId,
        payrollRunId: run.id,
        payrollRunEmployeeId: runEmployee.id,
        employeeId: employee.id,
        payslipNumber: `PS-${suffix}`,
        currencyCode: 'AED',
      },
    });
    return { employee, calendar, period, run, runEmployee, payslip };
  }

  /**
   * The production sequence, reproduced. Kept deliberately close to
   * `TenantErasureService.eraseWithin` — a test that runs a different sequence
   * proves nothing about the one that ships.
   */
  async function runErasureSequence(tenantId: string) {
    return prisma.$transaction(
      async (tx) => {
        const client = tx as unknown as Record<
          string,
          {
            deleteMany(args: { where: unknown }): Promise<{ count: number }>;
            updateMany(args: {
              where: unknown;
              data: unknown;
            }): Promise<{ count: number }>;
          }
        >;

        for (const entry of TENANT_ERASURE_DETACHED_MODELS) {
          await client[entry.model].updateMany({
            where: { tenantId },
            data: {
              tenantId: null,
              ...Object.fromEntries(
                entry.clearFields.map((field) => [field, null]),
              ),
            },
          });
        }
        for (const entry of TENANT_ERASURE_LINK_CLEANUPS) {
          await client[entry.model].deleteMany({
            where: { [entry.relation]: { tenantId } },
          });
        }
        for (const entry of TENANT_ERASURE_SELF_REFERENCES) {
          await client[entry.model].updateMany({
            where: { tenantId },
            data: Object.fromEntries(
              entry.fields.map((field) => [field, null]),
            ),
          });
        }

        let rows = 0;
        for (const model of TENANT_ERASURE_DELETE_ORDER) {
          const result = await client[model].deleteMany({
            where: { tenantId },
          });
          rows += result.count;
        }
        await tx.tenant.delete({ where: { id: tenantId } });
        return rows;
      },
      { timeout: 120_000 },
    );
  }

  it('erases a tenant that holds payslips', async () => {
    /*
     * This is the regression. Before the delete order was corrected, this
     * transaction was refused at `payrollPeriod` with
     * `Payslip_payrollRunEmployeeId_fkey` and the tenant could not be erased at
     * all, on any attempt.
     */
    const seeded = await seedPayrollChain(
      tenant.id,
      fixtures.runId.slice(0, 8),
    );
    expect(seeded.payslip.id).toBeTruthy();

    const rowsDeleted = await runErasureSequence(tenant.id);
    expect(rowsDeleted).toBeGreaterThan(0);

    const [survivingTenant, survivingPayslip, survivingRunEmployee] =
      await Promise.all([
        prisma.tenant.findUnique({ where: { id: tenant.id } }),
        prisma.payslip.findUnique({ where: { id: seeded.payslip.id } }),
        prisma.payrollRunEmployee.findUnique({
          where: { id: seeded.runEmployee.id },
        }),
      ]);

    expect(survivingTenant).toBeNull();
    expect(survivingPayslip).toBeNull();
    expect(survivingRunEmployee).toBeNull();
  });

  it('refuses to delete a PayrollRunEmployee while a payslip references it', async () => {
    /*
     * The constraint the ordering exists for, asserted directly rather than
     * through a cascade.
     *
     * Going through a cascade would not be a sound test: deleting a PayrollRun
     * fires the cascade into PayrollRunEmployee *and* the cascade into Payslip,
     * and PostgreSQL does not define which is processed first. Empirically this
     * schema currently happens to remove the payslips first, so the plan
     * survives — but that is a coincidence of constraint ordering, not a
     * guarantee, and it is exactly the kind of thing that changes when a
     * constraint is dropped and recreated by a migration.
     *
     * What IS guaranteed is the statement below: while a payslip exists, its
     * PayrollRunEmployee cannot be removed. Deleting payslips first makes the
     * plan correct by construction instead of correct by luck.
     */
    const scratch = new DbFixtures(prisma, 'erasure-order-negative');
    const other = await scratch.createTenant('blocked');
    const seeded = await seedPayrollChain(other.id, scratch.runId.slice(0, 8));

    await expect(
      prisma.payrollRunEmployee.delete({
        where: { id: seeded.runEmployee.id },
      }),
    ).rejects.toThrow();

    /* Removing the payslip first makes the same delete succeed. */
    await prisma.payslip.delete({ where: { id: seeded.payslip.id } });
    await expect(
      prisma.payrollRunEmployee.delete({
        where: { id: seeded.runEmployee.id },
      }),
    ).resolves.toBeTruthy();

    await scratch.cleanup();
  });

  it('names every model in the plan on the live Prisma client', async () => {
    /*
     * A model renamed in the schema but not in the plan fails here rather than
     * half-way through a live erasure with a partially-applied transaction.
     */
    const client = prisma as unknown as Record<string, unknown>;
    const unknownModels = [
      ...TENANT_ERASURE_DELETE_ORDER,
      ...TENANT_ERASURE_DETACHED_MODELS.map((entry) => entry.model),
      ...TENANT_ERASURE_LINK_CLEANUPS.map((entry) => entry.model),
      ...TENANT_ERASURE_SELF_REFERENCES.map((entry) => entry.model),
    ].filter((model) => {
      const delegate = client[model] as { deleteMany?: unknown } | undefined;
      return typeof delegate?.deleteMany !== 'function';
    });

    expect(unknownModels).toEqual([]);
  });
});
