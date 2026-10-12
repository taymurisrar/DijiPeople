import type { PrismaClient } from '@prisma/client';
import {
  LEGACY_PLACEHOLDER_FIRST_NAME,
  LEGACY_PLACEHOLDER_LAST_NAME,
  storedPersonName,
} from '../../common/utils/person-name';

/**
 * Remove the placeholder names provisioning used to invent (BUG-4111).
 *
 * Until 2026-10-12 a workspace owner with no last name was stored as
 * "<first> Owner", and one with no first name as "Workspace …". This finds
 * those users and clears the placeholder — and only those. "Owner" is a real
 * surname, so a user is repaired only when it is the owner of a tenant or a
 * customer AND every record the name could have come from (the customer's
 * primary contact, the onboarding cycle that provisioned the tenant) has that
 * name part empty. A user whose source now holds a name, or who has no source
 * at all, is reported and left alone.
 *
 * Idempotent: a repaired user no longer matches.
 */

export type OwnerNameDecision = {
  userId: string;
  tenantId: string;
  email: string;
  before: { firstName: string; lastName: string };
  after: { firstName: string; lastName: string } | null;
  reason: string;
};

type Source = { firstName: string | null; lastName: string | null };

/** Pure: whether a stored name part is a placeholder given its sources. */
export function decideOwnerName(
  user: { firstName: string; lastName: string; email: string },
  sources: Source[],
): { after: { firstName: string; lastName: string } | null; reason: string } {
  const lastIsPlaceholder = user.lastName === LEGACY_PLACEHOLDER_LAST_NAME;
  const firstIsPlaceholder = user.firstName === LEGACY_PLACEHOLDER_FIRST_NAME;
  if (!lastIsPlaceholder && !firstIsPlaceholder)
    return { after: null, reason: 'no placeholder' };
  if (!sources.length)
    return { after: null, reason: 'no source record to prove a placeholder' };
  const empty = (value: string | null) => !value?.trim();
  const clearLast =
    lastIsPlaceholder && sources.every((s) => empty(s.lastName));
  const clearFirst =
    firstIsPlaceholder && sources.every((s) => empty(s.firstName));
  if (!clearLast && !clearFirst)
    return { after: null, reason: 'a source record holds this name' };
  const repaired = storedPersonName({
    firstName: clearFirst ? null : user.firstName,
    lastName: clearLast ? null : user.lastName,
    email: user.email,
  });
  return { after: repaired, reason: 'placeholder with an empty source' };
}

export async function planOwnerNameRepair(
  prisma: PrismaClient,
): Promise<OwnerNameDecision[]> {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { lastName: LEGACY_PLACEHOLDER_LAST_NAME },
        { firstName: LEGACY_PLACEHOLDER_FIRST_NAME },
      ],
      AND: [
        {
          OR: [
            { ownedTenants: { some: {} } },
            { ownedCustomerAccounts: { some: {} } },
          ],
        },
      ],
    },
    select: {
      id: true,
      tenantId: true,
      email: true,
      firstName: true,
      lastName: true,
      ownedCustomerAccounts: {
        select: { primaryContactFirstName: true, primaryContactLastName: true },
      },
      ownedTenants: {
        select: {
          customerAccount: {
            select: {
              primaryContactFirstName: true,
              primaryContactLastName: true,
            },
          },
          customerOnboardings: {
            select: { primaryOwnerFirstName: true, primaryOwnerLastName: true },
          },
        },
      },
    },
  });

  return users.map((user) => {
    const sources: Source[] = [
      ...user.ownedCustomerAccounts.map((c) => ({
        firstName: c.primaryContactFirstName,
        lastName: c.primaryContactLastName,
      })),
      ...user.ownedTenants.flatMap((t) => [
        ...(t.customerAccount
          ? [
              {
                firstName: t.customerAccount.primaryContactFirstName,
                lastName: t.customerAccount.primaryContactLastName,
              },
            ]
          : []),
        ...t.customerOnboardings.map((o) => ({
          firstName: o.primaryOwnerFirstName,
          lastName: o.primaryOwnerLastName,
        })),
      ]),
    ];
    const decision = decideOwnerName(user, sources);
    return {
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      before: { firstName: user.firstName, lastName: user.lastName },
      ...decision,
    };
  });
}

/** Apply the planned repairs, one audited transaction per user. */
export async function applyOwnerNameRepair(
  prisma: PrismaClient,
  decisions: OwnerNameDecision[],
) {
  let repaired = 0;
  for (const decision of decisions) {
    if (!decision.after) continue;
    const after = decision.after;
    await prisma.$transaction(async (tx) => {
      // Re-check inside the write: an operator may have fixed it meanwhile.
      const current = await tx.user.updateMany({
        where: {
          id: decision.userId,
          firstName: decision.before.firstName,
          lastName: decision.before.lastName,
        },
        data: after,
      });
      if (!current.count) return;
      repaired += 1;
      await tx.auditLog.create({
        data: {
          tenantId: decision.tenantId,
          actorUserId: null,
          action: 'USER_PLACEHOLDER_NAME_REPAIRED',
          entityType: 'User',
          entityId: decision.userId,
          sourceModule: 'repair-owner-names',
          beforeSnapshot: decision.before,
          afterSnapshot: after,
        },
      });
    });
  }
  return repaired;
}
