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
export const contactInfo = {
  businessEmail: "hello@dijipeople.com",
  supportEmail: "support@dijipeople.com",
  phone: "+1 (312) 555-0184",
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
