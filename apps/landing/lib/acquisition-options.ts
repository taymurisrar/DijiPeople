/**
 * Option values for the public acquisition forms.
 *
 * These mirror the backend enums the values are persisted as. They are typed
 * here as a literal union so a value the database cannot store fails the build
 * rather than the visitor's submission — the label text is presentation, but the
 * `value` is a contract.
 *
 * Interest areas are deliberately **not** listed here. Those are DijiPeople
 * modules, and the authoritative list is the feature catalogue the commercial
 * config API already serves. Keeping a second copy in the landing app is what
 * Wave 2 removed.
 *
 * The API validates everything again regardless: this file makes the form
 * offer the right things, it does not make the submission trustworthy.
 */

export type AcquisitionOption<Value extends string = string> = {
  value: Value;
  label: string;
};

export type LeadInquiryIntentValue =
  | "REQUEST_DEMO"
  | "PRICING"
  | "PRODUCT_FEATURES"
  | "IMPLEMENTATION"
  | "PAYROLL"
  | "ATTENDANCE_INTEGRATION"
  | "DATA_MIGRATION"
  | "INTEGRATION"
  | "PARTNERSHIP"
  | "EXISTING_CUSTOMER_SUPPORT"
  | "GENERAL"
  | "OTHER";

/** Ordered by how often they occur, so common cases need no scrolling. */
export const INQUIRY_INTENT_OPTIONS: readonly AcquisitionOption<LeadInquiryIntentValue>[] =
  [
    { value: "REQUEST_DEMO", label: "Request a demo" },
    { value: "PRICING", label: "Pricing or subscription" },
    { value: "PRODUCT_FEATURES", label: "Product or features" },
    { value: "IMPLEMENTATION", label: "Implementation or onboarding" },
    { value: "PAYROLL", label: "Payroll" },
    { value: "ATTENDANCE_INTEGRATION", label: "Attendance or biometric devices" },
    { value: "DATA_MIGRATION", label: "Moving our existing data" },
    { value: "INTEGRATION", label: "Integrating with our systems" },
    { value: "PARTNERSHIP", label: "Partnership" },
    {
      value: "EXISTING_CUSTOMER_SUPPORT",
      label: "I am already a customer and need help",
    },
    { value: "GENERAL", label: "Something else" },
    { value: "OTHER", label: "Other" },
  ] as const;

export type PartnershipModelValue =
  | "REFERRAL"
  | "RESELLER"
  | "IMPLEMENTATION"
  | "TECHNOLOGY"
  | "STRATEGIC"
  | "CONSULTANT"
  | "OTHER";

export const PARTNERSHIP_MODEL_OPTIONS: readonly AcquisitionOption<PartnershipModelValue>[] =
  [
    { value: "REFERRAL", label: "Referral partner" },
    { value: "RESELLER", label: "Reseller or sales partner" },
    { value: "IMPLEMENTATION", label: "Implementation partner" },
    { value: "TECHNOLOGY", label: "Technology or integration partner" },
    { value: "STRATEGIC", label: "Strategic partner" },
    { value: "CONSULTANT", label: "Consultant or independent advisor" },
    { value: "OTHER", label: "Something else" },
  ] as const;

export const COMPANY_SIZE_OPTIONS: readonly AcquisitionOption[] = [
  { value: "1-10", label: "1–10 employees" },
  { value: "11-50", label: "11–50 employees" },
  { value: "51-200", label: "51–200 employees" },
  { value: "201-500", label: "201–500 employees" },
  { value: "500+", label: "More than 500 employees" },
] as const;

/**
 * Attribution read from the page the visitor is on.
 *
 * Captured rather than asked, and every value stays absent when it is absent —
 * defaulting a UTM parameter would attribute organic traffic to a campaign
 * nobody ran. Runs client-side because that is where the referrer and the query
 * string are; the server records the correlation id and the notice version.
 */
export type AcquisitionAttribution = {
  sourcePage?: string;
  referrerUrl?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
};

