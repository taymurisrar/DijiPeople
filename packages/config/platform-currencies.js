/*
 * The currencies the platform supports, in one place.
 *
 * There were two lists: `apps/admin/lib/reference-data/platform-reference-data`
 * offered thirty-odd currencies to the operator, and
 * `services/api/src/common/reference-data/platform-reference-data` knew about
 * eight. Neither validated a currency code — partner and commission DTOs used
 * `@IsString() @MaxLength(3)`, which measures length and calls it a currency,
 * so `"5"`, `"X"` and `"ZZZ"` were all stored happily (BUG-1425). A partner
 * created through the console really does carry `currencyCode: "5"`.
 *
 * Validating against either list alone would have made the two disagree in a
 * way that rejects real input, so the catalog moves here — the one package both
 * the API and the admin app already depend on.
 *
 * Decimal places are part of the record because they are not all 2: the Gulf
 * dinars are 3, and JPY and KRW are 0. Formatting money by assuming 2 is how a
 * Kuwaiti Dinar becomes off by a factor of ten.
 */
const PLATFORM_CURRENCIES = [
  { code: "QAR", name: "Qatari Riyal", symbol: "ر.ق", decimals: 2 },
  { code: "SAR", name: "Saudi Riyal", symbol: "ر.س", decimals: 2 },
  { code: "AED", name: "UAE Dirham", symbol: "د.إ", decimals: 2 },
  { code: "BHD", name: "Bahraini Dinar", symbol: ".د.ب", decimals: 3 },
  { code: "KWD", name: "Kuwaiti Dinar", symbol: "د.ك", decimals: 3 },
  { code: "OMR", name: "Omani Rial", symbol: "ر.ع.", decimals: 3 },
  { code: "USD", name: "US Dollar", symbol: "$", decimals: 2 },
  { code: "GBP", name: "Pound Sterling", symbol: "£", decimals: 2 },
  { code: "EUR", name: "Euro", symbol: "€", decimals: 2 },
  { code: "PKR", name: "Pakistani Rupee", symbol: "₨", decimals: 2 },
  { code: "INR", name: "Indian Rupee", symbol: "₹", decimals: 2 },
  { code: "BDT", name: "Bangladeshi Taka", symbol: "৳", decimals: 2 },
  { code: "LKR", name: "Sri Lankan Rupee", symbol: "Rs", decimals: 2 },
  { code: "NPR", name: "Nepalese Rupee", symbol: "रू", decimals: 2 },
  { code: "PHP", name: "Philippine Peso", symbol: "₱", decimals: 2 },
  { code: "MYR", name: "Malaysian Ringgit", symbol: "RM", decimals: 2 },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$", decimals: 2 },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥", decimals: 2 },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", decimals: 0 },
  { code: "KRW", name: "South Korean Won", symbol: "₩", decimals: 0 },
  { code: "TRY", name: "Turkish Lira", symbol: "₺", decimals: 2 },
  { code: "EGP", name: "Egyptian Pound", symbol: "E£", decimals: 2 },
  { code: "ZAR", name: "South African Rand", symbol: "R", decimals: 2 },
  { code: "NGN", name: "Nigerian Naira", symbol: "₦", decimals: 2 },
  { code: "KES", name: "Kenyan Shilling", symbol: "KSh", decimals: 2 },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$", decimals: 2 },
  { code: "AUD", name: "Australian Dollar", symbol: "A$", decimals: 2 },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$", decimals: 2 },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF", decimals: 2 },
  { code: "SEK", name: "Swedish Krona", symbol: "kr", decimals: 2 },
  { code: "NOK", name: "Norwegian Krone", symbol: "kr", decimals: 2 },
  { code: "DKK", name: "Danish Krone", symbol: "kr", decimals: 2 },
  { code: "MXN", name: "Mexican Peso", symbol: "$", decimals: 2 },
  { code: "BRL", name: "Brazilian Real", symbol: "R$", decimals: 2 },
  { code: "ARS", name: "Argentine Peso", symbol: "$", decimals: 2 },
];

const PLATFORM_CURRENCY_CODES = PLATFORM_CURRENCIES.map(
  (currency) => currency.code,
);

const byCode = new Map(
  PLATFORM_CURRENCIES.map((currency) => [currency.code, currency]),
);

/** Whether a value is a currency this platform actually supports. */
function isSupportedCurrencyCode(value) {
  return typeof value === "string" && byCode.has(value);
}

/** The full record for a code, or null. Never throws on unknown input. */
function resolvePlatformCurrency(value) {
  return typeof value === "string" ? (byCode.get(value) ?? null) : null;
}

module.exports = {
  PLATFORM_CURRENCIES,
  PLATFORM_CURRENCY_CODES,
  isSupportedCurrencyCode,
  resolvePlatformCurrency,
};
