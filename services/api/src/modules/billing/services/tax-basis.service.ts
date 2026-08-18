import { Injectable, Logger } from '@nestjs/common';
import { Prisma, TaxTreatment } from '@prisma/client';

export type TaxBasisInput = {
  subtotalAmount: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  currency: string;
  /** ISO country of the buyer, as they gave it. */
  country: string;
  marketCode: string | null;
  /** The market's configured tax profile reference, if it has one. */
  taxProfileRef: string | null;
};

export type TaxBasis = {
  taxableAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  taxTreatment: TaxTreatment;
  taxJurisdiction: string | null;
  taxRatePercent: Prisma.Decimal | null;
  taxRegistrationRef: string | null;
  taxProviderRef: string | null;
  taxRateSnapshot: Prisma.InputJsonValue | null;
};

/**
 * Resolves the tax basis of an order: subtotal → discount → taxable basis →
 * treatment → tax → total.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. It does not invent a rate, a jurisdiction
 * or a registration number. DijiPeople has no configured tax registrations
 * anywhere in this repository, and `Market.taxProfileRef` is nullable precisely
 * so a market without one cannot claim to have one.
 *
 * So the default outcome is `NOT_DETERMINED` with zero tax — and that is
 * deliberately a different statement from `NOT_APPLICABLE`. "We have not worked
 * out whether tax applies here" and "tax does not apply here" are not the same
 * claim, and writing the second when the first is true would put a false tax
 * position on a financial record. Which one is correct for Pakistan is a
 * TAX_ACCOUNTING_REVIEW decision, not an engineering one.
 *
 * The *shape* is complete: when a registration and a rate source exist, they
 * populate the same columns and every downstream consumer already reads them.
 */
@Injectable()
export class TaxBasisService {
  private readonly logger = new Logger(TaxBasisService.name);

  resolve(input: TaxBasisInput): TaxBasis {
    const taxableAmount = maxZero(
      input.subtotalAmount.minus(input.discountAmount),
    );

    // No configured tax profile for this market means no determination is
    // possible. Failing closed here would block every sale; recording an
    // invented rate would be worse. Recording "undetermined, zero charged" is
    // the only honest third option, and it is auditable after the fact.
    if (!input.taxProfileRef) {
      return {
        taxableAmount,
        taxAmount: new Prisma.Decimal(0),
        totalAmount: taxableAmount,
        taxTreatment: TaxTreatment.NOT_DETERMINED,
        taxJurisdiction: input.marketCode ?? input.country ?? null,
        taxRatePercent: null,
        taxRegistrationRef: null,
        taxProviderRef: null,
        taxRateSnapshot: {
          resolvedAt: new Date().toISOString(),
          reason: 'NO_TAX_PROFILE_CONFIGURED_FOR_MARKET',
          marketCode: input.marketCode,
          country: input.country,
          // Recorded so a later audit can see exactly what the platform knew
          // when it charged nothing, rather than having to infer it.
          note: 'No tax registration or rate source is configured. Zero tax was charged and the treatment was recorded as undetermined rather than as not-applicable.',
        } as Prisma.InputJsonValue,
      };
    }

    // A configured profile exists but no rate source is wired yet. Same
    // reasoning, different reason code so the two are distinguishable in a
    // report — one is "nobody configured this market", the other is "the market
    // is configured and the rate lookup is missing", and they need different
    // people to fix them.
    this.logger.warn(
      `Market ${input.marketCode ?? 'unknown'} declares taxProfileRef ${input.taxProfileRef} but no rate source is wired; charging zero tax and recording NOT_DETERMINED.`,
    );

    return {
      taxableAmount,
      taxAmount: new Prisma.Decimal(0),
      totalAmount: taxableAmount,
      taxTreatment: TaxTreatment.NOT_DETERMINED,
      taxJurisdiction: input.marketCode ?? input.country ?? null,
      taxRatePercent: null,
      taxRegistrationRef: input.taxProfileRef,
      taxProviderRef: null,
      taxRateSnapshot: {
        resolvedAt: new Date().toISOString(),
        reason: 'TAX_PROFILE_CONFIGURED_BUT_NO_RATE_SOURCE',
        marketCode: input.marketCode,
        country: input.country,
        taxProfileRef: input.taxProfileRef,
      } as Prisma.InputJsonValue,
    };
  }
}

function maxZero(value: Prisma.Decimal): Prisma.Decimal {
  return value.isNegative() ? new Prisma.Decimal(0) : value;
}
