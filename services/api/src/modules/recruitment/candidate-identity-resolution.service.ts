import { Injectable } from '@nestjs/common';
import { CandidateIdentityType, Prisma } from '@prisma/client';
import { normalizeEmail } from '../../common/utils/email.util';
import { PrismaService } from '../../common/prisma/prisma.service';

export type CandidateIdentitySignals = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  personalEmail?: string | null;
  phone?: string | null;
  alternatePhone?: string | null;
  linkedInUrl?: string | null;
};

export type CandidateIdentityResolution = {
  resolution:
    | 'existing_exact'
    | 'existing_probable'
    | 'ambiguous'
    | 'new_candidate';
  candidateId?: string;
  score?: number;
  ambiguousCandidateIds?: string[];
};

@Injectable()
export class CandidateIdentityResolutionService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveCandidate(
    tenantId: string,
    signals: CandidateIdentitySignals,
  ): Promise<CandidateIdentityResolution> {
    const normalizedSignals = {
      email: normalizeEmailSignal(signals.email),
      personalEmail: normalizeEmailSignal(signals.personalEmail),
      phone: normalizePhone(signals.phone),
      alternatePhone: normalizePhone(signals.alternatePhone),
      linkedInUrl: normalizeLinkedIn(signals.linkedInUrl),
      fullName: normalizeName(signals.firstName, signals.lastName),
    };

    const identityMatches = await this.lookupByIdentityTable(
      tenantId,
      normalizedSignals,
    );
    const fallbackMatches = await this.lookupByCandidateFields(
      tenantId,
      normalizedSignals,
    );
    const allMatches = mergeScores(identityMatches, fallbackMatches);

    if (allMatches.length === 0) {
      return { resolution: 'new_candidate' };
    }

    const sorted = [...allMatches].sort((a, b) => b.score - a.score);
    const [top, second] = sorted;

    if (second && top.score - second.score <= 7 && second.score >= 60) {
      return {
        resolution: 'ambiguous',
        ambiguousCandidateIds: [top.candidateId, second.candidateId],
      };
    }

    if (top.score >= 85) {
      return {
        resolution: 'existing_exact',
        candidateId: top.candidateId,
        score: top.score,
      };
    }

    if (top.score >= 60) {
      return {
        resolution: 'existing_probable',
        candidateId: top.candidateId,
        score: top.score,
      };
    }

    return { resolution: 'new_candidate' };
  }

  async syncIdentities(params: {
    tenantId: string;
    candidateId: string;
    signals: CandidateIdentitySignals;
    actorUserId: string;
    tx?: Prisma.TransactionClient;
  }) {
    const db = params.tx ?? this.prisma;
    const identities = buildIdentityRows(params.signals);
    for (const [index, identity] of identities.entries()) {
      try {
        await db.candidateIdentity.upsert({
          where: {
            tenantId_type_normalizedValue: {
              tenantId: params.tenantId,
              type: identity.type,
              normalizedValue: identity.normalizedValue,
            },
          },
          create: {
            tenantId: params.tenantId,
            candidateId: params.candidateId,
            type: identity.type,
            value: identity.value,
            normalizedValue: identity.normalizedValue,
            isPrimary: index === 0,
            source: 'profile',
            confidence: 100,
            createdById: params.actorUserId,
            updatedById: params.actorUserId,
          },
          update: {
            candidateId: params.candidateId,
            value: identity.value,
            isPrimary: index === 0,
            updatedById: params.actorUserId,
          },
        });
      } catch {
        // Keep profile writes resilient even if one conflicting identity exists.
      }
    }
  }

  private async lookupByIdentityTable(
    tenantId: string,
    signals: {
      email: string | null;
      personalEmail: string | null;
      phone: string | null;
      alternatePhone: string | null;
      linkedInUrl: string | null;
      fullName: string | null;
    },
  ) {
    const signalPairs: Array<{
      type: CandidateIdentityType;
      value: string;
      weight: number;
    }> = [];
    if (signals.email)
      signalPairs.push({ type: 'EMAIL', value: signals.email, weight: 90 });
    if (signals.personalEmail)
      signalPairs.push({
        type: 'EMAIL',
        value: signals.personalEmail,
        weight: 70,
      });
    if (signals.phone)
      signalPairs.push({ type: 'PHONE', value: signals.phone, weight: 85 });
    if (signals.alternatePhone)
      signalPairs.push({
        type: 'PHONE',
        value: signals.alternatePhone,
        weight: 65,
      });
    if (signals.linkedInUrl)
      signalPairs.push({
        type: 'LINKEDIN',
        value: signals.linkedInUrl,
        weight: 80,
      });

    if (signalPairs.length === 0) {
      return [] as Array<{ candidateId: string; score: number }>;
    }

    const identities = await this.prisma.candidateIdentity.findMany({
      where: {
        tenantId,
        OR: signalPairs.map((item) => ({
          type: item.type,
          normalizedValue: item.value,
        })),
      },
      select: { candidateId: true, type: true, normalizedValue: true },
    });

    const scoreByCandidate = new Map<string, number>();
    for (const match of identities) {
      const signal = signalPairs.find(
        (item) =>
          item.type === match.type && item.value === match.normalizedValue,
      );
      if (!signal) {
        continue;
      }
      scoreByCandidate.set(
        match.candidateId,
        (scoreByCandidate.get(match.candidateId) ?? 0) + signal.weight,
      );
    }

    return [...scoreByCandidate.entries()].map(([candidateId, score]) => ({
      candidateId,
      score,
    }));
  }

  private async lookupByCandidateFields(
    tenantId: string,
    signals: {
      email: string | null;
      personalEmail: string | null;
      phone: string | null;
      alternatePhone: string | null;
      linkedInUrl: string | null;
      fullName: string | null;
    },
  ) {
    const where: Prisma.CandidateWhereInput = {
      tenantId,
      OR: [],
    };

    if (signals.email) {
      where.OR!.push({ email: signals.email });
      where.OR!.push({ personalEmail: signals.email });
    }
    if (signals.personalEmail) {
      where.OR!.push({ email: signals.personalEmail });
      where.OR!.push({ personalEmail: signals.personalEmail });
    }
    if (signals.phone) {
      where.OR!.push({ phone: { contains: signals.phone } });
      where.OR!.push({ alternatePhone: { contains: signals.phone } });
    }
    if (signals.alternatePhone) {
      where.OR!.push({ phone: { contains: signals.alternatePhone } });
      where.OR!.push({ alternatePhone: { contains: signals.alternatePhone } });
    }
    if (signals.linkedInUrl) {
      where.OR!.push({ linkedInUrl: signals.linkedInUrl });
    }

    if (!where.OR || where.OR.length === 0) {
      return [] as Array<{ candidateId: string; score: number }>;
    }

    const candidates = await this.prisma.candidate.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        middleName: true,
        lastName: true,
        email: true,
        personalEmail: true,
        phone: true,
        alternatePhone: true,
        linkedInUrl: true,
      },
      take: 30,
    });

    return candidates.map((candidate) => {
      let score = 0;
      if (
        signals.email &&
        [candidate.email, candidate.personalEmail].includes(signals.email)
      ) {
        score += 80;
      }
      if (
        signals.personalEmail &&
        [candidate.email, candidate.personalEmail].includes(
          signals.personalEmail,
        )
      ) {
        score += 55;
      }
      if (
        signals.phone &&
        containsNormalizedPhone(candidate.phone, signals.phone)
      ) {
        score += 75;
      }
      if (
        signals.phone &&
        candidate.alternatePhone &&
        containsNormalizedPhone(candidate.alternatePhone, signals.phone)
      ) {
        score += 50;
      }
      if (
        signals.alternatePhone &&
        containsNormalizedPhone(candidate.phone, signals.alternatePhone)
      ) {
        score += 45;
      }
      if (
        signals.linkedInUrl &&
        normalizeLinkedIn(candidate.linkedInUrl) === signals.linkedInUrl
      ) {
        score += 70;
      }

      const candidateFullName = normalizeName(
        candidate.firstName,
        [candidate.middleName, candidate.lastName].filter(Boolean).join(' '),
      );
      if (signals.fullName && candidateFullName === signals.fullName) {
        score += 25;
      }

      return {
        candidateId: candidate.id,
        score,
      };
    });
  }
}

