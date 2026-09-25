import { ConflictException } from '@nestjs/common';
import { PartnerType } from '@prisma/client';
import {
  assertNoPartnerDuplicate,
  findOnboardingIdentifierDuplicate,
  findPartnerDuplicate,
  normalizeIdentifier,
} from './partner-duplicate-detection';

/*
 * BUG-3550. `POST /partners` (admin create) had no duplicate detection at
 * all, and the public inquiry path checked only email/company-name — never
 * `taxId`, and never a registration/national-id number (which lives only in
 * an onboarding submission's JSON payload, not a column). These specs pin
 * each identifier this function now catches, the normalisation that makes a
 * differently-punctuated tax id still match, and the per-path wiring.
 */

const EXISTING = {
  id: 'partner-1',
  displayName: 'Contoso Ltd',
  code: 'PTR-1',
  status: 'ACTIVE',
  email: 'ops@contoso.test',
  taxId: 'TAX-123-456',
  companyName: 'Contoso Ltd',
};

function prismaWith(rows: Array<Record<string, unknown>>) {
  return {
    partner: {
      findFirst: jest.fn(
        async ({ where }: { where: Record<string, unknown> }) => {
          if ('email' in where) {
            const email = (where.email as { equals: string }).equals;
            return (
              rows.find(
                (row) =>
                  (row.email as string)?.toLowerCase() === email.toLowerCase(),
              ) ?? null
            );
          }
          if ('companyName' in where) {
            const name = (where.companyName as { equals: string }).equals;
            return (
              rows.find(
                (row) =>
                  (row.companyName as string)?.toLowerCase() ===
                  name.toLowerCase(),
              ) ?? null
            );
          }
          return null;
        },
      ),
      findMany: jest.fn(async () => rows.filter((row) => row.taxId)),
    },
  } as never;
}

describe('normalizeIdentifier', () => {
  it('trims, uppercases and strips spaces/dashes', () => {
    expect(normalizeIdentifier(' tax-123 456 ')).toBe('TAX123456');
    expect(normalizeIdentifier('TAX123456')).toBe('TAX123456');
  });

  it('treats an empty or absent value as undefined', () => {
    expect(normalizeIdentifier('')).toBeUndefined();
    expect(normalizeIdentifier('   ')).toBeUndefined();
    expect(normalizeIdentifier(undefined)).toBeUndefined();
    expect(normalizeIdentifier(null)).toBeUndefined();
  });
});

describe('findPartnerDuplicate', () => {
  it('matches on email, case-insensitively', async () => {
    const prisma = prismaWith([EXISTING]);
    const match = await findPartnerDuplicate(prisma, {
      email: 'OPS@Contoso.test',
    });
    expect(match).toMatchObject({ id: 'partner-1', matchedOn: 'email' });
  });

  it('matches on tax id once normalised, even with different punctuation', async () => {
    const prisma = prismaWith([EXISTING]);
    const match = await findPartnerDuplicate(prisma, {
      taxId: 'tax 123-456',
    });
    expect(match).toMatchObject({ id: 'partner-1', matchedOn: 'taxId' });
  });

  it('matches on company name only for a COMPANY candidate', async () => {
    const prisma = prismaWith([EXISTING]);
    const companyMatch = await findPartnerDuplicate(prisma, {
      companyName: 'contoso ltd',
      type: PartnerType.COMPANY,
    });
    expect(companyMatch).toMatchObject({
      id: 'partner-1',
      matchedOn: 'companyName',
    });

    // An INDIVIDUAL candidate has no company name to collide on — passing one
    // through by mistake must not manufacture a false match.
    const individualCandidate = await findPartnerDuplicate(prisma, {
      companyName: 'contoso ltd',
      type: PartnerType.INDIVIDUAL,
    });
    expect(individualCandidate).toBeNull();
  });

  it('returns null when nothing matches', async () => {
    const prisma = prismaWith([EXISTING]);
    const match = await findPartnerDuplicate(prisma, {
      email: 'new@example.test',
      taxId: 'DIFFERENT',
      companyName: 'A New Company',
      type: PartnerType.COMPANY,
    });
    expect(match).toBeNull();
  });

  it('sends an id-exclusion clause so a partner can never match itself', async () => {
    const findFirst = jest.fn(async () => null);
    const prisma = {
      partner: { findFirst, findMany: jest.fn(async () => []) },
    } as never;
    await findPartnerDuplicate(
      prisma,
      { email: 'ops@contoso.test' },
      'partner-1',
    );
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { not: 'partner-1' },
        }) as unknown,
      }),
    );
  });
});

