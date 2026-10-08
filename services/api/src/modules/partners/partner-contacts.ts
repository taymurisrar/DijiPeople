import type { Prisma } from '@prisma/client';

/**
 * Which partner contacts can be removed (TASK-0037, browser pass).
 *
 * A contact is a `PartnerPortalUser`. One added from the record (WP-08) starts
 * NOT_INVITED with an unusable password; Activate partner can then invite it
 * (INVITED, with a one-time invitation token), and accepting the invitation
 * makes it ACTIVE with `activatedAt` set. Only after that can it sign in,
 * receive refresh tokens and leave an access history.
 *
 * A contact that never got that far is a name and an email, nothing more —
 * removing it, or deleting it with its partner, erases no access history. One
 * that did is a login, and its history is kept: it is suspended or
 * deactivated with the partner, never removed.
 *
 * This one definition is used by the Remove contact action, by the partner
 * delete's dependency check and by the console's row action, so the three
 * cannot disagree about which contacts qualify.
 */
export const REMOVABLE_CONTACT_STATUSES = ['NOT_INVITED', 'INVITED'] as const;

/**
 * The same rule as a Prisma filter. `refreshTokens: none` is belt and braces:
 * tokens are only issued at sign-in, which requires ACTIVE, and the relation is
 * `Restrict`, so a row carrying any could not be deleted anyway.
 */
export const NEVER_ACTIVATED_CONTACT_WHERE = {
  status: { in: [...REMOVABLE_CONTACT_STATUSES] },
  activatedAt: null,
  lastActiveAt: null,
  refreshTokens: { none: {} },
} satisfies Prisma.PartnerPortalUserWhereInput;

export type ContactAccessFields = {
  status?: string | null;
  activatedAt?: Date | string | null;
  lastActiveAt?: Date | string | null;
};

/** Whether this contact never activated portal access, and so can be removed. */
export function isContactRemovable(contact: ContactAccessFields): boolean {
  return (
    (REMOVABLE_CONTACT_STATUSES as readonly string[]).includes(
      contact.status ?? '',
    ) &&
    !contact.activatedAt &&
    !contact.lastActiveAt
  );
}
