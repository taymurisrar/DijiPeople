/**
 * English inflection and token-humanising helpers for anything a user reads.
 *
 * Three defects share one cause here, which is why the helpers share one file:
 *
 * - BUG-1964 — the settings adapter registry derived a singular label by
 *   deleting a trailing "s", so "Leave Policies" reached a page header as
 *   "LEAVE POLICIE" and a create action as "New Leave Policie". A declared
 *   singular always wins; this is only for the labels that never declared one.
 * - BUG-2009 — display labels fell through to the raw field key or the raw
 *   enum constant, so a customer read `sidebarActiveBackgroundColor` and
 *   `EMPLOYEE_SYSTEM_ACCESS_PROVISIONED`.
 *
 * Deliberately not a general pluralisation library. It handles the shapes this
 * product's labels actually take and leaves anything it does not recognise
 * alone, because returning the input unchanged is always safe and guessing is
 * not.
 */

/*
 * Irregular plurals that appear in this product's module and settings labels.
 * Keyed by the lowercased plural; the replacement preserves the source casing
 * of the first letter, so "People" and "people" both work.
 */
const IRREGULAR_PLURALS: ReadonlyMap<string, string> = new Map([
  ["people", "person"],
  ["children", "child"],
  ["men", "man"],
  ["women", "woman"],
  ["criteria", "criterion"],
  ["data", "data"],
  ["media", "media"],
  ["indices", "index"],
  ["matrices", "matrix"],
  ["appendices", "appendix"],
  ["taxes", "tax"],
  ["statuses", "status"],
  ["addresses", "address"],
  ["bonuses", "bonus"],
  ["buses", "bus"],
]);

/* Words that end in "s" and are already singular. Stripping the "s" is wrong. */
const UNCOUNTABLE_OR_SINGULAR = new Set([
  "status",
  "address",
  "access",
  "process",
  "business",
  "bonus",
  "campus",
  "class",
  "series",
  "species",
  "news",
  "settings",
  "analytics",
  "hr",
]);

/**
 * The singular of one word. Casing of the original is preserved for the
 * characters that survive; a word this does not recognise is returned as-is.
 */
function singularizeWord(word: string): string {
  if (!word) return word;

  const lower = word.toLowerCase();

  const irregular = IRREGULAR_PLURALS.get(lower);
  if (irregular) return matchCase(word, irregular);

  if (UNCOUNTABLE_OR_SINGULAR.has(lower)) return word;

  // "Policies" → "Policy", "Categories" → "Category". Never "Policie".
  if (/[^aeiou]ies$/i.test(word)) {
    return word.slice(0, -3) + matchCase(word.slice(-3, -2), "y");
  }

  /*
   * "Boxes", "Matches", "Wishes", "Buzzes", "Addresses" → drop the whole "es".
   * Note `ss` rather than a bare `s`: a plain "-ses" is ambiguous without a
   * dictionary ("buses" is "bus", "expenses" is "expense"), so the general
   * trailing-s rule below handles it and the handful that it gets wrong are
   * listed as irregulars instead of guessed at.
   */
  if (/(?:ss|x|z|ch|sh)es$/i.test(word)) return word.slice(0, -2);

  // A bare trailing "s" that is not "ss" and not "us"/"is".
  if (/[^su]s$/i.test(word)) return word.slice(0, -1);

  return word;
}

/**
 * The singular form of a label. Only the final word is inflected, because that
 * is where English carries the plural: "Leave Policies" → "Leave Policy",
 * "Employee Bank Accounts" → "Employee Bank Account".
 */
export function singularize(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return label;

  const match = /^(.*?)(\S+)(\s*)$/.exec(trimmed);
  if (!match) return label;

  const [, lead, lastWord, trail] = match;
  return `${lead}${singularizeWord(lastWord)}${trail}`;
}

/*
 * Short all-capital tokens that are acronyms rather than enum constants. These
 * are left alone: "USD" must not become "Usd". Anything with an underscore is
 * an enum constant regardless of length.
 */
const KNOWN_ACRONYMS = new Set([
  "IBAN",
  "SWIFT",
  "IFSC",
  "BIC",
  "PDF",
  "CSV",
  "XLSX",
  "HTML",
  "JSON",
  "HTTP",
  "HTTPS",
  "URL",
  "UUID",
  "API",
  "SLA",
  "RBAC",
  "PAYE",
  "GOSI",
  "WPS",
]);

const ENUM_TOKEN = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;

/** Whether a string looks like a stored enum constant rather than prose. */
export function looksLikeEnumToken(value: string): boolean {
  const trimmed = value.trim();
  if (!ENUM_TOKEN.test(trimmed)) return false;
  if (trimmed.includes("_")) return true;
  // A single all-capital word: a currency or country code is more likely than
  // an enum below four characters, and a known acronym never is one.
  return trimmed.length >= 4 && !KNOWN_ACRONYMS.has(trimmed);
}

/**
 * A stored enum constant as a human phrase.
 * `EMPLOYEE_SYSTEM_ACCESS_PROVISIONED` → "Employee system access provisioned".
 * `DRAFT` → "Draft". Anything that is not an enum token is returned unchanged.
 */
export function humanizeEnumValue(value: string): string {
  if (!looksLikeEnumToken(value)) return value;

  const words = value.trim().toLowerCase().split("_").filter(Boolean);
  if (!words.length) return value;

  return words[0].charAt(0).toUpperCase() + words[0].slice(1) +
    (words.length > 1 ? ` ${words.slice(1).join(" ")}` : "");
}

/**
 * A camelCase or snake_case field key as a human label.
 * `sidebarActiveBackgroundColor` → "Sidebar active background color".
 * `attendanceDate` → "Attendance date".
 */
export function humanizeFieldKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim();

  if (!spaced) return key;

  const lowered = spaced
    .split(/\s+/)
    .map((word) => (word === word.toUpperCase() && word.length <= 4 ? word : word.toLowerCase()))
    .join(" ");

  return lowered.charAt(0).toUpperCase() + lowered.slice(1);
}

function matchCase(source: string, replacement: string): string {
  if (!source) return replacement;
  return source[0] === source[0].toUpperCase()
    ? replacement.charAt(0).toUpperCase() + replacement.slice(1)
    : replacement;
}
