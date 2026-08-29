import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ExchangeRateSource, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DEFAULT_PLATFORM_DEFAULTS } from '../../common/reference-data/platform-reference-data';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';

/**
 * Platform-level currency conversion, so one revenue figure can include money
 * the platform actually collected rather than the slice that happened to match
 * a configured currency.
 *
 * The Control Hub used to filter every money aggregate on the reporting
 * currency. Production stored `PKR` while every payment, invoice and price was
 * `QAR`, so the dashboard read "Collected revenue PKR 0" beside two succeeded
 * payments (BUG-1745). That was first made *honest* — the screen listed what it
 * had excluded — and is now made *right*: the excluded money is converted and
 * counted.
 *
 * Two rules run through everything below.
 *
 * **A missing rate is never a guess.** `convert` returns `null` rather than
 * falling back to 1, because a silent par conversion turns QAR 160 into PKR 160
 * and nothing on the screen would say so. A currency with no rate is reported
 * as unconvertible, with its own total, in its own currency.
 *
 * **An operator's rate outranks the provider's.** `manualOverride` survives
 * every refresh until it is explicitly cleared, so correcting a rate is not a
 * race against the next fetch.
 */

/**
 * The rate provider.
 *
 * open.er-api.com is free, needs no key and no account, and — unlike the ECB
 * feeds — actually quotes the Gulf currencies this platform trades in. Chosen
 * by the repository owner on 2026-08-28.
 *
 * A constant rather than an environment variable on purpose: there is no
 * secret, nothing to rotate, and one correct value. An env var would mean four
 * registration sites (`packages/config` validation, `turbo.json` globalEnv,
 * `render.yaml`, `docs/environment-variables.md`) for a URL nobody will change.
 * Specs stub `fetchProviderRates`, which is the seam that matters.
 */
const PROVIDER_NAME = 'open.er-api.com';
const PROVIDER_BASE_URL = 'https://open.er-api.com/v6/latest';

/** How long a fetched rate is treated as current. */
const RATE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * How long the dashboard will wait for a refresh before giving up and using
 * what it already has. A stale figure beats a slow screen, and the screen says
 * which it is showing.
 */
const REFRESH_TIMEOUT_MS = 4_000;

export type PlatformRateView = {
  currency: string;
  /** 1 `currency` = `rate` of the base currency. */
  rate: number;
  source: ExchangeRateSource;
  provider: string | null;
  fetchedAt: string | null;
  manualOverride: boolean;
  overrideReason: string | null;
};

export type PlatformFxConverter = {
  base: string;
  ratesAsOf: string | null;
  rates: PlatformRateView[];
  /**
   * `null` when the currency has no rate — deliberately not `amount`, and
   * deliberately not `0`. The caller must decide what to say about money it
   * cannot express in the reporting currency.
   *
   * A function property rather than a method, so it can be passed to the
   * folding helpers as a value without carrying a `this` to lose.
   */
  convert: (amount: number, currency: string) => number | null;
};

type ProviderRates = Record<string, number>;

@Injectable()
export class PlatformFxService {
  private readonly logger = new Logger(PlatformFxService.name);

  /**
   * Guards the opportunistic refresh. A dashboard opened in three tabs must not
   * become three provider calls, and a provider that is down must not be
   * retried on every page load.
   */
  private refreshInFlight = new Map<string, Promise<void>>();
  private lastRefreshAttempt = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The currency the platform reports in.
   *
   * One resolution, used by the dashboard and by the settings screen, so the
   * rates an operator maintains are guaranteed to be the rates the dashboard
   * reads. Two copies of this three-line fallback would eventually disagree,
   * and the failure would look like a rate that "did not take".
   */
  async resolveReportingCurrency(): Promise<string> {
    const row = await this.prisma.platformSetting.findUnique({
      where: { key: 'platform-defaults' },
    });
    const stored =
      row?.value && typeof row.value === 'object' && !Array.isArray(row.value)
        ? (row.value as Record<string, unknown>)
        : {};
    if (typeof stored.reportingCurrency === 'string')
      return stored.reportingCurrency;
    if (typeof stored.currency === 'string') return stored.currency;
    return DEFAULT_PLATFORM_DEFAULTS.reportingCurrency;
  }

