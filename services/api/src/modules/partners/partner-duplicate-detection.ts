import { ConflictException } from '@nestjs/common';
import { PartnerType, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * One duplicate check, used by every partner-creating path.
 *
 * BUG-3550. Before this, the internal admin path (`POST /partners`) had no
 * duplicate detection at all, and the public inquiry path checked only
 * email/company-name — never `taxId`, and never a registration number (which
 * is not even a `Partner` column; it only ever existed inside an onboarding
 * submission's JSON payload). An operator could create any number of `Partner`
 * rows for the same email, company or tax id through the console, with no
 * warning.
 *
 * Precedence, and why: `email` and `taxId` are strong identifiers — a match on
 * either is the same legal party by definition, once normalised — so both are
 * a hard block. `companyName` is weaker (two unrelated organisations can share
 * a name) but this codebase already treats a company-name collision as
 * blocking once a prior application is past pure inquiry stage
 * (`PartnerExperienceService.submitInquiry`, `partner-experience.service.ts`),
 * so this function keeps that precedent rather than inventing a softer,
 * warning-only tier nothing in either frontend renders today.
 */

export type PartnerDuplicateMatch = {
  id: string;
  displayName: string;
  code: string;
  status: string;
  matchedOn: 'email' | 'taxId' | 'companyName';
};

export type PartnerDuplicateCandidate = {
  email?: string | null;
  taxId?: string | null;
  companyName?: string | null;
  type?: PartnerType;
};

/** Trim, uppercase, strip spaces and dashes — the normal form for an identifier a person might type with different punctuation. */
export function normalizeIdentifier(value?: string | null): string | undefined {
  const normalized = value
    ?.trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '');
  return normalized || undefined;
}

function normalizeEmail(value?: string | null): string | undefined {
  return value?.trim().toLowerCase() || undefined;
}

function normalizeCompanyName(value?: string | null): string | undefined {
  return value?.trim() || undefined;
}

/**
 * Find an existing `Partner` matching the given identifiers, or `null`.
 *
 * `excludePartnerId` lets a caller re-check a partner being updated against
 * every *other* partner without ever matching itself.
 */
const SELECT = {
  id: true,
  displayName: true,
  code: true,
  status: true,
  email: true,
  taxId: true,
  companyName: true,
} satisfies Prisma.PartnerSelect;

function toMatch(
  row: {
    id: string;
    displayName: string;
    code: string;
    status: string;
  },
  matchedOn: PartnerDuplicateMatch['matchedOn'],
): PartnerDuplicateMatch {
  return {
    id: row.id,
    displayName: row.displayName,
    code: row.code,
    status: row.status,
    matchedOn,
  };
}

export async function findPartnerDuplicate(
  prisma: PrismaService,
  candidate: PartnerDuplicateCandidate,
  excludePartnerId?: string,
): Promise<PartnerDuplicateMatch | null> {
  const email = normalizeEmail(candidate.email);
  const taxId = normalizeIdentifier(candidate.taxId);
  // Company-name collision only means anything for a COMPANY: an individual's
  // `companyName` is unset, and matching two individuals on an absent field
  // would match every individual partner against every other one.
  const companyName =
    candidate.type === PartnerType.COMPANY
      ? normalizeCompanyName(candidate.companyName)
      : undefined;

  const exclude = excludePartnerId ? { id: { not: excludePartnerId } } : {};

  // Precedence: email, then tax id, then company name. Each is checked with
  // the query the database can actually answer exactly — `equals` with
  // case-insensitive mode for email/company name — rather than folded into one
  // OR clause that would then need identical post-filtering anyway.
  if (email) {
    const row = await prisma.partner.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, ...exclude },
      select: SELECT,
    });
    if (row) return toMatch(row, 'email');
  }

  if (taxId) {
    /*
     * `taxId` is normalised (trimmed, uppercased, spaces/dashes stripped)
     * before comparison, which Postgres cannot express as a single `equals`
     * against however the value was originally typed. Every partner that has
     * *any* tax id is fetched and compared in memory instead.
     *
     * Bounded at 1000: this is the platform's own partner directory, not a
     * public high-cardinality table — a real deployment carrying more partners
     * than that is a scale this function should be revisited for, not one it
     * silently mishandles today.
     */
    const rows = await prisma.partner.findMany({
      where: { taxId: { not: null }, ...exclude },
      select: SELECT,
      take: 1000,
    });
    const row = rows.find((item) => normalizeIdentifier(item.taxId) === taxId);
    if (row) return toMatch(row, 'taxId');
  }

  if (companyName) {
    const row = await prisma.partner.findFirst({
      where: {
        companyName: { equals: companyName, mode: 'insensitive' },
        ...exclude,
      },
      select: SELECT,
    });
    if (row) return toMatch(row, 'companyName');
  }

  return null;
}

