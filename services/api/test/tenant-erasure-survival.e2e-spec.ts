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
 * REG-220 — ITEM-0003.
 *
 * `tenant-erasure-order.e2e-spec.ts` proves the delete **order** is one
 * PostgreSQL accepts, which is what the payroll cascade needed — a tenant
 * holding one payslip was once un-erasable at all, refused at `payrollPeriod`
 * with `Payslip_payrollRunEmployeeId_fkey` — and
 * `tenant-erasure-dry-run.e2e-spec.ts` proves the dry run is non-destructive.
 * Both operate on a single fixture tenant, so the question neither can answer is
 * the one that matters most for an irreversible cross-tenant operation: **is the
 * neighbour still there?**
 *
 * "The tenant is gone" is the easy half and is not the risk. Erasure walks a
 * 242-model delete order, and every step is a `deleteMany` whose correctness
 * rests entirely on one `tenantId` predicate. A missing predicate deletes a
 * neighbour's rows, the transaction commits happily, and no existing assertion
 * notices — because no neighbour was there to notice with.
 *
 * ## Why the assertion is driven from the plan
 *
 * The survival check reads `TENANT_ERASURE_DELETE_ORDER`,
 * `TENANT_ERASURE_DETACHED_MODELS` and `TENANT_ERASURE_LINK_CLEANUPS` rather
 * than a hand-written list of models. A hand-written list is a snapshot of what
 * somebody thought about on the day, and the failure mode is precisely a model
 * added to erasure later whose predicate is wrong. Driving it from the plan
 * means such a model is covered here the moment it is added, with no second edit
 * anybody could forget.
 *
 * ## Why the detached models get their own probes
 *
 * Detachment is not deletion, so a row count alone would not catch it. Erasure
 * nulls `Contract.subscriptionId`, `SupportCase.invoiceId` and the rest both by
 * `tenantId` **and** along the relation (`{ subscription: { tenantId } }`) — and
 * that second, relation-scoped clear is the one that could reach a neighbour's
 * row while leaving the row itself present. So each cleared field is probed for
 * "still populated", not just each model for "still present".
 *
 * These are the commercial records: contracts, orders, refunds, support history.
 * A mistake here does not lose a workspace its own data, it corrupts a
 * **different paying customer's** financial record — which is why they are
 * seeded in full rather than left as an empty-count comparison that would pass
 * trivially.
 */
function createTestPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for database-backed tests.');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/** One labelled count, so a failure names what was lost rather than a number. */
interface SurvivalProbe {
  label: string;
  count(): Promise<number>;
}

