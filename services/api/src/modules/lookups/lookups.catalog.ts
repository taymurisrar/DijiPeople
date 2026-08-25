/**
 * The markets DijiPeople sells to, pinned to the top of every country picker.
 *
 * `sortOrder` is **negative on purpose**, and the sign is the whole design.
 * `Country.sortOrder` defaults to `0`, and `listCountries` orders by
 * `[{ sortOrder: 'asc' }, { name: 'asc' }]` — so a negative band sorts ahead of
 * every ISO-imported country, those tie at `0`, and the tiebreak falls through
 * to alphabetical. Priority order and alphabetical order can no longer collide,
 * because they no longer share a range.
 *
 * These were `10, 20, … 80` (BUG-1305). The ISO import separately numbered all
 * 250 countries `0…249` by alphabetical position, so the two writers filled the
 * same space: `sortOrder: 10` was held by both Argentina and the United States,
 * and the eight markets that matter most scattered into the middle of the list —
 * "United States" rendered between Argentina and Armenia. Nothing threw, and the
 * picker looked oddly sorted rather than broken.
 *
 * Keep these contiguous and negative. Do not renumber them into positives to
 * "tidy" them: that reintroduces the collision the moment the ISO set loads.
 */
export const DEFAULT_COUNTRIES = [
  { code: 'US', name: 'United States', sortOrder: -8 },
  { code: 'SA', name: 'Saudi Arabia', sortOrder: -7 },
  { code: 'PK', name: 'Pakistan', sortOrder: -6 },
  { code: 'QA', name: 'Qatar', sortOrder: -5 },
  { code: 'AE', name: 'United Arab Emirates', sortOrder: -4 },
  { code: 'IN', name: 'India', sortOrder: -3 },
  { code: 'GB', name: 'United Kingdom', sortOrder: -2 },
  { code: 'CA', name: 'Canada', sortOrder: -1 },
] as const;

export const CURRENCY_OPTIONS = [
  { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2 },
  { code: 'QAR', name: 'Qatari Riyal', symbol: 'QR', decimals: 2 },
  { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimals: 2 },
  { code: 'AED', name: 'UAE Dirham', symbol: 'AED', decimals: 2 },
  { code: 'PKR', name: 'Pakistani Rupee', symbol: 'Rs', decimals: 2 },
  { code: 'INR', name: 'Indian Rupee', symbol: 'Rs', decimals: 2 },
  { code: 'GBP', name: 'Pound Sterling', symbol: 'GBP', decimals: 2 },
  { code: 'EUR', name: 'Euro', symbol: 'EUR', decimals: 2 },
] as const;

export const DEFAULT_STATES = [
  { countryCode: 'US', code: 'CA', name: 'California', sortOrder: 10 },
  { countryCode: 'US', code: 'TX', name: 'Texas', sortOrder: 20 },
  { countryCode: 'US', code: 'NY', name: 'New York', sortOrder: 30 },
  { countryCode: 'SA', code: 'RIY', name: 'Riyadh', sortOrder: 10 },
  { countryCode: 'SA', code: 'MKK', name: 'Makkah', sortOrder: 20 },
  { countryCode: 'PK', code: 'PB', name: 'Punjab', sortOrder: 10 },
  { countryCode: 'PK', code: 'SD', name: 'Sindh', sortOrder: 20 },
  { countryCode: 'QA', code: 'DA', name: 'Doha', sortOrder: 10 },
  { countryCode: 'QA', code: 'RA', name: 'Al Rayyan', sortOrder: 20 },
  { countryCode: 'AE', code: 'DU', name: 'Dubai', sortOrder: 10 },
  { countryCode: 'AE', code: 'AZ', name: 'Abu Dhabi', sortOrder: 20 },
  { countryCode: 'IN', code: 'MH', name: 'Maharashtra', sortOrder: 10 },
  { countryCode: 'IN', code: 'KA', name: 'Karnataka', sortOrder: 20 },
  { countryCode: 'GB', code: 'ENG', name: 'England', sortOrder: 10 },
  { countryCode: 'GB', code: 'SCT', name: 'Scotland', sortOrder: 20 },
  { countryCode: 'CA', code: 'ON', name: 'Ontario', sortOrder: 10 },
  { countryCode: 'CA', code: 'BC', name: 'British Columbia', sortOrder: 20 },
] as const;

