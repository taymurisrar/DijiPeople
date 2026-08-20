import { Injectable, Logger } from '@nestjs/common';
import { CustomerAccountStatus, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';

export type CustomerIdentityInput = {
  companyName: string;
  email: string;
  country: string;
};

/**
 * Decides whether a subscribe submission belongs to a customer that already
 * exists.
 *
 * THE PROBLEM. The public subscribe path created a fresh Lead, CustomerAccount,
 * Tenant and Subscription on **every** submission. A refresh, a double click,
 * an abandoned checkout that the visitor retried, or two people at the same
 * company signing up all produced duplicate commercial records — and a
 * permanently consumed tenant slug each time.
 *
 * THE RULE, deliberately conservative. Two submissions are the same customer
 * when the **work e-mail domain and the normalised company name both match**.
 * Matching on e-mail alone would merge two genuinely different companies that a
 * consultant signed up for from one address. Matching on company name alone
 * would merge every "Acme Ltd" on the planet. Requiring both is narrow enough
 * that a false merge is unlikely, and a missed merge is merely a duplicate — a
 * recoverable annoyance, where a wrong merge puts one company's workspace under
 * another company's billing account.
 *
 * Free e-mail domains are excluded from domain matching for exactly that
 * reason: `gmail.com` is not evidence of a shared employer.
 */
@Injectable()
export class CustomerIdentityService {
  private readonly logger = new Logger(CustomerIdentityService.name);

  /**
   * Domains that say nothing about which company someone works for.
   *
   * Not exhaustive and does not need to be: a domain missing from this list
   * only risks a merge between two submissions that also share a normalised
   * company name, which is the conservative half of the rule doing its job.
   */
  private static readonly GENERIC_EMAIL_DOMAINS = new Set([
    'gmail.com',
    'googlemail.com',
    'yahoo.com',
    'yahoo.co.uk',
    'outlook.com',
    'hotmail.com',
    'live.com',
    'icloud.com',
    'me.com',
    'aol.com',
    'proton.me',
    'protonmail.com',
    'yandex.com',
    'mail.com',
    'gmx.com',
    'zoho.com',
  ]);

  /**
   * Find the customer this submission belongs to, or null.
   *
   * Runs inside the caller's transaction so the decision and the write that
   * follows it cannot be separated by a concurrent submission.
   */
  async findExisting(
    tx: Prisma.TransactionClient,
    input: CustomerIdentityInput,
  ): Promise<{ id: string; status: CustomerAccountStatus } | null> {
    const normalizedCompany = normalizeCompanyName(input.companyName);
    const domain = emailDomain(input.email);

    // Exact contact e-mail is the strongest signal and is checked first: the
    // same person subscribing twice is the commonest duplicate of all.
    const byEmail = await tx.customerAccount.findFirst({
      where: {
        contactEmail: input.email.toLowerCase(),
        status: { notIn: [CustomerAccountStatus.CHURNED] },
      },
      select: { id: true, status: true, companyName: true },
      orderBy: { createdAt: 'desc' },
    });

    if (
      byEmail &&
      normalizeCompanyName(byEmail.companyName) === normalizedCompany
    ) {
      return { id: byEmail.id, status: byEmail.status };
    }

    if (!domain || CustomerIdentityService.GENERIC_EMAIL_DOMAINS.has(domain)) {
      // A generic domain carries no employer signal, so company name alone is
      // not enough to merge on. A duplicate here is the intended outcome.
      return null;
    }

    // Domain plus company name. Candidates are narrowed in the database by
    // domain and then compared on the normalised name in memory, because the
    // normalisation (punctuation, legal suffixes, case) has no SQL equivalent
    // that would still use an index.
    const candidates = await tx.customerAccount.findMany({
      where: {
        contactEmail: { endsWith: `@${domain}` },
        status: { notIn: [CustomerAccountStatus.CHURNED] },
      },
      select: { id: true, status: true, companyName: true },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });

    const match = candidates.find(
      (candidate) =>
        normalizeCompanyName(candidate.companyName) === normalizedCompany,
    );

    if (match) {
      this.logger.log(
        `Matched subscribe submission to existing customer ${match.id} on domain ${domain} and company name.`,
      );
      return { id: match.id, status: match.status };
    }

    return null;
  }

  /**
   * The business identity of a submission.
   *
   * Deliberately excludes anything that changes between a refresh and its
   * retry — no timestamp, no session id, no correlation id — because the whole
   * point is that resubmitting the same intent produces the same hash and is
   * absorbed by the unique constraint on `SubscriptionOrder.submissionHash`.
   *
   * It *does* include the plan price and seat count: changing the plan or the
   * quantity is a different order, not a duplicate of the previous one.
   */
  buildSubmissionHash(input: {
    email: string;
    companyName: string;
    planPriceId: string;
    seatQuantity: number;
  }): string {
    const material = [
      input.email.trim().toLowerCase(),
      normalizeCompanyName(input.companyName),
      input.planPriceId,
      String(input.seatQuantity),
    ].join('|');

    return createHash('sha256').update(material).digest('hex');
  }
}

/**
 * Reduce a company name to something comparable.
 *
 * Strips case, punctuation, runs of whitespace and the common legal suffixes,
 * so "Acme Ltd.", "ACME Limited" and "Acme" compare equal. It does not attempt
 * anything cleverer — fuzzy matching here would trade a recoverable duplicate
 * for an unrecoverable wrong merge.
 */
export function normalizeCompanyName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.,'"()]/g, '')
    .replace(
      /\b(private limited|pvt ltd|pvt|limited|ltd|llc|inc|incorporated|corp|corporation|gmbh|bv|sarl|plc|co)\b/g,
      '',
    )
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function emailDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 0) {
    return null;
  }
  return (
    email
      .slice(at + 1)
      .trim()
      .toLowerCase() || null
  );
}