  async listRates(base: string): Promise<PlatformRateView[]> {
    const rows = await this.prisma.platformExchangeRate.findMany({
      where: { baseCurrency: base },
      orderBy: [{ quoteCurrency: 'asc' }],
    });
    return rows.map((row) => this.toView(row));
  }

  /**
   * One database read, then pure arithmetic.
   *
   * The dashboard converts several thousand rows across eight aggregates; doing
   * that against a service that queries per call would be a query per payment.
   */
  async loadConverter(base: string): Promise<PlatformFxConverter> {
    const rates = await this.listRates(base);
    const byCurrency = new Map(rates.map((rate) => [rate.currency, rate.rate]));
    const fetched = rates
      .map((rate) => rate.fetchedAt)
      .filter((value): value is string => Boolean(value))
      .sort();

    return {
      base,
      ratesAsOf: fetched.length ? fetched[fetched.length - 1] : null,
      rates,
      convert: (amount: number, currency: string) => {
        if (!Number.isFinite(amount)) return null;
        // The reporting currency converts to itself, and needs no row to do it.
        if (currency === base) return amount;
        const rate = byCurrency.get(currency);
        if (rate === undefined || !Number.isFinite(rate) || rate <= 0)
          return null;
        return round2(amount * rate);
      },
    };
  }

  /**
   * Refresh if the newest provider-sourced rate is older than a day.
   *
   * Bounded, and never fatal: on timeout or provider error the caller proceeds
   * with the rates already stored. There is no scheduler in this API — adding
   * `@nestjs/schedule` for one daily fetch would be a new dependency and a new
   * failure mode — so the read path keeps its own rates warm.
   */
  async ensureFresh(base: string): Promise<void> {
    const inFlight = this.refreshInFlight.get(base);
    if (inFlight) {
      await this.withTimeout(inFlight);
      return;
    }

    const newest = await this.prisma.platformExchangeRate.findFirst({
      where: { baseCurrency: base, source: ExchangeRateSource.API },
      orderBy: { fetchedAt: 'desc' },
      select: { fetchedAt: true },
    });
    const age = newest?.fetchedAt
      ? Date.now() - newest.fetchedAt.getTime()
      : Number.POSITIVE_INFINITY;
    if (age < RATE_TTL_MS) return;

    // Do not hammer a provider that just failed; one attempt per TTL window.
    const lastAttempt = this.lastRefreshAttempt.get(base) ?? 0;
    if (
      Date.now() - lastAttempt < RATE_TTL_MS &&
      age !== Number.POSITIVE_INFINITY
    )
      return;

    const run = this.refreshFromProvider(base)
      .then(() => undefined)
      .catch((error: unknown) => {
        this.logger.warn(
          `Exchange rates for ${base} could not be refreshed; using stored rates. ${describe(error)}`,
        );
      })
      .finally(() => {
        this.refreshInFlight.delete(base);
      });

    this.lastRefreshAttempt.set(base, Date.now());
    this.refreshInFlight.set(base, run);
    await this.withTimeout(run);
  }