describe('assertNoPartnerDuplicate', () => {
  it('throws a 409 naming the existing partner, its code and status', () => {
    expect(() =>
      assertNoPartnerDuplicate({
        id: 'partner-1',
        displayName: 'Contoso Ltd',
        code: 'PTR-1',
        status: 'ACTIVE',
        matchedOn: 'email',
      }),
    ).toThrow(ConflictException);
    try {
      assertNoPartnerDuplicate({
        id: 'partner-1',
        displayName: 'Contoso Ltd',
        code: 'PTR-1',
        status: 'ACTIVE',
        matchedOn: 'email',
      });
    } catch (error) {
      expect((error as Error).message).toContain('Contoso Ltd');
      expect((error as Error).message).toContain('PTR-1');
      expect((error as Error).message).toContain('ACTIVE');
    }
  });

  it('does nothing when there is no match', () => {
    expect(() => assertNoPartnerDuplicate(null)).not.toThrow();
  });
});

describe('findOnboardingIdentifierDuplicate', () => {
  function prismaWithSubmissions(
    submissions: Array<{ partnerId: string; data: Record<string, unknown> }>,
  ) {
    return {
      partnerOnboardingSubmission: {
        findMany: jest.fn(async () =>
          submissions.map((item) => ({
            data: item.data,
            application: { partnerId: item.partnerId },
          })),
        ),
      },
    } as never;
  }

  it('finds a registration number collision against another partner', async () => {
    const prisma = prismaWithSubmissions([
      { partnerId: 'partner-2', data: { registrationNumber: 'REG-999' } },
    ]);
    const result = await findOnboardingIdentifierDuplicate(
      prisma,
      { registrationNumber: 'reg-999' },
      'partner-1',
    );
    expect(result).toEqual({
      partnerId: 'partner-2',
      field: 'registrationNumber',
    });
  });

  it('finds a national-id collision under the same registrationNumber check', async () => {
    const prisma = prismaWithSubmissions([
      { partnerId: 'partner-2', data: { nationalIdNumber: 'ID-555' } },
    ]);
    const result = await findOnboardingIdentifierDuplicate(
      prisma,
      { registrationNumber: 'ID-555' },
      'partner-1',
    );
    expect(result).toEqual({
      partnerId: 'partner-2',
      field: 'registrationNumber',
    });
  });

  it('finds a tax id collision inside taxInformation', async () => {
    const prisma = prismaWithSubmissions([
      { partnerId: 'partner-2', data: { taxInformation: { taxId: 'TAX-1' } } },
    ]);
    const result = await findOnboardingIdentifierDuplicate(
      prisma,
      { taxId: 'tax-1' },
      'partner-1',
    );
    expect(result).toEqual({ partnerId: 'partner-2', field: 'taxId' });
  });

  it('never matches the same partner against its own earlier submission', async () => {
    const prisma = {
      partnerOnboardingSubmission: {
        findMany: jest.fn(
          async ({ where }: { where: Record<string, unknown> }) => {
            // The real query excludes the applying partner server-side; assert
            // the exclusion is requested.
            expect(where).toMatchObject({
              application: { partnerId: { not: 'partner-1' } },
            });
            return [];
          },
        ),
      },
    } as never;
    const result = await findOnboardingIdentifierDuplicate(
      prisma,
      { registrationNumber: 'REG-1' },
      'partner-1',
    );
    expect(result).toBeNull();
  });

  it('returns null when neither identifier is provided', async () => {
    const prisma = prismaWithSubmissions([]);
    const result = await findOnboardingIdentifierDuplicate(
      prisma,
      {},
      'partner-1',
    );
    expect(result).toBeNull();
  });
});