const UTM_KEYS = [
  ["utm_source", "utmSource"],
  ["utm_medium", "utmMedium"],
  ["utm_campaign", "utmCampaign"],
  ["utm_content", "utmContent"],
  ["utm_term", "utmTerm"],
] as const;

/** Bounded so a crafted URL cannot post an oversized value through the form. */
const MAX_ATTRIBUTION_LENGTH = 120;

export function readAttribution(): AcquisitionAttribution {
  if (typeof window === "undefined") return {};

  const params = new URLSearchParams(window.location.search);
  const attribution: AcquisitionAttribution = {
    sourcePage: window.location.pathname.slice(0, 200),
  };

  for (const [param, key] of UTM_KEYS) {
    const value = params.get(param)?.trim();
    if (value) attribution[key] = value.slice(0, MAX_ATTRIBUTION_LENGTH);
  }

  // Only an external referrer is informative; our own pages are already covered
  // by sourcePage, and recording them would drown the real acquisition signal.
  const referrer = document.referrer;
  if (referrer && !referrer.startsWith(window.location.origin)) {
    attribution.referrerUrl = referrer.slice(0, 500);
  }

  return attribution;
}

/**
 * Context a Wave 2 CTA may pass in, e.g. /plans linking to /contact for a
 * sales-assisted plan.
 *
 * Validated against the known options rather than trusted — a query parameter
 * is visitor-controlled, and an unrecognised value resolves to "" rather than
 * being passed through. Takes the value as an argument so the server component
 * can resolve it from searchParams before render.
 */
export function resolveIntentParam(
  requested?: string | string[] | null,
): LeadInquiryIntentValue | "" {
  const candidate = (Array.isArray(requested) ? requested[0] : requested)
    ?.trim()
    .toUpperCase();

  const match = INQUIRY_INTENT_OPTIONS.find(
    (option) => option.value === candidate,
  );
  return match ? match.value : "";
}

/**
 * Country options, persisted as ISO 3166-1 alpha-2 codes.
 *
 * A literal list is acceptable here in a way it is not for prices or features:
 * ISO country codes are stable universal reference data, not commercial truth
 * DijiPeople decides. The rule this respects is that the *code* is persisted —
 * the previous form accepted free text, so a Lead could arrive with a country
 * of "ds".
 *
 * Ordered with the launch and planned-expansion markets first, then
 * alphabetically. That is a convenience for the people most likely to be
 * filling this in, not a statement about where DijiPeople sells — market
 * availability is Wave 1 configuration, and a visitor from anywhere may ask a
 * question.
 */
export const COUNTRY_OPTIONS: readonly AcquisitionOption[] = [
  { value: "PK", label: "Pakistan" },
  { value: "AE", label: "United Arab Emirates" },
  { value: "SA", label: "Saudi Arabia" },
  { value: "QA", label: "Qatar" },
  { value: "KW", label: "Kuwait" },
  { value: "BH", label: "Bahrain" },
  { value: "OM", label: "Oman" },
  { value: "US", label: "United States" },
  { value: "GB", label: "United Kingdom" },
  { value: "AU", label: "Australia" },
  { value: "BD", label: "Bangladesh" },
  { value: "CA", label: "Canada" },
  { value: "DE", label: "Germany" },
  { value: "EG", label: "Egypt" },
  { value: "ES", label: "Spain" },
  { value: "FR", label: "France" },
  { value: "IN", label: "India" },
  { value: "ID", label: "Indonesia" },
  { value: "IE", label: "Ireland" },
  { value: "IT", label: "Italy" },
  { value: "JO", label: "Jordan" },
  { value: "KE", label: "Kenya" },
  { value: "LK", label: "Sri Lanka" },
  { value: "MY", label: "Malaysia" },
  { value: "NG", label: "Nigeria" },
  { value: "NL", label: "Netherlands" },
  { value: "NZ", label: "New Zealand" },
  { value: "PH", label: "Philippines" },
  { value: "SG", label: "Singapore" },
  { value: "ZA", label: "South Africa" },
  { value: "TR", label: "Türkiye" },
  { value: "OTHER", label: "Somewhere else" },
] as const;
