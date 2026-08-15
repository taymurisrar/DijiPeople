import { TENANT_PROVISIONING_STEPS } from './tenant-control-plane.constants';
import { TenantOperationsService } from './tenant-operations.service';

/*
 * REG-012 — no tenant that failed provisioning could be retried.
 *
 * TENANT_PROVISIONING_STEPS gained two steps, workspace-slug-reserved and
 * workspace-routing-verified, both declared isRetryable: true. runRetryableStep
 * was never given a branch for either, so it fell through to
 * `Step ${key} cannot be replayed automatically.`
 *
 * retryProvisioning replays the retryable steps in catalogue order, and
 * workspace-slug-reserved is the first of them. Every retry therefore died on
 * its first step, marked the run FAILED and left the tenant in
 * PROVISIONING_FAILED — permanently, because retry is the only recovery path.
 * The admin UI kept offering the button. The E2E run reproduced exactly this:
 * a tenant that failed at workspace-domain could not be recovered at all.
 *
 * The real defect is that a step's retryability is declared in one file and
 * implemented in another, with nothing tying them together. This test is that
 * tie: every step the catalogue calls retryable must have a branch here.
 */
describe('tenant provisioning retry step coverage', () => {
  const runRetryableStep = (
    TenantOperationsService.prototype as unknown as {
      runRetryableStep: (
        key: string,
        tenantId: string,
        slug: string,
        actorUserId: string,
        recovery?: {
          createdIdentities: Array<{
            userId: string;
            email: string;
            fullName: string;
          }>;
        },
      ) => Promise<void>;
    }
  ).runRetryableStep;

  /*
   * Collaborators return the shape each branch needs to reach its `return`.
   * The assertion is only ever "this key is handled", never what the handler did.
   */
  const context = {
    prisma: {
      tenant: { findUnique: jest.fn().mockResolvedValue({ slug: 'acme' }) },
    },
    tenantProvisioning: {
      provisionSystemDomain: jest.fn().mockResolvedValue({}),
    },
    permissions: { bootstrapTenantDefaults: jest.fn().mockResolvedValue({}) },
    customization: { publishTenantDefaults: jest.fn().mockResolvedValue({}) },
    tenantDomains: {
      getPrimaryDomain: jest
        .fn()
        .mockResolvedValue({ domain: 'acme.example.test' }),
      resolveHostname: jest.fn().mockResolvedValue({ tenantId: 'tenant-1' }),
    },
    identitiesProvisioning: {
      findOnboardingForTenant: jest.fn().mockResolvedValue({
        id: 'onboarding-1',
        selectedPlanId: 'plan-1',
        billingCycle: 'MONTHLY',
        createServiceAccount: false,
        serviceAccountEmail: null,
        serviceAccountDisplayName: null,
        serviceAccountAssignSystemAdmin: true,
        customer: {
          selectedPlanId: 'plan-1',
          preferredBillingCycle: 'MONTHLY',
        },
      }),
      ensureIdentitiesAndBilling: jest
        .fn()
        .mockResolvedValue({ identities: [], createdIdentities: [] }),
    },
    userInvitations: { issueInvitation: jest.fn().mockResolvedValue({}) },
  };

  const retryableKeys = TENANT_PROVISIONING_STEPS.filter(
    (step) => step.isRetryable,
  ).map((step) => step.key);

  it('declares at least one retryable step', () => {
    expect(retryableKeys.length).toBeGreaterThan(0);
  });

  it.each(retryableKeys)('can replay the retryable step %s', async (key) => {
    await expect(
      runRetryableStep.call(
        context as never,
        key,
        'tenant-1',
        'acme',
        'actor-1',
      ),
    ).resolves.toBeUndefined();
  });

  /*
   * REG — BUG-0015. `identities-and-billing` was isRetryable: false, and it is
   * the only step that creates the business unit, the owner and the
   * subscription. A tenant that failed at or before it therefore had no owner,
   * `POST /access` refused to add one to a tenant with no business unit, and
   * activation was blocked for ever — while retry reported SUCCEEDED.
   */
  it('declares identities-and-billing retryable', () => {
    expect(retryableKeys).toContain('identities-and-billing');
  });

  it('replays identities-and-billing through the re-entrant service', async () => {
    const created = [
      { userId: 'user-1', email: 'ada@acme.test', fullName: 'Ada Lovelace' },
    ];
    const recovering = {
      ...context,
      identitiesProvisioning: {
        ...context.identitiesProvisioning,
        ensureIdentitiesAndBilling: jest
          .fn()
          .mockResolvedValue({ identities: created, createdIdentities: created }),
      },
    };
    const recovery = { createdIdentities: [] as typeof created };

    await runRetryableStep.call(
      recovering as never,
      'identities-and-billing',
      'tenant-1',
      'acme',
      'actor-1',
      recovery as never,
    );

    expect(
      recovering.identitiesProvisioning.ensureIdentitiesAndBilling,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', planId: 'plan-1' }),
    );
    /* Handed to the invitations step, which is the only reason it is collected. */
    expect(recovery.createdIdentities).toEqual(created);
  });

  it('refuses to replay identities-and-billing with no onboarding record', () => {
    /*
     * Without the onboarding record there is no owner name, no plan and no
     * billing cycle — nothing to reconstruct the tenant from. Failing loudly
     * beats writing a tenant owner nobody chose.
     */
    const orphaned = {
      ...context,
      identitiesProvisioning: {
        ...context.identitiesProvisioning,
        findOnboardingForTenant: jest.fn().mockResolvedValue(null),
      },
    };
    return expect(
      runRetryableStep.call(
        orphaned as never,
        'identities-and-billing',
        'tenant-1',
        'acme',
        'actor-1',
      ),
    ).rejects.toThrow('No onboarding record');
  });

  it('invites only the identities this recovery created', async () => {
    const created = [
      { userId: 'user-1', email: 'ada@acme.test', fullName: 'Ada Lovelace' },
    ];
    const inviting = {
      ...context,
      userInvitations: { issueInvitation: jest.fn().mockResolvedValue({}) },
    };

    await runRetryableStep.call(
      inviting as never,
      'invitations',
      'tenant-1',
      'acme',
      'actor-1',
      { createdIdentities: created } as never,
    );

    expect(inviting.userInvitations.issueInvitation).toHaveBeenCalledTimes(1);
    expect(inviting.userInvitations.issueInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'ada@acme.test', tenantId: 'tenant-1' }),
    );
  });

  it('mails nobody when a retry created no identity', async () => {
    /*
     * The reason this step used to do nothing at all. Replaying invitations
     * wholesale would re-mail every provisioned account on every retry.
     */
    const inviting = {
      ...context,
      userInvitations: { issueInvitation: jest.fn().mockResolvedValue({}) },
    };

    await runRetryableStep.call(
      inviting as never,
      'invitations',
      'tenant-1',
      'acme',
      'actor-1',
      { createdIdentities: [] } as never,
    );

    expect(inviting.userInvitations.issueInvitation).not.toHaveBeenCalled();
  });

  it('names the two steps whose absence broke every retry', () => {
    /*
     * Pinned explicitly so that removing them from the catalogue — rather than
     * implementing them — cannot make this suite green by omission.
     */
    expect(retryableKeys).toEqual(
      expect.arrayContaining([
        'workspace-slug-reserved',
        'workspace-routing-verified',
      ]),
    );
  });

  it('still refuses a step that is not part of the catalogue', () => {
    return expect(
      runRetryableStep.call(
        context as never,
        'not-a-real-step',
        'tenant-1',
        'acme',
        'actor-1',
      ),
    ).rejects.toThrow('cannot be replayed automatically');
  });

  it('fails the routing check when the hostname resolves to another tenant', () => {
    const hijacked = {
      ...context,
      tenantDomains: {
        getPrimaryDomain: jest
          .fn()
          .mockResolvedValue({ domain: 'acme.example.test' }),
        resolveHostname: jest
          .fn()
          .mockResolvedValue({ tenantId: 'someone-else' }),
      },
    };
    return expect(
      runRetryableStep.call(
        hijacked as never,
        'workspace-routing-verified',
        'tenant-1',
        'acme',
        'actor-1',
      ),
    ).rejects.toThrow('does not resolve back to this tenant');
  });
});
