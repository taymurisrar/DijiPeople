export const EMPLOYMENT_STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "PROBATION", label: "Probation" },
  { value: "NOTICE", label: "Notice" },
  { value: "TERMINATED", label: "Terminated" },
] as const;

export const EMPLOYEE_TYPE_OPTIONS = [
  { value: "", label: "Select employee type" },
  { value: "FULL_TIME", label: "Full-time" },
  { value: "PART_TIME", label: "Part-time" },
  { value: "CONTRACT", label: "Contract" },
  { value: "INTERN", label: "Intern" },
  { value: "CONSULTANT", label: "Consultant" },
] as const;

export const WORK_MODE_OPTIONS = [
  { value: "", label: "Select work mode" },
  { value: "OFFICE", label: "Office" },
  { value: "REMOTE", label: "Remote" },
  { value: "HYBRID", label: "Hybrid" },
] as const;

export const CONTRACT_TYPE_OPTIONS = [
  { value: "", label: "Select contract type" },
  { value: "PERMANENT", label: "Permanent" },
  { value: "FIXED_TERM", label: "Fixed term" },
  { value: "FREELANCE", label: "Freelance" },
  { value: "TEMPORARY", label: "Temporary" },
] as const;

export const PAY_FREQUENCY_OPTIONS = [
  { value: "MONTHLY", label: "MONTHLY" },
  { value: "SEMI_MONTHLY", label: "Semi-monthly" },
  { value: "BI_WEEKLY", label: "Bi-weekly" },
  { value: "WEEKLY", label: "Weekly" },
] as const;

export const PAYROLL_STATUS_OPTIONS = [
  { value: "Active", label: "Active" },
  { value: "ON_HOLD", label: "On hold" },
  { value: "STOPPED", label: "Stopped" },
] as const;

export const PAYMENT_MODE_OPTIONS = [
  { value: "", label: "Select payment mode" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CASH", label: "Cash" },
  { value: "CHECK", label: "Check" },
  { value: "OTHER", label: "Other" },
] as const;

export const GENDER_OPTIONS = [
  { value: "", label: "Select gender" },
  { value: "FEMALE", label: "Female" },
  { value: "MALE", label: "Male" },
  { value: "PREFER_NOT_TO_SAY", label: "Prefer not to say" },
] as const;

export const MARITAL_STATUS_OPTIONS = [
  { value: "", label: "Select marital status" },
  { value: "SINGLE", label: "Single" },
  { value: "MARRIED", label: "Married" },
  { value: "DIVORCED", label: "Divorced" },
  { value: "WIDOWED", label: "Widowed" },
  { value: "SEPARATED", label: "Separated" },
] as const;

export const BLOOD_GROUP_OPTIONS = [
  { value: "", label: "Select blood group" },
  { value: "A+", label: "A+" },
  { value: "A-", label: "A-" },
  { value: "B+", label: "B+" },
  { value: "B-", label: "B-" },
  { value: "AB+", label: "AB+" },
  { value: "AB-", label: "AB-" },
  { value: "O+", label: "O+" },
  { value: "O-", label: "O-" },
] as const;
