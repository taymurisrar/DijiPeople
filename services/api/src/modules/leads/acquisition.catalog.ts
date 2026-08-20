import { LeadInquiryIntent, PartnershipModel } from '@prisma/client';

/**
 * Option values for the public acquisition forms.
 *
 * The backend owns these because the values are persisted as enums — a public
 * form offering an option the database cannot store is a validation failure the
 * visitor cannot fix. Serving them from here means the form and the column
 * cannot drift.
 *
 * What this file deliberately does **not** own:
 *   - **Interest areas.** Those are DijiPeople modules, and the authoritative
 *     list is the tenant feature catalogue the product gates on. Duplicating it
 *     here would create the second stale module list Wave 2 removed.
 *   - **Countries.** Already owned by shared reference data.
 *   - **Company sizes.** A display band, not a persisted enum.
 */

export type AcquisitionOption = {
  value: string;
  label: string;
};

/**
 * Why someone is getting in touch.
 *
 * Ordered by how often they occur rather than alphabetically or by enum
 * declaration order, so the common cases are reachable without scrolling.
 * `OTHER` stays last.
 */
export const LEAD_INQUIRY_INTENT_OPTIONS: readonly AcquisitionOption[] = [
  { value: LeadInquiryIntent.REQUEST_DEMO, label: 'Request a demo' },
  { value: LeadInquiryIntent.PRICING, label: 'Pricing or subscription' },
  { value: LeadInquiryIntent.PRODUCT_FEATURES, label: 'Product or features' },
  {
    value: LeadInquiryIntent.IMPLEMENTATION,
    label: 'Implementation or onboarding',
  },
  { value: LeadInquiryIntent.PAYROLL, label: 'Payroll' },
  {
    value: LeadInquiryIntent.ATTENDANCE_INTEGRATION,
    label: 'Attendance or biometric devices',
  },
  {
    value: LeadInquiryIntent.DATA_MIGRATION,
    label: 'Moving our existing data',
  },
  {
    value: LeadInquiryIntent.INTEGRATION,
    label: 'Integrating with our systems',
  },
  { value: LeadInquiryIntent.PARTNERSHIP, label: 'Partnership' },
  {
    value: LeadInquiryIntent.EXISTING_CUSTOMER_SUPPORT,
    label: 'I am already a customer and need help',
  },
  { value: LeadInquiryIntent.GENERAL, label: 'Something else' },
  { value: LeadInquiryIntent.OTHER, label: 'Other' },
] as const;

/** How an organisation wants to work with DijiPeople. */
export const PARTNERSHIP_MODEL_OPTIONS: readonly AcquisitionOption[] = [
  { value: PartnershipModel.REFERRAL, label: 'Referral partner' },
  { value: PartnershipModel.RESELLER, label: 'Reseller or sales partner' },
  { value: PartnershipModel.IMPLEMENTATION, label: 'Implementation partner' },
  {
    value: PartnershipModel.TECHNOLOGY,
    label: 'Technology or integration partner',
  },
  { value: PartnershipModel.STRATEGIC, label: 'Strategic partner' },
  {
    value: PartnershipModel.CONSULTANT,
    label: 'Consultant or independent advisor',
  },
  { value: PartnershipModel.OTHER, label: 'Something else' },
] as const;

/**
 * Company size bands.
 *
 * A display band rather than a persisted enum — the column is free text, and
 * the exact headcount that matters commercially is `estimatedEmployeeCount`.
 * Listed here only so the form and any future Admin filter agree on the bands.
 */
export const COMPANY_SIZE_OPTIONS: readonly AcquisitionOption[] = [
  { value: '1-10', label: '1–10 employees' },
  { value: '11-50', label: '11–50 employees' },
  { value: '51-200', label: '51–200 employees' },
  { value: '201-500', label: '201–500 employees' },
  { value: '500+', label: 'More than 500 employees' },
] as const;

const INTENT_VALUES = new Set<string>(
  LEAD_INQUIRY_INTENT_OPTIONS.map((option) => option.value),
);
const PARTNERSHIP_VALUES = new Set<string>(
  PARTNERSHIP_MODEL_OPTIONS.map((option) => option.value),
);

export function isLeadInquiryIntent(
  value: unknown,
): value is LeadInquiryIntent {
  return typeof value === 'string' && INTENT_VALUES.has(value);
}

export function isPartnershipModel(value: unknown): value is PartnershipModel {
  return typeof value === 'string' && PARTNERSHIP_VALUES.has(value);
}

/**
 * The privacy notice version a submission is recorded against.
 *
 * A constant for now, because the versioned legal-document system is Wave 4.
 * The point of storing it at all is that when that system arrives, submissions
 * made today already carry which notice they were shown — so nothing has to be
 * backfilled with a guess. Bump this whenever the notice wording changes.
 */
export const CURRENT_PRIVACY_NOTICE_VERSION = '2026-08-16';

/**
 * The marketing-consent wording a submission is recorded against.
 *
 * Deliberately separate from the privacy notice version. They are different
 * agreements that change on different schedules: rewriting the privacy notice
 * does not re-ask anyone for permission to email them, and changing the opt-in
 * wording says nothing about data handling. One shared version would make each
 * look as though it invalidated the other.
 *
 * Bump this when the opt-in wording changes. Existing `GRANTED` records keep the
 * version they were given under, which is the whole point of storing it.
 */
export const CURRENT_MARKETING_CONSENT_VERSION = '2026-08-18';