function normalizeEmailSignal(value?: string | null) {
  if (!value) {
    return null;
  }
  try {
    return normalizeEmail(value);
  } catch {
    return null;
  }
}

function normalizePhone(value?: string | null) {
  if (!value) {
    return null;
  }
  const normalized = value.replace(/[^\d+]/g, '');
  return normalized.length >= 7 ? normalized : null;
}

function normalizeLinkedIn(value?: string | null) {
  if (!value) {
    return null;
  }
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');
}

function normalizeName(first?: string | null, last?: string | null) {
  const fullName = [first, last]
    .filter((value): value is string =>
      Boolean(value && value.trim().length > 0),
    )
    .join(' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return fullName.length > 1 ? fullName : null;
}

function containsNormalizedPhone(candidatePhone: string, needle: string) {
  const normalizedCandidatePhone = normalizePhone(candidatePhone);
  if (!normalizedCandidatePhone) {
    return false;
  }
  return (
    normalizedCandidatePhone.endsWith(needle) ||
    needle.endsWith(normalizedCandidatePhone)
  );
}

function buildIdentityRows(signals: CandidateIdentitySignals) {
  const identities: Array<{
    type: CandidateIdentityType;
    value: string;
    normalizedValue: string;
  }> = [];

  const email = normalizeEmailSignal(signals.email);
  if (email)
    identities.push({
      type: 'EMAIL',
      value: signals.email!.trim(),
      normalizedValue: email,
    });

  const personalEmail = normalizeEmailSignal(signals.personalEmail);
  if (personalEmail) {
    identities.push({
      type: 'EMAIL',
      value: signals.personalEmail!.trim(),
      normalizedValue: personalEmail,
    });
  }

  const phone = normalizePhone(signals.phone);
  if (phone)
    identities.push({
      type: 'PHONE',
      value: signals.phone!.trim(),
      normalizedValue: phone,
    });

  const alternatePhone = normalizePhone(signals.alternatePhone);
  if (alternatePhone) {
    identities.push({
      type: 'PHONE',
      value: signals.alternatePhone!.trim(),
      normalizedValue: alternatePhone,
    });
  }

  const linkedInUrl = normalizeLinkedIn(signals.linkedInUrl);
  if (linkedInUrl) {
    identities.push({
      type: 'LINKEDIN',
      value: signals.linkedInUrl!.trim(),
      normalizedValue: linkedInUrl,
    });
  }

  const deduped = new Map<string, (typeof identities)[number]>();
  for (const identity of identities) {
    deduped.set(`${identity.type}:${identity.normalizedValue}`, identity);
  }
  return [...deduped.values()];
}

function mergeScores(
  first: Array<{ candidateId: string; score: number }>,
  second: Array<{ candidateId: string; score: number }>,
) {
  const scoreByCandidate = new Map<string, number>();
  for (const row of [...first, ...second]) {
    scoreByCandidate.set(
      row.candidateId,
      (scoreByCandidate.get(row.candidateId) ?? 0) + row.score,
    );
  }
  return [...scoreByCandidate.entries()].map(([candidateId, score]) => ({
    candidateId,
    score,
  }));
}
