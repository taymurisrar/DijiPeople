/**
 * Deterministic fixtures for database-backed tests.
 *
 * Every test that touches a real database needs data that is its own: created
 * by the test, unique to the run, and removed afterwards. The alternative —
 * relying on whatever `seed:demo` left behind — produces tests that pass on one
 * machine, fail on another, and quietly stop testing anything the day the seed
 * changes.
 *
 * Rules this file exists to enforce:
 *   - No dependence on real customer data, production snapshots, developer
 *     records or mutable shared seeds.
 *   - Unique-per-run identifiers, so two runs against one database cannot
 *     collide.
 *   - Explicit cleanup, in reverse dependency order, that tolerates partial
 *     construction when a test fails half-way through.
 *
 * Usage:
 *
 *   const fixtures = new DbFixtures(prisma, 'tenant-isolation');
 *   const a = await fixtures.createTenant();
 *   const b = await fixtures.createTenant();
 *   // …
 *   afterAll(() => fixtures.cleanup());
 */

import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

export interface FixtureTenant {
  id: string;
  name: string;
  slug: string;
  customerAccountId: string;
}

export class DbFixtures {
  /**
   * Unique per instance. Included in every generated name so a failed run that
   * skipped cleanup cannot collide with the next one — the situation that makes
   * "it passes on the second try" look like flakiness.
   */
  readonly runId = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;

  private readonly tenantIds: string[] = [];
  private readonly customerAccountIds: string[] = [];

  constructor(
    private readonly prisma: PrismaClient,
    private readonly label: string,
  ) {}

  /** A name no other run can produce. */
  name(suffix: string): string {
    return `test-${this.label}-${this.runId}-${suffix}`;
  }

  /**
   * A tenant with only the columns the schema actually requires.
   *
   * `Tenant.customerAccountId` is required and joined `onDelete: Restrict`, so
   * a tenant cannot exist without a CustomerAccount and the account cannot be
   * removed while the tenant references it. That ordering constraint is real
   * schema behaviour, not a fixture quirk — a mocked Prisma would never have
   * surfaced it.
   *
   * Deliberately minimal otherwise: a fixture that populates everything makes
   * tests pass for reasons they never state, and hides which fields the
   * behaviour under test actually depends on.
   */
  async createTenant(suffix = 'tenant'): Promise<FixtureTenant> {
    const name = this.name(suffix);

    const account = await this.prisma.customerAccount.create({
      data: {
        companyName: name,
        contactEmail: `${name}@example.invalid`,
        country: 'AE',
      },
      select: { id: true },
    });
    this.customerAccountIds.push(account.id);

    const tenant = await this.prisma.tenant.create({
      data: {
        name,
        slug: name.toLowerCase(),
        customerAccountId: account.id,
      },
      select: { id: true, name: true, slug: true, customerAccountId: true },
    });
    this.tenantIds.push(tenant.id);
    return tenant;
  }

  /**
   * Remove everything this instance created, in reverse dependency order:
   * tenants first, then their customer accounts. Reversing that order fails on
   * the `Restrict` foreign key above.
   *
   * Most tenant-owned models cascade from Tenant, but foreign keys *between*
   * tenant-owned models are frequently `Restrict`, and PostgreSQL enforces
   * RESTRICT immediately — see docs/knowledge/modules/tenant-control-plane.md.
   * Cleanup therefore cannot assume one delete will succeed.
   *
   * Failures are reported, never thrown: a cleanup error must not mask the test
   * failure that caused it, and an ephemeral database is discarded regardless.
   */
  async cleanup(): Promise<void> {
    for (const tenantId of [...this.tenantIds].reverse()) {
      await this.tryDelete('tenant', tenantId, () =>
        this.prisma.tenant.delete({ where: { id: tenantId } }),
      );
    }
    this.tenantIds.length = 0;

    for (const accountId of [...this.customerAccountIds].reverse()) {
      await this.tryDelete('customerAccount', accountId, () =>
        this.prisma.customerAccount.delete({ where: { id: accountId } }),
      );
    }
    this.customerAccountIds.length = 0;
  }

  private async tryDelete(model: string, id: string, remove: () => Promise<unknown>): Promise<void> {
    try {
      await remove();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(
        `[db-fixtures] cleanup left ${model} ${id} behind: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

/**
 * Skip a database-backed suite when no database is reachable, instead of
 * failing with a connection error that looks like a product defect.
 *
 * A skipped suite is recorded as `DB_E2E = BLOCKED_INFRASTRUCTURE`, never as a
 * pass — see .agent/context/testing-architecture.md.
 */
export function describeWithDatabase(): jest.Describe {
  return process.env.DATABASE_URL ? describe : describe.skip;
}
