import { Injectable, Logger } from '@nestjs/common';
import { ConsentState, ConsentType, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * The cookie categories a visitor can actually decide about.
 *
 * ESSENTIAL is not here on purpose. Cookies required to serve the site are not
 * a choice, and presenting them as a toggle is a dark pattern: it implies the
 * visitor had a say and then ignores them if they say no.
 */
export const CONSENTABLE_COOKIE_CATEGORIES = [
  ConsentType.COOKIE_FUNCTIONAL,
  ConsentType.COOKIE_ANALYTICS,
  ConsentType.COOKIE_MARKETING,
] as const;

export type ConsentSubject = {
  visitorId?: string | null;
  subjectEmail?: string | null;
  leadId?: string | null;
  customerAccountId?: string | null;
  tenantId?: string | null;
  userId?: string | null;
};

export type RecordConsentInput = ConsentSubject & {
  type: ConsentType;
  state: ConsentState;
  definitionVersion: string;
  source: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

/**
 * Consent history.
 *
 * Every grant, decline and withdrawal is a new row rather than an update, so the
 * sequence is recoverable. "Did they opt in, then out, then in again" is a
 * question a boolean cannot answer and a regulator will ask.
 *
 * Marketing consent is **unbundled**: nothing in this service is ever a
 * condition of submitting a form, and the acquisition paths call it separately
 * from the privacy-notice acknowledgement precisely so the two cannot be
 * accidentally coupled.
 */
@Injectable()
export class ConsentService {
  private readonly logger = new Logger(ConsentService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Append a consent decision.
   *
   * Takes an optional transaction client so a form submission and the consent
   * it captured commit together — the same reasoning as the privacy-notice
   * acknowledgement.
   */
  async record(
    input: RecordConsentInput,
    client?: Prisma.TransactionClient,
  ): Promise<{ id: string }> {
    const db = client ?? this.prisma;
    const now = new Date();

    return db.consentRecord.create({
      data: {
        type: input.type,
        state: input.state,
        visitorId: input.visitorId ?? null,
        subjectEmail: input.subjectEmail?.toLowerCase().slice(0, 320) ?? null,
        leadId: input.leadId ?? null,
        customerAccountId: input.customerAccountId ?? null,
        tenantId: input.tenantId ?? null,
        userId: input.userId ?? null,
        definitionVersion: input.definitionVersion,
        source: input.source.slice(0, 120),
        grantedAt: input.state === ConsentState.GRANTED ? now : null,
        withdrawnAt: input.state === ConsentState.WITHDRAWN ? now : null,
        ipAddress: input.ipAddress?.slice(0, 64) ?? null,
        userAgent: input.userAgent?.slice(0, 512) ?? null,
      },
      select: { id: true },
    });
  }

  /**
   * Withdraw a previously granted consent.
   *
   * Appends a `WITHDRAWN` row rather than editing the grant, so the grant
   * remains as evidence of what was agreed and when. Withdrawal must always be
   * possible — this method never checks a permission and never refuses.
   */
  async withdraw(
    input: ConsentSubject & {
      type: ConsentType;
      source: string;
      definitionVersion?: string;
    },
  ): Promise<{ withdrawn: boolean }> {
    const current = await this.currentState(input.type, input);

    if (current?.state !== ConsentState.GRANTED) {
      // Not an error. Somebody unsubscribing twice, or unsubscribing from
      // something they never subscribed to, should see it succeed.
      return { withdrawn: false };
    }

    await this.record({
      ...input,
      state: ConsentState.WITHDRAWN,
      definitionVersion: input.definitionVersion ?? current.definitionVersion,
    });

    return { withdrawn: true };
  }

  /**
   * The latest decision for one subject and one consent type.
   *
   * Ordered by `createdAt` descending, so the most recent row wins. That is why
   * decisions are appended: the current state is derivable, and the path to it
   * is not lost.
   */
  async currentState(
    type: ConsentType,
    subject: ConsentSubject,
  ): Promise<{ state: ConsentState; definitionVersion: string } | null> {
    const where = this.subjectWhere(subject);
    if (!where) {
      return null;
    }

    const latest = await this.prisma.consentRecord.findFirst({
      where: { type, ...where },
      orderBy: { createdAt: 'desc' },
      select: { state: true, definitionVersion: true },
    });

    return latest;
  }

  /**
   * Every cookie category decision for a visitor.
   *
   * Categories with no row are absent from the result rather than defaulted to
   * declined. "Not asked yet" and "said no" are different, and the banner needs
   * to tell them apart to know whether to appear at all.
   */
  async cookiePreferences(
    visitorId: string,
  ): Promise<Partial<Record<ConsentType, ConsentState>>> {
    const rows = await this.prisma.consentRecord.findMany({
      where: {
        visitorId,
        type: { in: [...CONSENTABLE_COOKIE_CATEGORIES] },
      },
      orderBy: { createdAt: 'desc' },
      select: { type: true, state: true },
    });

    const preferences: Partial<Record<ConsentType, ConsentState>> = {};
    for (const row of rows) {
      // First occurrence wins because the query is newest-first.
      preferences[row.type] ??= row.state;
    }

    return preferences;
  }

  /**
   * Record a full set of cookie choices in one transaction.
   *
   * All-or-nothing: a visitor who accepts analytics and declines marketing must
   * not end up with only half of that stored because the second write failed.
   */
  async recordCookieChoices(input: {
    visitorId: string;
    definitionVersion: string;
    source: string;
    choices: Partial<
      Record<(typeof CONSENTABLE_COOKIE_CATEGORIES)[number], boolean>
    >;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<{ recorded: number }> {
    const entries = CONSENTABLE_COOKIE_CATEGORIES.filter(
      (category) => input.choices[category] !== undefined,
    );

    if (entries.length === 0) {
      return { recorded: 0 };
    }

    await this.prisma.$transaction(async (tx) => {
      for (const category of entries) {
        await this.record(
          {
            type: category,
            state: input.choices[category]
              ? ConsentState.GRANTED
              : ConsentState.DECLINED,
            visitorId: input.visitorId,
            definitionVersion: input.definitionVersion,
            source: input.source,
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
          },
          tx,
        );
      }
    });

    return { recorded: entries.length };
  }

  /**
   * Narrow to one subject.
   *
   * Deliberately picks the most specific identifier present rather than OR-ing
   * them together. OR-ing would let one person's withdrawal be read as another's
   * when two subjects share an email at different funnel stages.
   */
  private subjectWhere(
    subject: ConsentSubject,
  ): Prisma.ConsentRecordWhereInput | null {
    if (subject.userId) return { userId: subject.userId };
    if (subject.customerAccountId)
      return { customerAccountId: subject.customerAccountId };
    if (subject.leadId) return { leadId: subject.leadId };
    if (subject.subjectEmail)
      return { subjectEmail: subject.subjectEmail.toLowerCase() };
    if (subject.visitorId) return { visitorId: subject.visitorId };
    return null;
  }
}
