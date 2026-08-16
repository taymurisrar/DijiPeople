import { Prisma } from '@prisma/client';
import { PlatformLifecycleService } from './platform-lifecycle.service';

/**
 * BUG-0022 — provisioning a tenant must be safe to submit twice.
 *
 * It produces a tenant, an owner invitation, a subscription and a first invoice,
 * and a duplicate is expensive to unwind. Three things stand between a repeated
 * request and a second tenant, and this pins the one that was missing:
 *
 *   1. the `onboarding.tenantId` pre-check — already present;
 *   2. `Tenant.slug @unique` — already present, and the real authority;
 *   3. translating the resulting P2002 into the original result — added here.
 *
 * Without (3) the loser of a genuine race saw a raw unique-constraint error on
 * the most expensive create in the product, with no way to tell a duplicated
 * click from broken provisioning.
 *
 * The negative case matters as much as the positive one: a P2002 raised because
 * a slug is genuinely held by an unrelated tenant must still fail, or the
 * operator is told a workspace exists when it does not.
 */
describe('tenant provisioning idempotency', () => {
  function uniqueViolation() {
    return new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: '7.8.0',
        meta: { target: ['slug'] },
      },
    );
  }

  /**
   * Reaches the private helper deliberately. The alternative is standing up the
   * whole `createTenantFromOnboarding` path — customer, plan, agreements,
   * slug reservation, identities — to observe one catch block, and a test that
   * elaborate would break for reasons unrelated to what it asserts.
   */
  function callHelper(service: PlatformLifecycleService) {
    return (
      service as unknown as {
        createTenantRowIdempotently(input: {
          onboardingId: string;
          customerId: string;
          data: unknown;
        }): Promise<unknown>;
      }
    ).createTenantRowIdempotently({
      onboardingId: 'onboarding-1',
      customerId: 'customer-1',
      data: { slug: 'acme' },
    });
  }

  function buildService(prisma: unknown) {
    return new PlatformLifecycleService(
      prisma as never,
      ...Array.from({ length: 12 }, () => ({}) as never),
    );
  }

  it('returns the winner’s tenant when a concurrent request already linked one', async () => {
    const prisma = {
      tenant: { create: jest.fn().mockRejectedValue(uniqueViolation()) },
      customerOnboarding: {
        findUnique: jest.fn().mockResolvedValue({ tenantId: 'tenant-winner' }),
      },
    };

    const result = (await callHelper(buildService(prisma))) as {
      alreadyExists?: { tenantId: string; alreadyExists: boolean };
    };

    expect(result.alreadyExists).toEqual({
      tenantId: 'tenant-winner',
      customerId: 'customer-1',
      onboardingId: 'onboarding-1',
      alreadyExists: true,
    });
  });

  it('rethrows when the slug belongs to an unrelated tenant', async () => {
    // No tenant was linked, so the conflict is not a duplicated submit.
    // Reporting success here would tell an operator a workspace exists.
    const prisma = {
      tenant: { create: jest.fn().mockRejectedValue(uniqueViolation()) },
      customerOnboarding: {
        findUnique: jest.fn().mockResolvedValue({ tenantId: null }),
      },
    };

    await expect(callHelper(buildService(prisma))).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('rethrows an error that is not a unique violation', async () => {
    const prisma = {
      tenant: { create: jest.fn().mockRejectedValue(new Error('db down')) },
      customerOnboarding: { findUnique: jest.fn() },
    };

    await expect(callHelper(buildService(prisma))).rejects.toThrow('db down');
    // The onboarding must not even be consulted: a transport failure says
    // nothing about whether a tenant exists, and treating it as a race would
    // return success for a request that never reached the database.
    expect(prisma.customerOnboarding.findUnique).not.toHaveBeenCalled();
  });

  it('returns the created tenant unchanged when there is no conflict', async () => {
    const created = { id: 'tenant-1', slug: 'acme' };
    const prisma = {
      tenant: { create: jest.fn().mockResolvedValue(created) },
      customerOnboarding: { findUnique: jest.fn() },
    };

    const result = await callHelper(buildService(prisma));

    expect(result).toBe(created);
    // The happy path must not pay for the race handling.
    expect(prisma.customerOnboarding.findUnique).not.toHaveBeenCalled();
  });
});
