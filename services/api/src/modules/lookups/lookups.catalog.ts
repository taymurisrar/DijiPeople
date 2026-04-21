export const DEFAULT_COUNTRIES = [
  { code: 'US', name: 'United States', sortOrder: 10 },
  { code: 'SA', name: 'Saudi Arabia', sortOrder: 20 },
  { code: 'PK', name: 'Pakistan', sortOrder: 30 },
] as const;

export const DEFAULT_STATES = [
  { countryCode: 'US', code: 'CA', name: 'California', sortOrder: 10 },
  { countryCode: 'US', code: 'TX', name: 'Texas', sortOrder: 20 },
  { countryCode: 'US', code: 'NY', name: 'New York', sortOrder: 30 },
  { countryCode: 'SA', code: 'RIY', name: 'Riyadh', sortOrder: 10 },
  { countryCode: 'SA', code: 'MKK', name: 'Makkah', sortOrder: 20 },
  { countryCode: 'PK', code: 'PB', name: 'Punjab', sortOrder: 10 },
  { countryCode: 'PK', code: 'SD', name: 'Sindh', sortOrder: 20 },
] as const;

export const DEFAULT_CITIES = [
  { countryCode: 'US', stateCode: 'CA', name: 'San Francisco', sortOrder: 10 },
  { countryCode: 'US', stateCode: 'TX', name: 'Houston', sortOrder: 20 },
  { countryCode: 'US', stateCode: 'NY', name: 'New York City', sortOrder: 30 },
  { countryCode: 'SA', stateCode: 'RIY', name: 'Riyadh', sortOrder: 10 },
  { countryCode: 'SA', stateCode: 'MKK', name: 'Jeddah', sortOrder: 20 },
  { countryCode: 'PK', stateCode: 'PB', name: 'Lahore', sortOrder: 10 },
  { countryCode: 'PK', stateCode: 'SD', name: 'Karachi', sortOrder: 20 },
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
