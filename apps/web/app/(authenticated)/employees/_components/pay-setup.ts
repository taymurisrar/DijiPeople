/*
 * TASK-0036 — the pure half of the employee Pay setup panel
 * (EmployeeCompensation, GET/PUT /employees/:id/compensation), kept apart from
 * the component so the rules that protect bank details can be tested.
 *
 * Bank and tax identifiers are shown masked and never posted back: a field is
 * sent only when the user types a new value, and the API keeps what it has for
 * any it is not sent (BUG-3154 wiring in employee-profiles.service.ts). Posting
 * the loaded value back would be harmless today, but it would put the
 * plaintext in every request body and would wipe the field the day the read
 * starts returning it masked.
 */

export type Compensation = {
  readonly basicSalary?: string | null;
  readonly payFrequency?: string | null;
  readonly effectiveDate?: string | null;
  readonly endDate?: string | null;
  readonly currency?: string | null;
  readonly payrollStatus?: string | null;
  readonly paymentMode?: string | null;
  readonly payrollGroup?: string | null;
  readonly bankName?: string | null;
  readonly bankAccountTitle?: string | null;
  readonly bankAccountNumber?: string | null;
  readonly bankIban?: string | null;
  readonly bankRoutingNumber?: string | null;
  readonly taxIdentifier?: string | null;
  readonly notes?: string | null;
  readonly customFields?: Record<string, unknown>;
};

export const SECRET_FIELDS = [
  ["bankAccountNumber", "Account number"],
  ["bankIban", "IBAN"],
  ["bankRoutingNumber", "Routing number"],
  ["taxIdentifier", "Tax identifier"],
] as const;

export type SecretKey = (typeof SECRET_FIELDS)[number][0];

const OPTIONAL_FIELDS = [
  "endDate",
  "currency",
  "payrollStatus",
  "paymentMode",
  "payrollGroup",
  "bankName",
  "bankAccountTitle",
  "notes",
] as const;

const text = (value: unknown) => (typeof value === "string" ? value : "");

/** The last four characters, the rest as dots; nothing for an empty value. */
export function maskedSecret(value: string | null | undefined) {
  if (!value) return "";
  return value.length <= 4
    ? "•".repeat(value.length)
    : `${"•".repeat(Math.min(8, value.length - 4))}${value.slice(-4)}`;
}

/** The editable (non-secret) values of a loaded record, as form strings. */
export function paySetupFormValues(
  record: Compensation | null,
): Record<string, string> {
  return {
    basicSalary: text(record?.basicSalary),
    payFrequency: text(record?.payFrequency) || "MONTHLY",
    effectiveDate: text(record?.effectiveDate).slice(0, 10),
    ...Object.fromEntries(
      OPTIONAL_FIELDS.map((key) => [
        key,
        key === "endDate"
          ? text(record?.endDate).slice(0, 10)
          : text(record?.[key]),
      ]),
    ),
  };
}

/** The PUT body: form values, typed secrets only, and the custom fields. */
export function paySetupSaveBody(
  form: Readonly<Record<string, string>>,
  secrets: Readonly<Partial<Record<SecretKey, string>>>,
  customFields: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    basicSalary: form.basicSalary,
    payFrequency: form.payFrequency,
    effectiveDate: form.effectiveDate,
    customFields,
  };
  for (const key of OPTIONAL_FIELDS) {
    if (form[key]) body[key] = form[key];
  }
  for (const [key] of SECRET_FIELDS) {
    const typed = secrets[key]?.trim();
    if (typed) body[key] = typed;
  }
  return body;
}
