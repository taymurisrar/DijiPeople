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
import type { PrismaClient, TenantEnvironmentType } from '@prisma/client';

export interface FixtureTenant {
  id: string;
  name: string;
  slug: string;
  customerAccountId: string;
  environmentType: TenantEnvironmentType;
}

/**
 * A tenant that is actually usable by the modules that hang work off an
 * organizational position — attendance, gateways, users, employees.
 *
 * `BusinessUnit.organizationId` is required and joined on the composite
 * `(organizationId, tenantId)`, so "a tenant with a business unit" is really
 * three rows, not two. Returning all three ids means a suite never has to go
 * looking for what it just created.
 */
export interface FixtureTenantWithBusinessUnit extends FixtureTenant {
  organizationId: string;
  businessUnitId: string;
}

/**
 * The standard two-tenant shape for cross-tenant negative tests.
 *
 *   Tenant A └ Organization A └ Business Unit A
 *   Tenant B └ Organization B └ Business Unit B
 *
 * Named `a` and `b` rather than `primary`/`foreign` because which one plays the
 * intruder differs by suite, and a fixture that decides that for the test reads
 * as an assertion it is not making.
 */
export interface FixtureTenantPair {
  a: FixtureTenantWithBusinessUnit;
  b: FixtureTenantWithBusinessUnit;
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
  async createTenant(
    suffix = 'tenant',
    options: {
      /**
       * Reuse an existing customer account, so several environments of the same
       * customer can be created. Without this every fixture tenant gets its own
       * account and "same customer, different environment" cannot be expressed.
       */
      customerAccountId?: string;
      environmentType?: TenantEnvironmentType;
    } = {},
  ): Promise<FixtureTenant> {
    const name = this.name(suffix);

    let customerAccountId = options.customerAccountId;
    if (!customerAccountId) {
      const account = await this.prisma.customerAccount.create({
        data: {
          companyName: name,
          contactEmail: `${name}@example.invalid`,
          country: 'AE',
        },
        select: { id: true },
      });
      this.customerAccountIds.push(account.id);
      customerAccountId = account.id;
    }

    const tenant = await this.prisma.tenant.create({
      data: {
        name,
        slug: name.toLowerCase(),
        customerAccountId,
        ...(options.environmentType
          ? { environmentType: options.environmentType }
          : {}),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        customerAccountId: true,
        environmentType: true,
      },
    });
    this.tenantIds.push(tenant.id);
    return tenant;
  }

  /**
   * An organization, the row a business unit cannot exist without.
   *
   * Only `tenantId` and `name` are required; everything else defaults. Kept
   * minimal for the same reason `createTenant` is — a fixture that fills in
   * `organizationType`, hierarchy and contacts would let a test pass on data it
   * never asked for.
   */
  async createOrganization(tenantId: string, suffix = 'org'): Promise<string> {
    const organization = await this.prisma.organization.create({
      data: { tenantId, name: this.name(suffix) },
      select: { id: true },
    });
    return organization.id;
  }

  /** A business unit under an existing organization of the same tenant. */
  async createBusinessUnit(
    tenantId: string,
    organizationId: string,
    suffix = 'bu',
  ): Promise<string> {
    const businessUnit = await this.prisma.businessUnit.create({
      data: { tenantId, organizationId, name: this.name(suffix) },
      select: { id: true },
    });
    return businessUnit.id;
  }

  /**
   * A tenant complete enough for the attendance, gateway and user modules:
   * customer account → tenant → organization → business unit.
   *
   * This is the shape three suites used to go looking for in `seed:demo`, with
   * `tenant.findMany({ where: { businessUnits: { some: {} } }, take: 2 })`.
   * That query is why they all failed: `seed:demo` creates exactly ONE tenant,
   * so `take: 2` returned one row and `beforeAll` threw "These tests need two
   * tenants with at least one business unit" before a single assertion ran.
   *
   * It was never a seeding bug. A test that adopts whichever tenants happen to
   * exist is coupled to a fixture it does not own, cannot assert anything about
   * identity, and mutates data the next suite is also reading.
   */
  async createTenantWithBusinessUnit(
    suffix = 'tenant',
  ): Promise<FixtureTenantWithBusinessUnit> {
    const tenant = await this.createTenant(suffix);
    const organizationId = await this.createOrganization(
      tenant.id,
      `${suffix}-org`,
    );
    const businessUnitId = await this.createBusinessUnit(
      tenant.id,
      organizationId,
      `${suffix}-bu`,
    );
    return { ...tenant, organizationId, businessUnitId };
  }

  /**
   * Two fully-formed, mutually isolated tenants — the fixture every
   * cross-tenant negative test needs.
   *
   * Separate customer accounts as well as separate tenants, so a leak through
   * the commercial side is caught too rather than being hidden by a shared
   * parent row.
   */
  async createTenantPair(): Promise<FixtureTenantPair> {
    return {
      a: await this.createTenantWithBusinessUnit('a'),
      b: await this.createTenantWithBusinessUnit('b'),
    };
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

  private async tryDelete(
    model: string,
    id: string,
    remove: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await remove();
    } catch (error) {
      console.warn(
        `[db-fixtures] cleanup left ${model} ${id} behind: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

/**
 * The ids out of a list that were actually assigned.
 *
 * Teardown runs whether or not setup finished, so an id a failed `beforeAll`
 * never reached is `undefined` — and Prisma rejects `undefined` inside an `in`
 * array outright:
 *
 *   Invalid `prisma.rawAttendanceEvent.deleteMany()` invocation
 *   Invalid value for argument `in[0]`: Can not use `undefined` value
 *
 * That is how a suite reported "Test suite failed to run" on top of 27 failing
 * tests, with the teardown error on top of the setup error that caused it. Two
 * failures, one cause, and the second one louder than the first.
 *
 * Filtering is not enough on its own: an empty array must skip the delete
 * entirely, because `{ in: [] }` matches nothing and issues a pointless query,
 * while a caller who spreads the result into a bare `where` can end up with no
 * filter at all — which deletes everything.
 *
 *   const ids = definedIds([a, b, c]);
 *   if (ids.length > 0) await prisma.thing.deleteMany({ where: { id: { in: ids } } });
 *
 * Prefer cascading from a fixture tenant where the model is tenant-owned. This
 * exists for the rows that are not — platform-level models such as
 * `ApplicationRelease`, which no tenant delete can reach.
 */
export function definedIds(ids: (string | undefined | null)[]): string[] {
  return ids.filter((id): id is string => typeof id === 'string' && id !== '');
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
