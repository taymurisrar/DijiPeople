/*
 * Turning a stored value into something a person reads.
 *
 * The previous humaniser lowercased the whole string, replaced every hyphen and
 * underscore with a space, then capitalised each word. That destroys two things
 * it should not touch (BUG-1753):
 *
 *   - **Acronyms.** `IT / Software` became `It / Software`, `NDA` became `Nda`.
 *   - **Ranges.** A company size of `11-50` became `11 50`, which reads as two
 *     numbers rather than one range.
 *
 * Display only — the values submitted and stored were always correct — but it
 * appeared in every dropdown in the console.
 *
 * The record proposing the fix preferred explicit spellings over a cleverer
 * general rule, and it is right: no amount of heuristic tells you that
 * `linkedin` is `LinkedIn` and `whatsapp` is `WhatsApp` while `facebook` is
 * `Facebook`. So there is a table for the words that have a canonical spelling
 * and ordinary title-casing for everything else.
 */

/**
 * Words whose capitalisation is not derivable, keyed by their lowercase form.
 *
 * Deliberately short. Every entry is a word this product actually stores — a
 * general-purpose acronym list would start capitalising things that are not
 * acronyms in context, and `IT` versus `it` is exactly that hazard.
 */
const CANONICAL_SPELLINGS: Record<string, string> = {
  api: "API",
  b2b: "B2B",
  b2c: "B2C",
  ceo: "CEO",
  cfo: "CFO",
  crm: "CRM",
  cto: "CTO",
  erp: "ERP",
  faq: "FAQ",
  gcc: "GCC",
  hr: "HR",
  hrm: "HRM",
  id: "ID",
  it: "IT",
  kpi: "KPI",
  ksa: "KSA",
  kyc: "KYC",
  linkedin: "LinkedIn",
  mou: "MoU",
  nda: "NDA",
  poc: "POC",
  qr: "QR",
  roi: "ROI",
  saas: "SaaS",
  sla: "SLA",
  sme: "SME",
  smtp: "SMTP",
  sms: "SMS",
  uae: "UAE",
  url: "URL",
  vat: "VAT",
  vip: "VIP",
  whatsapp: "WhatsApp",
};

/**
 * A hyphen between two digits joins them; anywhere else it separates words.
 *
 * `11-50` is one value and `PARTNER-REFERRED` is two words. Splitting on every
 * hyphen turned the first into "11 50".
 */
function splitSeparators(value: string): string {
  return value.replaceAll("_", " ").replace(/(?<![0-9])-(?![0-9])/g, " ");
}

function capitalizeWord(word: string): string {
  const canonical = CANONICAL_SPELLINGS[word.toLowerCase()];
  if (canonical) return canonical;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Display text for a stored enum value, lookup key or similar.
 *
 * Words are split on whitespace and on separators that are not joining digits,
 * then capitalised — canonically where this product has a canonical spelling.
 * Punctuation the value already carries, such as the slash in `IT / Software`,
 * is preserved rather than treated as a word boundary to be normalised away.
 */
export function humanizeLabel(value: string): string {
  if (!value) return value;
  return splitSeparators(value)
    .split(/(\s+)/)
    .map((segment) =>
      /^\s+$/.test(segment)
        ? segment
        : segment
            // A segment may itself carry punctuation — "IT/Software" — so each
            // alphanumeric run is capitalised where it sits rather than the
            // segment being rebuilt around a guess at its shape.
            .replace(/[A-Za-z0-9]+/g, (word) => capitalizeWord(word)),
    )
    .join("")
    .trim();
}
