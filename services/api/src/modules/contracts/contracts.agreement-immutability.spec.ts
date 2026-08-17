import { BadRequestException } from '@nestjs/common';
import { ContractsService } from './contracts.service';

/*
 * REG-009 — a signed agreement could be edited, and re-pointed at another lead.
 *
 * ContractsService.update() carried its own inline copy of the "not editable any
 * more" status list, and that copy had drifted from assertAgreementEditable:
 * SENT, VIEWED, FULLY_EXECUTED, SUPERSEDED and TERMINATED were all missing. A
 * FULLY_EXECUTED agreement was therefore freely mutable through
 * PATCH /contracts/:id, including relatedLeadId and customerAccountId.
 *
 * That was not merely an integrity problem. The lead conversion gate
 * (LeadsService.assertGoverningAgreementExecuted → leadAgreementScope) decides
 * whether a lead may become a customer by looking for an executed contract whose
 * relatedLeadId is that lead. Re-pointing one executed agreement was enough to
 * convert a completely different company that had never signed anything — which
 * is what the E2E run did before the fix.
 *
 * These tests drive update() itself, not the guard it delegates to. The guard
 * was already correct before the fix; what was wrong was that update() did not
 * consult it. A test that only exercised assertAgreementEditable would pass
 * against the unfixed code and prove nothing.
 */

/*
 * Taken off the prototype through a structural cast, the same shape
 * `partner-lifecycle-guards.spec.ts` and `tenant-provisioning-retry.spec.ts`
 * use. Reading the method directly trips `@typescript-eslint/unbound-method` —
 * correctly, since update() does use `this` — and the cast states the intent
 * instead of suppressing the rule: the immutability check is being exercised
 * against a deliberately minimal `this`, which is the whole point of the test.
 */
const { update } = ContractsService.prototype as unknown as {
  update: (
    user: unknown,
    id: string,
    dto: Record<string, unknown>,
  ) => Promise<unknown>;
};

/**
 * Minimal `this` for update(): everything it touches before the immutability
 * check, plus a prisma spy so we can assert no write was attempted.
 */
const harnessFor = (status: string) => {
  const contractUpdate = jest.fn().mockResolvedValue({});
  const context = {
    assertWrite: jest.fn(),
    get: jest.fn().mockResolvedValue({
      id: 'contract-1',
      status,
      effectiveDate: null,
      expiryDate: null,
      effectiveFrom: null,
      effectiveUntil: null,
    }),
    validateContractDates: jest.fn(),
    assertAgreementEditable: (
      ContractsService.prototype as unknown as {
        assertAgreementEditable: (s: string) => void;
      }
    ).assertAgreementEditable,
    prisma: { contract: { update: contractUpdate } },
  };
  /*
   * update() carries on into placeholder syncing, audit and event work once the
   * immutability check passes. None of that is what these tests are about, so
   * any collaborator we have not named explicitly resolves to a no-op instead of
   * forcing this spec to mock the whole service.
   */
  const tolerant = new Proxy(context as Record<string, unknown>, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      return jest.fn().mockResolvedValue(undefined);
    },
  });
  return { context: tolerant, contractUpdate };
};

const attemptEdit = async (status: string, dto: Record<string, unknown>) => {
  const { context, contractUpdate } = harnessFor(status);
  let thrown: unknown = null;
  try {
    await update.call(
      context as never,
      { id: 'actor' } as never,
      'contract-1',
      dto as never,
    );
  } catch (error) {
    thrown = error;
  }
  return { thrown, contractUpdate };
};

describe('PATCH /contracts/:id immutability after signing begins', () => {
  /* The five statuses the old inline list in update() forgot. */
  const DRIFTED = [
    'SENT',
    'VIEWED',
    'FULLY_EXECUTED',
    'SUPERSEDED',
    'TERMINATED',
  ];

  it.each(DRIFTED)(
    'refuses to edit a %s agreement (regression: absent from the old inline list)',
    async (status) => {
      const { thrown, contractUpdate } = await attemptEdit(status, {
        title: 'renamed after execution',
      });
      expect(thrown).toBeInstanceOf(BadRequestException);
      expect(contractUpdate).not.toHaveBeenCalled();
    },
  );

  it('refuses to re-point an executed agreement at a different lead', async () => {
    /*
     * The exact payload that produced the bypass: one field, no status change,
     * accepted with 200 before the fix.
     */
    const { thrown, contractUpdate } = await attemptEdit('FULLY_EXECUTED', {
      relatedLeadId: 'some-other-lead',
    });
    expect(thrown).toBeInstanceOf(BadRequestException);
    expect(contractUpdate).not.toHaveBeenCalled();
  });

  it('refuses to move an executed agreement onto a different customer account', async () => {
    const { thrown, contractUpdate } = await attemptEdit('FULLY_EXECUTED', {
      customerAccountId: 'some-other-customer',
    });
    expect(thrown).toBeInstanceOf(BadRequestException);
    expect(contractUpdate).not.toHaveBeenCalled();
  });

  it.each([
    'SIGNATURE_IN_PROGRESS',
    'PARTIALLY_SIGNED',
    'FULLY_SIGNED',
    'ACTIVE',
    'ARCHIVED',
  ])('still refuses to edit a %s agreement', async (status) => {
    const { thrown } = await attemptEdit(status, { title: 'x' });
    expect(thrown).toBeInstanceOf(BadRequestException);
  });

  /*
   * The fix must not over-block: everything before dispatch is a working draft
   * and has to stay editable, or ordinary contract authoring breaks.
   */
  it.each([
    'DRAFT',
    'INTERNAL_REVIEW',
    'COMMERCIAL_APPROVAL',
    'LEGAL_APPROVAL',
    'COUNTERPARTY_REVIEW',
    'READY_FOR_SIGNATURE',
    'APPROVED_FOR_SENDING',
  ])('still allows editing a %s agreement', async (status) => {
    const { thrown, contractUpdate } = await attemptEdit(status, {
      title: 'renamed draft',
    });
    expect(thrown).toBeNull();
    expect(contractUpdate).toHaveBeenCalled();
  });
});