  /**
   * Fetch and store rates for every currency the platform actually holds money
   * in.
   *
   * Not all 160 the provider returns. A settings table listing rates for
   * currencies no invoice was ever raised in is a table nobody reads, and the
   * operator needs to recognise every row on it as something they could be
   * asked about.
   */
  async refreshFromProvider(base: string, actor?: AuthenticatedUser) {
    const currencies = await this.currenciesInUse(base);
    const before = await this.listRates(base);
    const providerRates = await this.fetchProviderRates(base);
    const fetchedAt = new Date();

    const written: string[] = [];
    const skipped: string[] = [];
    const unquoted: string[] = [];

    for (const currency of currencies) {
      const existing = before.find((rate) => rate.currency === currency);
      if (existing?.manualOverride) {
        // An operator's correction is not undone by the next fetch.
        skipped.push(currency);
        continue;
      }
      const quoted = providerRates[currency];
      // `quoted` is "1 base = quoted currency"; stored is the inverse, so that
      // converting a payment is a multiplication at every call site.
      if (
        typeof quoted !== 'number' ||
        !Number.isFinite(quoted) ||
        quoted <= 0
      ) {
        unquoted.push(currency);
        continue;
      }
      const rate = 1 / quoted;
      await this.prisma.platformExchangeRate.upsert({
        where: {
          baseCurrency_quoteCurrency: {
            baseCurrency: base,
            quoteCurrency: currency,
          },
        },
        create: {
          baseCurrency: base,
          quoteCurrency: currency,
          rate: new Prisma.Decimal(rate.toFixed(8)),
          source: ExchangeRateSource.API,
          provider: PROVIDER_NAME,
          fetchedAt,
          manualOverride: false,
          createdById: actor?.userId ?? null,
          updatedById: actor?.userId ?? null,
        },
        update: {
          rate: new Prisma.Decimal(rate.toFixed(8)),
          source: ExchangeRateSource.API,
          provider: PROVIDER_NAME,
          fetchedAt,
          overrideReason: null,
          updatedById: actor?.userId ?? null,
        },
      });
      written.push(currency);
    }

    if (unquoted.length)
      this.logger.warn(
        `${PROVIDER_NAME} quoted no rate for ${unquoted.join(', ')} against ${base}; those currencies remain unconvertible.`,
      );

    /*
     * Audited whatever the outcome. A rate is what a revenue figure is made of,
     * and an unaudited rate change makes a past report unexplainable — "why did
     * last month's number move?" has to have an answer.
     */
    await this.audit.log({
      tenantId: 'platform',
      actorUserId: actor?.userId ?? null,
      action: 'PLATFORM_FX_RATES_REFRESHED',
      sourceModule: 'super-admin',
      entityType: 'PlatformExchangeRate',
      entityId: base,
      beforeSnapshot: { base, rates: snapshot(before) },
      afterSnapshot: {
        base,
        provider: PROVIDER_NAME,
        fetchedAt: fetchedAt.toISOString(),
        written,
        skippedManualOverride: skipped,
        unquoted,
      },
    });

    return this.listRates(base);
  }

  async setManualRate(
    base: string,
    quote: string,
    rate: number,
    reason: string,
    actor: AuthenticatedUser,
  ) {
    if (!Number.isFinite(rate) || rate <= 0)
      throw new BadRequestException({
        code: 'INVALID_EXCHANGE_RATE',
        message: 'An exchange rate must be a positive number.',
      });
    if (quote === base)
      throw new BadRequestException({
        code: 'INVALID_EXCHANGE_RATE',
        message: 'The reporting currency converts to itself at 1.',
      });

    const before = await this.prisma.platformExchangeRate.findUnique({
      where: {
        baseCurrency_quoteCurrency: {
          baseCurrency: base,
          quoteCurrency: quote,
        },
      },
    });

    const saved = await this.prisma.platformExchangeRate.upsert({
      where: {
        baseCurrency_quoteCurrency: {
          baseCurrency: base,
          quoteCurrency: quote,
        },
      },
      create: {
        baseCurrency: base,
        quoteCurrency: quote,
        rate: new Prisma.Decimal(rate.toFixed(8)),
        source: ExchangeRateSource.MANUAL,
        provider: null,
        manualOverride: true,
        overrideReason: reason,
        createdById: actor.userId,
        updatedById: actor.userId,
      },
      update: {
        rate: new Prisma.Decimal(rate.toFixed(8)),
        source: ExchangeRateSource.MANUAL,
        manualOverride: true,
        overrideReason: reason,
        updatedById: actor.userId,
      },
    });

    await this.audit.log({
      tenantId: 'platform',
      actorUserId: actor.userId,
      action: 'PLATFORM_FX_RATE_OVERRIDDEN',
      sourceModule: 'super-admin',
      entityType: 'PlatformExchangeRate',
      entityId: saved.id,
      beforeSnapshot: before
        ? { rate: Number(before.rate), source: before.source }
        : null,
      afterSnapshot: { rate, source: ExchangeRateSource.MANUAL, reason },
    });

    return this.toView(saved);
  }