describeWithDatabase()(
  'Tenant erasure leaves the neighbour intact (DB-backed)',
  () => {
    jest.setTimeout(300_000);

    const prisma = createTestPrismaClient();
    const fixtures = new DbFixtures(prisma, 'erasure-survival');

    let doomed: Awaited<ReturnType<DbFixtures['createTenant']>>;
    let neighbour: Awaited<ReturnType<DbFixtures['createTenant']>>;
    let planId: string;

    /**
     * Rows this suite created that erasure deliberately keeps — the detached
     * commercial records. They hold `Restrict` foreign keys to the customer
     * account, so `DbFixtures.cleanup()` cannot remove the account while they
     * exist, and teardown has to take them out by id first.
     */
    const retained: Array<{ model: string; id: string }> = [];

    /** The neighbour's probe values, taken before the erasure. */
    const before = new Map<string, number>();

    beforeAll(async () => {
      await prisma.$connect();
      doomed = await fixtures.createTenant('doomed');
      neighbour = await fixtures.createTenant('neighbour');
      const plan = await prisma.plan.create({
        data: { key: fixtures.name('plan'), name: fixtures.name('plan') },
        select: { id: true },
      });
      planId = plan.id;
    });

    afterAll(async () => {
      /*
       * The neighbour is deliberately left holding a full payroll and
       * commercial chain, and `DbFixtures.cleanup()` deletes a tenant with a
       * plain `tenant.delete` — which PostgreSQL refuses while RESTRICT foreign
       * keys between tenant-owned models still have rows. Running the
       * production erasure sequence over it first is both the honest teardown
       * and a second exercise of that sequence.
       */
      if (neighbour) {
        try {
          await runErasureSequence(neighbour.id);
        } catch (error) {
          console.warn(
            `[erasure-survival] teardown could not erase the neighbour: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      const client = prisma as unknown as Record<
        string,
        { deleteMany(args: { where: unknown }): Promise<{ count: number }> }
      >;
      for (const { model, id } of [...retained].reverse()) {
        try {
          await client[model].deleteMany({ where: { id } });
        } catch (error) {
          console.warn(
            `[erasure-survival] teardown left ${model} ${id} behind: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      await fixtures.cleanup();
      if (planId) {
        await prisma.plan
          .deleteMany({ where: { id: planId } })
          .catch(() => undefined);
      }
      await prisma.$disconnect();
    });

    /**
     * The payroll chain the order suite seeds, and for the same reason: it is
     * the shape that produced the original un-erasable tenant, so it is the
     * shape most likely to expose a predicate mistake.
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
      await prisma.payslip.create({
        data: {
          tenantId,
          payrollRunId: run.id,
          payrollRunEmployeeId: runEmployee.id,
          employeeId: employee.id,
          payslipNumber: `PS-${suffix}`,
          currencyCode: 'AED',
        },
      });
    }

    /**
     * One row in every model erasure *keeps* — the detached commercial records,
     * and the link row that joins a retained support case to a tenant error log.
     *
     * Without these the detached and link-cleanup probes would compare zero to
     * zero and pass without testing anything, which is the exact failure mode
     * this suite exists to rule out elsewhere.
     */
    async function seedCommercialChain(
      tenantId: string,
      customerAccountId: string,
      suffix: string,
    ) {
      const subscription = await prisma.subscription.create({
        data: { tenantId, planId, startDate: new Date('2026-01-01') },
        select: { id: true },
      });

      const contract = await prisma.contract.create({
        data: {
          tenantId,
          customerAccountId,
          subscriptionId: subscription.id,
          contractNumber: `CON-${suffix}`,
          title: `Contract ${suffix}`,
          contractType: 'PARTNER_AGREEMENT',
          counterpartyName: `Counterparty ${suffix}`,
        },
        select: { id: true },
      });
      retained.push({ model: 'contract', id: contract.id });

      /*
       * SupportCase.invoiceId is one of the fields erasure clears, and clearing
       * it is relation-scoped (`{ invoice: { tenantId } }`). Without an actual
       * invoice the probe for that field would sit at zero and could never fail,
       * so the invoice is seeded even though nothing else here reads it.
       */
      const invoice = await prisma.invoice.create({
        data: {
          tenantId,
          subscriptionId: subscription.id,
          invoiceNumber: `INV-${suffix}`,
          amount: '50.00',
          currency: 'AED',
          issueDate: new Date('2026-01-01'),
          dueDate: new Date('2026-01-31'),
        },
        select: { id: true },
      });

      const supportCase = await prisma.supportCase.create({
        data: {
          tenantId,
          customerAccountId,
          subscriptionId: subscription.id,
          invoiceId: invoice.id,
          caseNumber: `CASE-${suffix}`,
          title: `Case ${suffix}`,
          description: `Raised by ${suffix}`,
        },
        select: { id: true },
      });
      retained.push({ model: 'supportCase', id: supportCase.id });

      const onboarding = await prisma.customerOnboarding.create({
        data: {
          tenantId,
          customerId: customerAccountId,
          primaryOwnerFirstName: 'Test',
          primaryOwnerLastName: 'Owner',
          primaryOwnerWorkEmail: `${suffix}@example.invalid`,
        },
        select: { id: true },
      });
      retained.push({ model: 'customerOnboarding', id: onboarding.id });

      const order = await prisma.subscriptionOrder.create({
        data: {
          tenantId,
          customerAccountId,
          subscriptionId: subscription.id,
          orderNumber: `ORD-${suffix}`,
          currency: 'AED',
          billingCycle: 'MONTHLY',
          billingInterval: 'MONTH',
          requestedSeats: 5,
          unitAmount: '10.00',
          subtotalAmount: '50.00',
          taxableAmount: '50.00',
          totalAmount: '50.00',
        },
        select: { id: true },
      });
      retained.push({ model: 'subscriptionOrder', id: order.id });

      const refund = await prisma.refundRequest.create({
        data: {
          tenantId,
          customerAccountId,
          amount: '10.00',
          currency: 'AED',
          reasonCode: 'BILLING_ERROR',
          reason: `Refund ${suffix}`,
        },
        select: { id: true },
      });
      retained.push({ model: 'refundRequest', id: refund.id });

      /*
       * The error log is tenant content and is erased; the support case above
       * is kept. `SupportCaseIncident` is the join between them, carries no
       * `tenantId` of its own, and is removed through its relation — which is
       * the whole reason TENANT_ERASURE_LINK_CLEANUPS exists, and the reason it
       * needs a neighbour's row to prove the relation scope holds.
       */
      const errorLog = await prisma.errorLog.create({
        data: {
          tenantId,
          traceId: `trace-${suffix}`,
          errorCode: 'TEST_ERROR',
          statusCode: 500,
          severity: 'ERROR',
          message: `Message ${suffix}`,
          description: `Description ${suffix}`,
        },
        select: { id: true },
      });
      await prisma.supportCaseIncident.create({
        data: { supportCaseId: supportCase.id, errorLogId: errorLog.id },
      });
    }

    /** The production sequence, kept identical to the order suite's copy. */
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
                  entry.clearFields.map(({ field }) => [field, null]),
                ),
              },
            });
            /* The relation-scoped release — see TenantErasureService.eraseWithin. */
            for (const { field, via } of entry.clearFields) {
              await client[entry.model].updateMany({
                where: { [via]: { tenantId } },
                data: { [field]: null },
              });
            }
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
        { timeout: 240_000 },
      );
    }

    /**
     * Every question the erasure plan makes it possible to get wrong, for one
     * tenant — built from the three collections rather than written out, so the
     * coverage tracks the plan.
     */
    function probesFor(tenantId: string): SurvivalProbe[] {
      const client = prisma as unknown as Record<
        string,
        { count(args: { where: unknown }): Promise<number> }
      >;
      const probes: SurvivalProbe[] = [];

      for (const model of TENANT_ERASURE_DELETE_ORDER) {
        probes.push({
          label: `delete:${model}`,
          count: () => client[model].count({ where: { tenantId } }),
        });
      }

      for (const entry of TENANT_ERASURE_DETACHED_MODELS) {
        probes.push({
          label: `detached:${entry.model}`,
          count: () => client[entry.model].count({ where: { tenantId } }),
        });
        for (const { field } of entry.clearFields) {
          probes.push({
            label: `detached:${entry.model}.${field}`,
            count: () =>
              client[entry.model].count({
                where: { tenantId, [field]: { not: null } },
              }),
          });
        }
      }

      for (const entry of TENANT_ERASURE_LINK_CLEANUPS) {
        probes.push({
          label: `link:${entry.model}`,
          count: () =>
            client[entry.model].count({
              where: { [entry.relation]: { tenantId } },
            }),
        });
      }

      return probes;
    }

    async function snapshot(tenantId: string): Promise<Map<string, number>> {
      const counts = new Map<string, number>();
      for (const probe of probesFor(tenantId)) {
        counts.set(probe.label, await probe.count());
      }
      return counts;
    }

    /** The number of probes the three collections should produce. */
    function expectedProbeCount(): number {
      return (
        TENANT_ERASURE_DELETE_ORDER.length +
        TENANT_ERASURE_DETACHED_MODELS.reduce(
          (total, entry) => total + 1 + entry.clearFields.length,
          0,
        ) +
        TENANT_ERASURE_LINK_CLEANUPS.length
      );
    }

    it('seeds both tenants with the same shape of data', async () => {
      const suffix = fixtures.runId.slice(0, 8);
      await seedPayrollChain(doomed.id, `d-${suffix}`);
      await seedCommercialChain(
        doomed.id,
        doomed.customerAccountId,
        `d-${suffix}`,
      );
      await seedPayrollChain(neighbour.id, `n-${suffix}`);
      await seedCommercialChain(
        neighbour.id,
        neighbour.customerAccountId,
        `n-${suffix}`,
      );

      for (const [label, count] of await snapshot(neighbour.id)) {
        before.set(label, count);
      }

      /*
       * Each of the three groups must actually hold rows. A group that is empty
       * compares zero to zero afterwards and would pass without asserting
       * anything — the same "assertion that cannot fail" this whole suite exists
       * to remove.
       */
      const populated = (prefix: string) =>
        [...before.entries()].filter(
          ([label, count]) => label.startsWith(prefix) && count > 0,
        ).length;

      expect(populated('delete:')).toBeGreaterThan(3);
      expect(populated('detached:')).toBe(
        TENANT_ERASURE_DETACHED_MODELS.reduce(
          (total, entry) => total + 1 + entry.clearFields.length,
          0,
        ),
      );
      expect(populated('link:')).toBe(TENANT_ERASURE_LINK_CLEANUPS.length);
    });

    it('erases the doomed tenant', async () => {
      const rowsDeleted = await runErasureSequence(doomed.id);
      expect(rowsDeleted).toBeGreaterThan(0);
      expect(
        await prisma.tenant.findUnique({ where: { id: doomed.id } }),
      ).toBeNull();
    });

    it('leaves the neighbour complete, across the whole erasure plan', async () => {
      /*
       * The assertion ITEM-0003 exists for. A difference is reported as
       * `label: expected → actual`, so a failure names the model and the loss
       * rather than a bare count mismatch somebody then has to go and locate.
       */
      const after = await snapshot(neighbour.id);

      const losses: string[] = [];
      for (const [label, expected] of before) {
        const actual = after.get(label) ?? 0;
        if (actual !== expected) {
          losses.push(`${label}: ${expected} → ${actual}`);
        }
      }

      expect(losses).toEqual([]);
    });

    it('leaves the neighbour tenant row itself intact and usable', async () => {
      const survivor = await prisma.tenant.findUnique({
        where: { id: neighbour.id },
        select: { id: true, name: true, status: true },
      });

      expect(survivor).not.toBeNull();
      expect(survivor?.id).toBe(neighbour.id);

      // Usable, not merely present: a tenant row whose contents were cascaded
      // away would still satisfy `findUnique`.
      expect(
        await prisma.employee.count({ where: { tenantId: neighbour.id } }),
      ).toBeGreaterThan(0);
    });

    it('probes every model the erasure plan touches', () => {
      /*
       * Guards the guard. If a collection were empty, or `probesFor` silently
       * produced nothing, the survival assertion above would iterate an empty
       * map and pass while asserting nothing at all.
       */
      expect(TENANT_ERASURE_DELETE_ORDER.length).toBeGreaterThan(100);
      expect(before.size).toBe(expectedProbeCount());
    });
  },
);
