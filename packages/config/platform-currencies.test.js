const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const {
  PLATFORM_CURRENCIES,
  PLATFORM_CURRENCY_CODES,
  isSupportedCurrencyCode,
  resolvePlatformCurrency,
} = require("./platform-currencies");

/*
 * BUG-1425. `currencyCode` was validated as `@IsString() @MaxLength(3)`, which
 * accepts `"5"`, `"X"` and `"ZZZ"` and rejects `"NOT_A_CURRENCY"` only for its
 * length. The catalog these assertions guard is what replaced that.
 */

test("rejects the values MaxLength(3) used to accept", () => {
  for (const value of ["5", "X", "ZZZ", "", "qar", "US", "  "]) {
    assert.equal(
      isSupportedCurrencyCode(value),
      false,
      `${JSON.stringify(value)} must not be a currency`,
    );
  }
});

test("accepts the currencies the platform actually sells in", () => {
  for (const code of ["QAR", "SAR", "AED", "USD", "GBP", "EUR", "PKR"]) {
    assert.equal(isSupportedCurrencyCode(code), true, code);
  }
});

test("never throws on non-string input", () => {
  for (const value of [null, undefined, 5, {}, [], true]) {
    assert.equal(isSupportedCurrencyCode(value), false);
    assert.equal(resolvePlatformCurrency(value), null);
  }
});

test("every code is ISO-4217 shaped and unique", () => {
  const seen = new Set();
  for (const currency of PLATFORM_CURRENCIES) {
    assert.match(currency.code, /^[A-Z]{3}$/);
    assert.equal(seen.has(currency.code), false, `duplicate ${currency.code}`);
    seen.add(currency.code);
    assert.ok(currency.name.length > 0, `${currency.code} needs a name`);
    assert.ok(
      [0, 2, 3].includes(currency.decimals),
      `${currency.code} has implausible decimals ${currency.decimals}`,
    );
  }
  assert.equal(PLATFORM_CURRENCY_CODES.length, PLATFORM_CURRENCIES.length);
});

test("the minor units that are not 2 are right", () => {
  // Getting these wrong misprices by a factor of ten or a hundred.
  assert.equal(resolvePlatformCurrency("KWD").decimals, 3);
  assert.equal(resolvePlatformCurrency("BHD").decimals, 3);
  assert.equal(resolvePlatformCurrency("OMR").decimals, 3);
  assert.equal(resolvePlatformCurrency("JPY").decimals, 0);
  assert.equal(resolvePlatformCurrency("KRW").decimals, 0);
  assert.equal(resolvePlatformCurrency("USD").decimals, 2);
});

/*
 * The declared union and the runtime array are written in two files, so they
 * are the one place this catalog can still fall out of step with itself.
 */
test("index.d.ts declares exactly the codes the module exports", () => {
  const types = readFileSync(join(__dirname, "index.d.ts"), "utf8");
  const block = types.slice(
    types.indexOf("export type PlatformCurrencyCode ="),
    types.indexOf(";", types.indexOf("export type PlatformCurrencyCode =")),
  );
  const declared = [...block.matchAll(/"([A-Z]{3})"/g)].map((m) => m[1]);
  assert.deepEqual(
    [...declared].sort(),
    [...PLATFORM_CURRENCY_CODES].sort(),
    "PlatformCurrencyCode in index.d.ts and PLATFORM_CURRENCIES disagree",
  );
});
