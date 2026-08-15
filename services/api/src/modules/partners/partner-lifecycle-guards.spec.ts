import { BadRequestException } from '@nestjs/common';
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
 */
describe('partner lifecycle guards on the generic update', () => {
  const update = PartnersService.prototype.update;

  /**
   * `update()` reads the current partner through `this.get(id)` and then
   * validates. Both guards throw before any collaborator beyond `get` is
   * touched, so a context carrying only `get` is enough — and it makes the test
   * fail loudly if a future edit starts writing before checking.
   */
  const contextFor = (status: PartnerStatus) => ({
    get: jest.fn().mockResolvedValue({ id: 'partner-1', status, currencyCode: 'USD' }),
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
    ).rejects.toThrow(BadRequestException);
    expect(context.prisma.partner.update).not.toHaveBeenCalled();
  });

  it.each([
    PartnerStatus.REJECTED,
    PartnerStatus.TERMINATED,
    PartnerStatus.SUSPENDED,
    PartnerStatus.INACTIVE,
  ])('refuses to move a live partner to %s through the generic update', async (status) => {
    const context = contextFor(PartnerStatus.ACTIVE);
    await expect(
      update.call(context as never, 'partner-1', { status } as never),
    ).rejects.toThrow(BadRequestException);
    expect(context.prisma.partner.update).not.toHaveBeenCalled();
  });

  it('names the governed actions so the refusal is actionable', async () => {
    const context = contextFor(PartnerStatus.ACTIVE);
    await expect(
      update.call(context as never, 'partner-1', {
        status: PartnerStatus.REJECTED,
      } as never),
    ).rejects.toThrow(/suspend/i);
  });

  it('still allows an ordinary edit that does not change status', async () => {
    /*
     * The guard must not break normal record editing. A version that refused
     * every update to a live partner would be reverted within a week, and the
     * governance would go with it.
     */
    const context = contextFor(PartnerStatus.ACTIVE);
    await update
      .call(context as never, 'partner-1', { displayName: 'Renamed' } as never)
      .catch(() => undefined);
    expect(context.validateOwner).toHaveBeenCalled();
  });

  it('still allows an early-stage status move that no governed action owns', async () => {
    /*
     * DRAFT -> INQUIRY has no entry in `partnerTransition`. Routing every
     * transition through that table would refuse legitimate edits in the name
     * of governance, which is why the guard is scoped to leaving ACTIVE.
     */
    const context = contextFor(PartnerStatus.DRAFT);
    await update
      .call(context as never, 'partner-1', {
        status: PartnerStatus.INQUIRY,
      } as never)
      .catch(() => undefined);
    expect(context.validateOwner).toHaveBeenCalled();
  });
});