  /**
   * Hand a pair back to the provider.
   *
   * The row is left in place with `manualOverride: false` rather than deleted,
   * so the next refresh corrects it and the dashboard is never briefly unable
   * to convert a currency it could convert a moment ago.
   */
  async clearManualOverride(
    base: string,
    quote: string,
    actor: AuthenticatedUser,
  ) {
    const before = await this.prisma.platformExchangeRate.findUnique({
      where: {
        baseCurrency_quoteCurrency: {
          baseCurrency: base,
          quoteCurrency: quote,
        },
      },
    });
    if (!before?.manualOverride)
      throw new BadRequestException({
        code: 'NO_MANUAL_OVERRIDE',
        message: 'This currency is already following the live rate.',
      });

    const saved = await this.prisma.platformExchangeRate.update({
      where: { id: before.id },
      data: {
        manualOverride: false,
        overrideReason: null,
        updatedById: actor.userId,
      },
    });

    await this.audit.log({
      tenantId: 'platform',
      actorUserId: actor.userId,
      action: 'PLATFORM_FX_OVERRIDE_CLEARED',
      sourceModule: 'super-admin',
      entityType: 'PlatformExchangeRate',
      entityId: saved.id,
      beforeSnapshot: {
        rate: Number(before.rate),
        source: before.source,
        reason: before.overrideReason,
      },
      afterSnapshot: { manualOverride: false },
    });

    // Ask the provider immediately, so the operator sees the live rate they
    // just asked to return to rather than the manual one they just cleared.
    await this.refreshFromProvider(base, actor).catch((error: unknown) => {
      this.logger.warn(
        `Override cleared for ${quote} but the live rate could not be fetched. ${describe(error)}`,
      );
    });

    return this.toView(
      (await this.prisma.platformExchangeRate.findUnique({
        where: { id: saved.id },
      })) ?? saved,
    );
  }

  /**
   * Every currency the platform has money recorded in, plus any pair an
   * operator has already taken an interest in.
   */
  private async currenciesInUse(base: string): Promise<string[]> {
    const [payments, invoices, commissions, existing] = await Promise.all([
      this.prisma.payment.findMany({
        distinct: ['currency'],
        select: { currency: true },
      }),
      this.prisma.invoice.findMany({
        distinct: ['currency'],
        select: { currency: true },
      }),
      this.prisma.partnerCommission.findMany({
        distinct: ['currencyCode'],
        select: { currencyCode: true },
      }),
      this.prisma.platformExchangeRate.findMany({
        where: { baseCurrency: base },
        select: { quoteCurrency: true },
      }),
    ]);

    const all = new Set<string>();
    for (const row of payments) if (row.currency) all.add(row.currency);
    for (const row of invoices) if (row.currency) all.add(row.currency);
    for (const row of commissions)
      if (row.currencyCode) all.add(row.currencyCode);
    for (const row of existing) all.add(row.quoteCurrency);
    all.delete(base);
    return [...all].sort();
  }

  /**
   * The one place this service talks to the network.
   *
   * `protected` so specs can subclass and stub it — the alternative is mocking
   * global fetch, which makes every other assertion in a suite dependent on
   * that mock still being installed.
   */
  protected async fetchProviderRates(base: string): Promise<ProviderRates> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);
    try {
      const response = await fetch(
        `${PROVIDER_BASE_URL}/${encodeURIComponent(base)}`,
        { signal: controller.signal },
      );
      if (!response.ok)
        throw new Error(`${PROVIDER_NAME} answered ${response.status}.`);
      const payload = (await response.json()) as {
        result?: string;
        rates?: ProviderRates;
      };
      if (payload.result && payload.result !== 'success')
        throw new Error(`${PROVIDER_NAME} reported "${payload.result}".`);
      if (!payload.rates || typeof payload.rates !== 'object')
        throw new Error(`${PROVIDER_NAME} returned no rates.`);
      return payload.rates;
    } finally {
      clearTimeout(timer);
    }
  }

  private async withTimeout(work: Promise<unknown>): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const bound = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, REFRESH_TIMEOUT_MS);
    });
    try {
      await Promise.race([work.then(() => undefined), bound]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private toView(row: {
    quoteCurrency: string;
    rate: Prisma.Decimal;
    source: ExchangeRateSource;
    provider: string | null;
    fetchedAt: Date | null;
    manualOverride: boolean;
    overrideReason: string | null;
  }): PlatformRateView {
    return {
      currency: row.quoteCurrency,
      rate: Number(row.rate),
      source: row.source,
      provider: row.provider,
      fetchedAt: row.fetchedAt ? row.fetchedAt.toISOString() : null,
      manualOverride: row.manualOverride,
      overrideReason: row.overrideReason,
    };
  }
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function snapshot(rates: PlatformRateView[]) {
  return rates.map((rate) => ({
    currency: rate.currency,
    rate: rate.rate,
    source: rate.source,
  }));
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
