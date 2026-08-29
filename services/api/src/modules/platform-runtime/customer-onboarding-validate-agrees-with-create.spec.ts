import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { PlatformRuntimeService } from './platform-runtime.service';

/**
 * BUG-1548 — `POST /platform-runtime/customer-onboarding/validate` approved
 * payloads that `POST /platform-runtime/customer-onboarding` then refused with
 * a 400 or a 409.
 *
 * The two endpoints already ran the same DTO — `CreateCustomerOnboardingRecordDto`,
 * on both the `create` and `validate` branches — so the divergence was never in
 * the schema. It was everything past it: `createCustomerOnboarding` goes on to
 * check the sub-status, the customer's existence and ownership, whether an
 * onboarding is already active for that customer, the customer's onboarding
 * prerequisites, the service-account pairing, and whether the planned tenant
 * slug is valid and free. Validate ran none of them and answered success.
 *
 * Those checks now live in one method, `assertCustomerOnboardingCreatable`,
 * which writes nothing and which both endpoints call. These tests drive the
 * real `validate` and assert it reports the refusals create would produce,
 * with create's own wording.
 */

type Refusal = Error | null;

function buildService(refusal: Refusal) {
  const assertCustomerOnboardingCreatable = jest
    .fn()
    .mockImplementation(() =>
      refusal ? Promise.reject(refusal) : Promise.resolve(undefined),
    );

  const service = Object.create(
    PlatformRuntimeService.prototype,
  ) as PlatformRuntimeService & { superAdmin: unknown };
  (
    service as unknown as { assertPlatform: (user: unknown) => void }
  ).assertPlatform = () => undefined;
  service.superAdmin = { assertCustomerOnboardingCreatable };

  return { service, assertCustomerOnboardingCreatable };
}

/** A payload that passes the DTO, so only the business rules can refuse it. */
const VALID_VALUES = {
  customerId: '11111111-1111-4111-8111-111111111111',
  plannedTenantSlug: 'acme-industries',
  primaryOwnerFirstName: 'Ada',
  primaryOwnerLastName: 'Lovelace',
  primaryOwnerWorkEmail: 'ada@acme-industries.example',
};

function validate(service: PlatformRuntimeService, values = VALID_VALUES) {
  return service.validate(
    { platform: { id: 'pu-1' } } as never,
    'customer-onboarding',
    {
      values,
      mode: 'create',
    },
  );
}

describe('customer-onboarding validate answers for the save, not only the schema', () => {
  it('runs the create rule set at all', async () => {
    const { service, assertCustomerOnboardingCreatable } = buildService(null);

    await expect(validate(service)).resolves.toEqual({ success: true });
    expect(assertCustomerOnboardingCreatable).toHaveBeenCalledTimes(1);
  });

  it("reports the 409 create would answer, in create's own words", async () => {
    // The overlap with the foreign-key case recorded as BUG-1545.
    const { service } = buildService(
      new ConflictException(
        'Customer already has an active onboarding record.',
      ),
    );

    await expect(validate(service)).resolves.toEqual({
      success: false,
      message: 'Customer already has an active onboarding record.',
      errors: [],
    });
  });

  it('reports the unmet-prerequisites 400 rather than approving it', async () => {
    const { service } = buildService(
      new BadRequestException(
        'Onboarding prerequisites are not complete: Contact email, Country.',
      ),
    );

    const result = (await validate(service)) as {
      success: boolean;
      message: string;
    };

    expect(result.success).toBe(false);
    expect(result.message).toBe(
      'Onboarding prerequisites are not complete: Contact email, Country.',
    );
  });

  it('reports a tenant slug that is already taken', async () => {
    const { service } = buildService(
      new ConflictException('Tenant slug is already in use.'),
    );

    await expect(validate(service)).resolves.toMatchObject({
      success: false,
      message: 'Tenant slug is already in use.',
    });
  });

  it('still fails on the DTO before reaching the business rules', async () => {
    // A schema failure must not be reached through the business rules, or a
    // malformed payload would be reported as a business refusal.
    const { service, assertCustomerOnboardingCreatable } = buildService(null);

    const result = (await validate(service, {
      ...VALID_VALUES,
      customerId: 'not-a-uuid',
    })) as { success: boolean };

    expect(result.success).toBe(false);
    expect(assertCustomerOnboardingCreatable).not.toHaveBeenCalled();
  });

  it('leaves update-mode validation alone', async () => {
    // The create rule set is about creating. An edit has its own, and running
    // "an onboarding already exists for this customer" against a record that
    // *is* that onboarding would refuse every edit.
    const { service, assertCustomerOnboardingCreatable } = buildService(null);

    await service.validate(
      { platform: { id: 'pu-1' } } as never,
      'customer-onboarding',
      {
        values: { notes: 'A note.' },
        mode: 'update',
      },
    );

    expect(assertCustomerOnboardingCreatable).not.toHaveBeenCalled();
  });
});

describe('one rule set, not two', () => {
  it('create and validate reach the same assertion', () => {
    /*
     * The failure mode this record describes is two code paths drifting. The
     * guard against it is that there is one: `createOnboardingFromCustomer`
     * asserts and then writes, and nothing else re-implements the checks.
     */
    const lifecycle = readFileSync(
      join(__dirname, '../super-admin/platform-lifecycle.service.ts'),
      'utf8',
    ).replace(/\r\n/g, '\n');

    expect(lifecycle).toContain('async assertOnboardingCreatable(');
    expect(lifecycle).toContain('async assertCustomerOnboardingCreatable(');
    // The create path resolves what it needs from the assertion rather than
    // repeating the lookups.
    expect(lifecycle).toContain(
      'const { customer, plannedTenantSlug } =\n      await this.assertOnboardingCreatable(actor, customerId, dto);',
    );
    // And each refusal is written once.
    expect(
      lifecycle.split('Customer already has an active onboarding record.')
        .length - 1,
    ).toBe(1);
    expect(lifecycle.split('Tenant slug is already in use.').length - 1).toBe(
      1,
    );
  });
});