export const DEFAULT_CITIES = [
  { countryCode: 'US', stateCode: 'CA', name: 'San Francisco', sortOrder: 10 },
  { countryCode: 'US', stateCode: 'TX', name: 'Houston', sortOrder: 20 },
  { countryCode: 'US', stateCode: 'NY', name: 'New York City', sortOrder: 30 },
  { countryCode: 'SA', stateCode: 'RIY', name: 'Riyadh', sortOrder: 10 },
  { countryCode: 'SA', stateCode: 'MKK', name: 'Jeddah', sortOrder: 20 },
  { countryCode: 'PK', stateCode: 'PB', name: 'Lahore', sortOrder: 10 },
  { countryCode: 'PK', stateCode: 'SD', name: 'Karachi', sortOrder: 20 },
  { countryCode: 'QA', stateCode: 'DA', name: 'Doha', sortOrder: 10 },
  { countryCode: 'QA', stateCode: 'RA', name: 'Al Rayyan', sortOrder: 20 },
  { countryCode: 'AE', stateCode: 'DU', name: 'Dubai', sortOrder: 10 },
  { countryCode: 'AE', stateCode: 'AZ', name: 'Abu Dhabi', sortOrder: 20 },
  { countryCode: 'IN', stateCode: 'MH', name: 'Mumbai', sortOrder: 10 },
  { countryCode: 'IN', stateCode: 'KA', name: 'Bengaluru', sortOrder: 20 },
  { countryCode: 'GB', stateCode: 'ENG', name: 'London', sortOrder: 10 },
  { countryCode: 'GB', stateCode: 'SCT', name: 'Edinburgh', sortOrder: 20 },
  { countryCode: 'CA', stateCode: 'ON', name: 'Toronto', sortOrder: 10 },
  { countryCode: 'CA', stateCode: 'BC', name: 'Vancouver', sortOrder: 20 },
] as const;

export const DEFAULT_DOCUMENT_TYPES = [
  { key: 'cnic', name: 'CNIC' },
  { key: 'passport', name: 'Passport' },
  { key: 'rent-agreement', name: 'Rent Agreement' },
  { key: 'resume', name: 'CV / Resume' },
  { key: 'leave-attachment', name: 'Leave Attachment' },
  { key: 'medical-certificate', name: 'Medical Certificate' },
  { key: 'payslip', name: 'Payslip' },
  { key: 'salary-revision-letter', name: 'Salary Revision Letter' },
  { key: 'affidavit', name: 'Affidavit' },
  { key: 'degree-certificate', name: 'Degree Certificate' },
  { key: 'experience-letter', name: 'Experience Letter' },
  { key: 'employment-contract', name: 'Employment Contract' },
  { key: 'visa-copy', name: 'Visa Copy' },
  { key: 'invoice', name: 'Invoice' },
  { key: 'policy-document', name: 'Policy Document' },
  { key: 'other', name: 'Other' },
] as const;

export const DEFAULT_DOCUMENT_CATEGORIES = [
  { code: 'identity-documents', name: 'Identity Documents' },
  { code: 'employment-documents', name: 'Employment Documents' },
  { code: 'payroll-documents', name: 'Payroll Documents' },
  { code: 'leave-documents', name: 'Leave Documents' },
  { code: 'recruitment-documents', name: 'Recruitment Documents' },
  { code: 'education-documents', name: 'Education Documents' },
  { code: 'legal-compliance', name: 'Legal / Compliance' },
  { code: 'financial-billing', name: 'Financial / Billing' },
  { code: 'branding-assets', name: 'Branding Assets' },
  { code: 'other', name: 'Other' },
] as const;

export const DEFAULT_RELATION_TYPES = [
  { key: 'parent', name: 'Parent' },
  { key: 'spouse', name: 'Spouse' },
  { key: 'sibling', name: 'Sibling' },
  { key: 'child', name: 'Child' },
  { key: 'friend', name: 'Friend' },
  { key: 'other', name: 'Other' },
] as const;
