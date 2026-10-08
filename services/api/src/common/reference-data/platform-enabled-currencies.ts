import type { Prisma } from '@prisma/client';
import { AppError } from '../errors/app-error';
import type { PrismaService } from '../prisma/prisma.service';
import {
  PLATFORM_CURRENCIES,
  PLATFORM_CURRENCY_CODES,
  isSupportedCurrencyCode,
  resolvePlatformCurrency,
} from './platform-reference-data';

/**
 * The currencies an operator may pick for platform records (ADR-0026 D4).
 *
 * `platform-defaults.enabledCurrencies` is a SUBSET of the `@repo/config`
 * catalog, never a second catalog: every entry must be a supported code, and
 * an absent or empty value means "all of them", which is what the platform
 * offered before the setting existed. The default and reporting currencies are
 * always enabled — a fallback the platform writes on its own must be a value
 * an operator could also have chosen.
 *
 * Disabling a currency never invalidates a record that already carries it.
 * Validation runs when a currency is *chosen* (create, or an update that
 * changes it), not on every save of a record that merely has one.
 */

type PlatformSettingReader = {
  platformSetting: Pick<PrismaService['platformSetting'], 'findUnique'>;
};

export type PlatformCurrencyOption = {
  /** `value`/`displayName` let the admin runtime lookup read this as-is. */
  value: string;
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  displayName: string;
  enabled: boolean;
};

/** Enabled codes, in catalog order, from a stored `platform-defaults` value. */
export function resolveEnabledCurrencyCodes(
  platformDefaults: unknown,
): string[] {
  const record = isRecord(platformDefaults) ? platformDefaults : {};
  const stored = Array.isArray(record.enabledCurrencies)
    ? record.enabledCurrencies.filter(isSupportedCurrencyCode)
    : [];
  if (!stored.length) return [...PLATFORM_CURRENCY_CODES];

  const enabled = new Set<string>(stored);
  for (const always of [record.currency, record.reportingCurrency])
    if (isSupportedCurrencyCode(always)) enabled.add(always);
  return PLATFORM_CURRENCY_CODES.filter((code) => enabled.has(code));
}

/**
 * Throws when `enabledCurrencies` is present but not an acceptable subset.
 * Called from `validatePlatformDefaults` with the merged value that would be
 * stored.
 */
export function assertValidEnabledCurrencies(value: Record<string, unknown>) {
  const list = value.enabledCurrencies;
  if (list === undefined) return;
  if (!Array.isArray(list) || list.length === 0)
    throw new Error(
      'Invalid platform default: enabledCurrencies must list at least one currency.',
    );
  const seen = new Set<string>();
  for (const code of list) {
    if (!isSupportedCurrencyCode(code))
      throw new Error(
        `Invalid platform default: enabledCurrencies contains an unsupported currency (${String(code)}).`,
      );
    if (seen.has(code))
      throw new Error(
        `Invalid platform default: enabledCurrencies lists ${code} twice.`,
      );
    seen.add(code);
  }
  for (const field of ['currency', 'reportingCurrency'] as const) {
    const code = value[field];
    if (typeof code === 'string' && !seen.has(code))
      throw new Error(
        `Invalid platform default: enabledCurrencies must include the ${field === 'currency' ? 'default' : 'reporting'} currency (${code}).`,
      );
  }
}

/**
 * The enabled currencies as lookup options, optionally narrowed by a search
 * term, plus `include` when it names a supported currency that is not enabled
 * — so a record carrying a since-disabled currency can still show its value
 * (marked `enabled: false`).
 */
export function describeEnabledCurrencies(
  platformDefaults: unknown,
  options: { include?: string; search?: string } = {},
): PlatformCurrencyOption[] {
  const enabled = new Set(resolveEnabledCurrencyCodes(platformDefaults));
  const include = options.include?.trim().toUpperCase();
  const term = options.search?.trim().toLowerCase();

  return PLATFORM_CURRENCIES.filter(
    (currency) =>
      enabled.has(currency.code) || (include && currency.code === include),
  )
    .filter(
      (currency) =>
        !term ||
        currency.code.toLowerCase().includes(term) ||
        currency.name.toLowerCase().includes(term),
    )
    .map((currency) => ({
      value: currency.code,
      code: currency.code,
      name: currency.name,
      symbol: currency.symbol,
      decimals: currency.decimals,
      displayName: `${currency.code} - ${currency.name}`,
      enabled: enabled.has(currency.code),
    }));
}

export async function readPlatformDefaults(
  db: PlatformSettingReader | Prisma.TransactionClient,
): Promise<Record<string, unknown>> {
  const setting = await db.platformSetting.findUnique({
    where: { key: 'platform-defaults' },
    select: { value: true },
  });
  return isRecord(setting?.value) ? setting.value : {};
}

/**
 * Refuse a currency the platform has not enabled. Call only when the currency
 * is being chosen — on create, or when an update changes it.
 */
export async function assertCurrencyEnabled(
  db: PlatformSettingReader | Prisma.TransactionClient,
  code: string,
): Promise<void> {
  const normalized = code.trim().toUpperCase();
  const enabled = resolveEnabledCurrencyCodes(await readPlatformDefaults(db));
  if (enabled.includes(normalized)) return;
  const known = resolvePlatformCurrency(normalized);
  throw new AppError('PLATFORM_CURRENCY_NOT_ENABLED', {
    message: `${known ? `${known.code} (${known.name})` : normalized} is not an enabled platform currency.`,
    details: {
      fieldErrors: [
        {
          field: 'currencyCode',
          message: 'Choose an enabled currency.',
        },
      ],
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
