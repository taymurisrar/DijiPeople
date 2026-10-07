import { PartnerStatus } from '@prisma/client';
import { PartnersService } from './partners.service';

/*
 * REG-015 — BUG-0025: a live partner could be demoted through the generic
 * partner update.
 *
 * `update()` guarded the way INTO ACTIVE and not the way out of it, so a
 * `PATCH /partners/:id` carrying `status: REJECTED` took a live partner —
 * signed agreement, working referral link — out of service with no from-set
 * check and no PartnerTimeline entry saying who did it or why. Meanwhile
 * `partnerTransition`, in the same file, already declared `reject` illegal from
 * ACTIVE and already owned suspend/deactivate/reactivate.
 *
 * This suite pins BOTH directions. Pinning only the new one would let a future
 * edit "simplify" the guard by dropping the original.
 *
 * ADR-0026 (EXECPLAN-0055 WP-04) widened both into one rule: update never
 * changes status at all. The DTO no longer declares the field; these cases
 * exercise the service guard that catches an internal caller still passing it.
 */
const refused = { errorCode: 'PARTNER_STATUS_ACTION_REQUIRED' };
describe('partner lifecycle guards on the generic update', () => {
  /*
   * Taken off the prototype through a structural cast, the same shape
   * `tenant-provisioning-retry.spec.ts` uses. Reading the method directly trips
   * `@typescript-eslint/unbound-method` — correctly, since the method does use
   * `this` — and the cast states the intent instead of suppressing the rule:
   * the guards are being exercised against a deliberately minimal `this`.
   */
  const { update } = PartnersService.prototype as unknown as {
    update: (
      id: string,
      dto: { status?: PartnerStatus; displayName?: string },
    ) => Promise<unknown>;
  };

  /**
   * `update()` reads the current partner through `this.get(id)` and then
   * validates. Both guards throw before any collaborator beyond `get` is
   * touched, so a context carrying only `get` is enough — and it makes the test
   * fail loudly if a future edit starts writing before checking.
   */
  const contextFor = (status: PartnerStatus) => ({
    get: jest
      .fn()
      .mockResolvedValue({ id: 'partner-1', status, currencyCode: 'USD' }),
    validateOwner: jest.fn().mockResolvedValue(undefined),
    prisma: {
      partner: { update: jest.fn().mockResolvedValue({}) },
    },
  });

  it('refuses to activate a partner through the generic update', async () => {
    const context = contextFor(PartnerStatus.QUALIFIED);
    await expect(
      update.call(context as never, 'partner-1', {
        status: PartnerStatus.ACTIVE,
      } as never),
    ).rejects.toMatchObject(refused);
    expect(context.prisma.partner.update).not.toHaveBeenCalled();
  });

  it.each([
    PartnerStatus.REJECTED,
    PartnerStatus.TERMINATED,
    PartnerStatus.SUSPENDED,
    PartnerStatus.INACTIVE,
  ])(
    'refuses to move a live partner to %s through the generic update',
    async (status) => {
      const context = contextFor(PartnerStatus.ACTIVE);
      await expect(
        update.call(context as never, 'partner-1', { status } as never),
      ).rejects.toMatchObject(refused);
      expect(context.prisma.partner.update).not.toHaveBeenCalled();
    },
  );

  it('names the governed actions so the refusal is actionable', async () => {
    const context = contextFor(PartnerStatus.ACTIVE);
    await expect(
      update.call(context as never, 'partner-1', {
        status: PartnerStatus.REJECTED,
      } as never),
    ).rejects.toThrow(/Suspend/);
  });

  it('still allows an ordinary edit that does not change status', async () => {
    /*
     * The guard must not break normal record editing. A version that refused
     * every update to a live partner would be reverted within a week, and the
     * governance would go with it.
     */
    const context = contextFor(PartnerStatus.ACTIVE);
    try {
      await update.call(context as never, 'partner-1', {
        displayName: 'Renamed',
      });
    } catch {
      /* The write collaborator is a stub; only the guard is under test. */
    }
    expect(context.validateOwner).toHaveBeenCalled();
  });

  it('refuses an early-stage status move too — no status is edited (ADR-0026)', async () => {
    /*
     * This case used to assert the opposite: DRAFT -> INQUIRY went through a
     * plain PATCH with no from-set check and no timeline entry. Every status
     * now moves through an action, so it is refused like any other.
     */
    const context = contextFor(PartnerStatus.DRAFT);
    await expect(
      update.call(context as never, 'partner-1', {
        status: PartnerStatus.INQUIRY,
      }),
    ).rejects.toMatchObject(refused);
    expect(context.validateOwner).not.toHaveBeenCalled();
    expect(context.prisma.partner.update).not.toHaveBeenCalled();
  });

  it('lets an unchanged status through without writing it', async () => {
    const context = contextFor(PartnerStatus.UNDER_REVIEW);
    try {
      await update.call(context as never, 'partner-1', {
        status: PartnerStatus.UNDER_REVIEW,
        displayName: 'Renamed',
      });
    } catch {
      /* The write collaborator is a stub; only the guard is under test. */
    }
    expect(context.validateOwner).toHaveBeenCalled();
  });
});
