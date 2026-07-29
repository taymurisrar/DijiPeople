import { Injectable } from '@nestjs/common';
import {
  ConfigurationStatus,
  ExchangeRateSource,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class PayrollExchangeRateService {
  constructor(private readonly prisma: PrismaService) {}

  async lockRate(params: {
    tenantId: string;
    payrollRunId: string;
    fromCurrency: string;
    toCurrency: string;
    effectiveDate: Date;
  }) {
    const fromCurrency = normalizeCurrency(params.fromCurrency);
    const toCurrency = normalizeCurrency(params.toCurrency);
    const existing = await this.prisma.payrollExchangeRateLock.findUnique({
      where: {
        payrollRunId_fromCurrency_toCurrency: {
          payrollRunId: params.payrollRunId,
          fromCurrency,
          toCurrency,
        },
      },
    });
    if (existing) return existing;

    if (fromCurrency === toCurrency) {
      const lockData = {
        tenantId: params.tenantId,
        payrollRunId: params.payrollRunId,
        fromCurrency,
        toCurrency,
        rate: new Prisma.Decimal(1),
        effectiveDate: params.effectiveDate,
        source: ExchangeRateSource.MANUAL,
        provider: 'SYSTEM',
        fetchedAt: new Date(),
      };
      return this.prisma.payrollExchangeRateLock.upsert({
        where: {
          payrollRunId_fromCurrency_toCurrency: {
            payrollRunId: params.payrollRunId,
            fromCurrency,
            toCurrency,
          },
        },
        update: lockData,
        create: lockData,
      });
    }

    const snapshot = await this.prisma.exchangeRateSnapshot.findFirst({
      where: {
        tenantId: params.tenantId,
        fromCurrency,
        toCurrency,
        status: ConfigurationStatus.ACTIVE,
        effectiveDate: { lte: params.effectiveDate },
        OR: [
          { effectiveEndDate: null },
          { effectiveEndDate: { gte: params.effectiveDate } },
        ],
      },
      orderBy: [
        { lockedRate: 'desc' },
        { isManual: 'desc' },
        { effectiveDate: 'desc' },
      ],
    });

    if (!snapshot) return null;

    const lockData = {
      tenantId: params.tenantId,
      payrollRunId: params.payrollRunId,
      fromCurrency,
      toCurrency,
      rate: snapshot.rate,
      effectiveDate: snapshot.effectiveDate,
      source: snapshot.source,
      provider: snapshot.provider,
      fetchedAt: snapshot.lastFetchedAt,
    };
    return this.prisma.payrollExchangeRateLock.upsert({
      where: {
        payrollRunId_fromCurrency_toCurrency: {
          payrollRunId: params.payrollRunId,
          fromCurrency,
          toCurrency,
        },
      },
      update: lockData,
      create: lockData,
    });
  }

  convert(amount: Prisma.Decimal.Value, rate: Prisma.Decimal.Value) {
    return new Prisma.Decimal(amount).mul(rate).toDecimalPlaces(2);
  }
}

function normalizeCurrency(value: string) {
  return value.trim().toUpperCase();
}