const MATCH_FIELD_LABEL: Record<PartnerDuplicateMatch['matchedOn'], string> = {
  email: 'email address',
  taxId: 'tax ID',
  companyName: 'company name',
};

/** Throws a 409 naming the existing partner, so the operator can open it — never a silent refusal. */
export function assertNoPartnerDuplicate(match: PartnerDuplicateMatch | null) {
  if (!match) return;
  throw new ConflictException(
    `A partner already exists with this ${MATCH_FIELD_LABEL[match.matchedOn]}: ` +
      `${match.displayName} (${match.code}), status ${match.status}.`,
  );
}

/**
 * BUG-3550 (registration/national-id number). Neither `Partner` nor
 * `PartnerInquiry` has a `registrationNumber` column — it exists only inside
 * `PartnerOnboardingSubmission.data`, the one point at which it is actually
 * collected. This scans the most recent submission per *other* partner for a
 * matching normalised registration/national-id number or tax id, so a second
 * applicant cannot submit onboarding under an identifier another partner
 * already holds.
 *
 * Bounded to the most recent 500 submissions: this is an operator-facing,
 * low-volume onboarding flow (not a public high-QPS path), so a bounded scan
 * trades a small, known limit for not needing a dedicated column — the
 * schema is owned by WP-01 and out of this work package's reach.
 */
export async function findOnboardingIdentifierDuplicate(
  prisma: PrismaService,
  identifiers: { registrationNumber?: unknown; taxId?: unknown },
  excludePartnerId: string,
): Promise<{
  partnerId: string;
  field: 'registrationNumber' | 'taxId';
} | null> {
  const registrationNumber = normalizeIdentifier(
    typeof identifiers.registrationNumber === 'string'
      ? identifiers.registrationNumber
      : undefined,
  );
  const taxId = normalizeIdentifier(
    typeof identifiers.taxId === 'string' ? identifiers.taxId : undefined,
  );
  if (!registrationNumber && !taxId) return null;

  const submissions = await prisma.partnerOnboardingSubmission.findMany({
    where: { application: { partnerId: { not: excludePartnerId } } },
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: { data: true, application: { select: { partnerId: true } } },
  });

  const seenPartners = new Set<string>();
  for (const submission of submissions) {
    const partnerId = submission.application.partnerId;
    // Only the most recent submission per partner reflects what they currently
    // hold — an earlier draft's value is superseded, not a live duplicate.
    if (seenPartners.has(partnerId)) continue;
    seenPartners.add(partnerId);

    const data =
      submission.data && typeof submission.data === 'object'
        ? (submission.data as Record<string, unknown>)
        : {};
    const candidateRegistration = normalizeIdentifier(
      typeof data.registrationNumber === 'string'
        ? data.registrationNumber
        : typeof data.nationalIdNumber === 'string'
          ? data.nationalIdNumber
          : undefined,
    );
    if (registrationNumber && candidateRegistration === registrationNumber)
      return { partnerId, field: 'registrationNumber' };

    const taxInformation =
      data.taxInformation && typeof data.taxInformation === 'object'
        ? (data.taxInformation as Record<string, unknown>)
        : {};
    const candidateTaxId = normalizeIdentifier(
      typeof taxInformation.taxId === 'string'
        ? taxInformation.taxId
        : undefined,
    );
    if (taxId && candidateTaxId === taxId) return { partnerId, field: 'taxId' };
  }
  return null;
}
