/*
 * Form option sets for the public request-a-demo form.
 *
 * This file also held `plans` (with a hardcoded `monthlyPriceUsd`),
 * `currencyOptions` (with hardcoded FX conversion rates), `valueItems` and
 * `industries`. All four were unreferenced, and the first two were a dormant
 * third source of pricing truth in the landing app — the same class of defect
 * as BUG-0028, waiting for someone to wire it up. They were removed in Wave 2
 * after proving zero importers.
 *
 * What remains is genuinely the form's own: option lists a visitor picks from.
 * Prices, currencies and plan contents come from the published commercial
 * configuration, never from here.
 */
/**
 * Contact details this site **publishes**, as opposed to illustrates.
 *
 * `phone` and `phonePlaceholder` are separate fields on purpose, and that
 * separation is the fix for BUG-1306. One constant used to serve both: the
 * example number shown inside the phone input, and the number published in the
 * footer of every page as a live `tel:` link. The value was
 * `+1 (312) 555-0184` — a US number, for a company that bills in QAR, from the
 * `555-01XX` block reserved for fictional use. It was correct as a placeholder
 * and had simply never been replaced for the other use.
 *
 * `phone: null` means "we do not publish a phone number", and every consumer
 * omits its row rather than rendering an empty one. Set it to a real, reachable
 * number in the market the site sells to and the rows come back on their own.
 * Do not put a placeholder here to fill the gap — a number nobody answers is
 * worse than no number, because a prospect spends a call finding out.
 */
export const contactInfo = {
  businessEmail: "hello@dijipeople.com",
  supportEmail: "support@dijipeople.com",
  phone: null as string | null,
  /** Illustrative only, never published. Qatar, matching the partner form. */
  phonePlaceholder: "+974 0000 0000",
} as const;

export const industryOptions = [
  "Healthcare",
  "IT / Software",
  "Recruitment",
  "Staffing",
  "Professional Services",
  "Other",
] as const;

export const companySizeOptions = [
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "500+",
] as const;

export const interestedPlanOptions = ["Starter", "Growth", "Enterprise"] as const;
