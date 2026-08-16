#!/usr/bin/env node
/**
 * INVARIANT — no country-to-currency or country-to-price mapping in frontend
 * source.
 *
 * ITEM-0021. BUG-0028 was a country-to-currency lookup table compiled into the
 * landing bundle: a visitor in the UAE was quoted in AED because an array in a
 * React component said so, while the authoritative answer lived in `Market`.
 * The table is gone and a comment at the site says not to bring it back — but a
 * comment is not a gate, and nothing stopped the next person adding
 * `if (country === "AE") return "AED"` to a component.
 *
 * What makes this checkable is that the frontend has no legitimate reason to
 * *decide* a currency at all. It renders what the API resolved from the market
 * configuration. So a currency code sitting next to a country code in shipped
 * frontend source is, on its own, the defect — no interpretation needed.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const APPS = ["landing", "web", "admin"];

/** ISO-4217 codes the product actually quotes in, plus the usual suspects. */
const CURRENCY = /\b(USD|AED|SAR|PKR|EUR|GBP|INR|QAR|KWD|BHD|OMR)\b/;
/** An ISO-3166 alpha-2 literal in a comparison or a map key. */
const COUNTRY_COMPARISON =
  /(country|countryCode|region)\s*(===?|==|\.startsWith\(|\.includes\()\s*["'][A-Z]{2}["']/;
/** A map literal keyed by country code with a currency value. */
const COUNTRY_CURRENCY_MAP =
  /["']?[A-Z]{2}["']?\s*:\s*["'](USD|AED|SAR|PKR|EUR|GBP|INR|QAR|KWD|BHD|OMR)["']/;

/**
 * Files allowed to name a currency, each with the reason.
 *
 * Naming a currency is fine — rendering "AED 120" requires it. What is banned is
 * *deciding* one from a country.
 */
const ALLOWLIST = new Map();

function walk(dir) {
  const found = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) found.push(full);
  }
  return found;
}

const offenders = [];
const seen = new Set();
let scanned = 0;

for (const app of APPS) {
  for (const file of walk(join(ROOT, "apps", app))) {
    scanned += 1;
    const rel = relative(ROOT, file).split(sep).join("/");

    const lines = readFileSync(file, "utf8")
      .split(/\r?\n/)
      // A comment explaining the ban is not the ban being broken.
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line));

    const hit = lines.find(
      (line) =>
        COUNTRY_CURRENCY_MAP.test(line) ||
        (COUNTRY_COMPARISON.test(line) && CURRENCY.test(line)),
    );
    if (!hit) continue;

    seen.add(rel);
    if (ALLOWLIST.has(rel)) continue;
    offenders.push(`${rel} — ${hit.trim().slice(0, 90)}`);
  }
}

if (scanned < 100) {
  console.error(
    `check-no-commercial-literals: only ${scanned} files scanned — the walk is wrong.`,
  );
  process.exit(1);
}

for (const entry of ALLOWLIST.keys()) {
  if (!seen.has(entry)) {
    console.error(
      `check-no-commercial-literals: allowlist entry no longer matches anything: ${entry}\n` +
        "Remove it — a stale exemption hides the next real one.",
    );
    process.exit(1);
  }
}

if (offenders.length > 0) {
  console.error(
    `check-no-commercial-literals: ${offenders.length} frontend file(s) derive a\n` +
      "currency or price from a country code. The frontend renders what the API\n" +
      "resolved from Market configuration; it does not decide. See BUG-0028.\n",
  );
  for (const offender of offenders) console.error(`  ${offender}`);
  process.exit(1);
}

console.log(
  `check-no-commercial-literals: ${scanned} files scanned, no country-derived ` +
    `currency logic (${ALLOWLIST.size} allowlisted).`,
);
