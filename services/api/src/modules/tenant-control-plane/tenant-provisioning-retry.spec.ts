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
    tenantProvisioning: { provisionSystemDomain: jest.fn().mockResolvedValue({}) },
    permissions: { bootstrapTenantDefaults: jest.fn().mockResolvedValue({}) },
    customization: { publishTenantDefaults: jest.fn().mockResolvedValue({}) },
    tenantDomains: {
      getPrimaryDomain: jest.fn().mockResolvedValue({ domain: 'acme.example.test' }),
      resolveHostname: jest.fn().mockResolvedValue({ tenantId: 'tenant-1' }),
    },
  };

  const retryableKeys = TENANT_PROVISIONING_STEPS.filter(
    (step) => step.isRetryable,
  ).map((step) => step.key);

  it('declares at least one retryable step', () => {
    expect(retryableKeys.length).toBeGreaterThan(0);
  });

  it.each(retryableKeys)(
    'can replay the retryable step %s',
    async (key) => {
      await expect(
        runRetryableStep.call(context as never, key, 'tenant-1', 'acme', 'actor-1'),
      ).resolves.toBeUndefined();
    },
  );

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
        getPrimaryDomain: jest.fn().mockResolvedValue({ domain: 'acme.example.test' }),
        resolveHostname: jest.fn().mockResolvedValue({ tenantId: 'someone-else' }),
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
