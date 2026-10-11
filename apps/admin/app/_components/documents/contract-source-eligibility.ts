/*
 * Pure rules behind the "From record" mode of the Create Agreement launcher.
 *
 * Kept out of the component so they can be tested without a DOM (apps/admin
 * runs jest in `node`), and because they mirror an API contract —
 * `GET /contracts/template-eligibility` — whose shape is the thing most likely
 * to drift. The API is the authority on eligibility; nothing here decides
 * whether an agreement may be created, it only decides what to show before
 * the API is asked.
 */

export type SignerField = "name" | "title" | "email";

export type EligibilityField = {
  key: string;
  label: string;
  collectable: boolean;
};

export type TemplateEligibility = {
  templateId: string;
  name: string;
  contractType: string;
  eligible: boolean;
  status: "ELIGIBLE" | "NEEDS_SIGNER" | "INELIGIBLE";
  missingFields: EligibilityField[];
  unsupportedFields: string[];
};

export type SourceEligibility = {
  canCollectSigner: boolean;
  signer: Record<SignerField, string | null>;
  items: TemplateEligibility[];
};

/* Same three keys the API treats as collectable (COLLECTABLE_SIGNER_PLACEHOLDERS). */
const SIGNER_PLACEHOLDERS: Record<string, SignerField> = {
  "customer.primarySigner.name": "name",
  "customer.primarySigner.title": "title",
  "customer.primarySigner.email": "email",
};

export const SIGNER_FIELD_LABELS: Record<SignerField, string> = {
  name: "Signer name",
  title: "Signer title",
  email: "Signer email",
};

export const SIGNER_FIELD_LIMITS: Record<SignerField, number> = {
  name: 200,
  title: 200,
  email: 254,
};

/**
 * How a template appears in the picker for the chosen record. An ineligible
 * template stays listed but disabled, with the reason in its label — removing
 * it would leave the operator wondering where the template went.
 */
export function templateOptionState(item: TemplateEligibility): {
  disabled: boolean;
  label: string;
  reason: string | null;
} {
  if (item.status === "ELIGIBLE") {
    return { disabled: false, label: item.name, reason: null };
  }
  if (item.status === "NEEDS_SIGNER") {
    return {
      disabled: false,
      label: `${item.name} (signer required)`,
      reason: null,
    };
  }
  const reason = item.unsupportedFields.length
    ? `This record cannot supply ${fieldList(item.unsupportedFields)}.`
    : `Missing on the record: ${fieldList(
        item.missingFields.map((field) => field.label),
      )}.`;
  return {
    disabled: true,
    label: `${item.name} (not available for this record)`,
    reason,
  };
}

/** The signer inputs a template needs filled before it can be created. */
export function requiredSignerFields(
  item: TemplateEligibility | undefined,
): SignerField[] {
  if (!item || item.status !== "NEEDS_SIGNER") return [];
  return item.missingFields
    .filter((field) => field.collectable)
    .map((field) => SIGNER_PLACEHOLDERS[field.key])
    .filter((field): field is SignerField => Boolean(field));
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Client-side check of the signer inputs; the API validates again. */
export function signerErrors(
  required: SignerField[],
  values: Partial<Record<SignerField, string>>,
): Partial<Record<SignerField, string>> {
  const errors: Partial<Record<SignerField, string>> = {};
  for (const field of required) {
    const value = values[field]?.trim() ?? "";
    if (!value) {
      errors[field] = `${SIGNER_FIELD_LABELS[field]} is required.`;
    } else if (value.length > SIGNER_FIELD_LIMITS[field]) {
      errors[field] =
        `${SIGNER_FIELD_LABELS[field]} must be at most ${SIGNER_FIELD_LIMITS[field]} characters.`;
    } else if (field === "email" && !EMAIL_PATTERN.test(value)) {
      errors[field] = "Enter a valid signer email address.";
    }
  }
  return errors;
}

/**
 * A readable message from the API's standard error contract. The contract
 * puts the human sentence in `message` and each missing field in
 * `fieldErrors` / `details.missingFields`; showing only `message` hid which
 * fields were missing, and showing raw keys hid what they meant.
 */
export function describeContractApiError(
  payload: unknown,
  fallback: string,
): { message: string; fields: string[] } {
  if (!payload || typeof payload !== "object") {
    return { message: fallback, fields: [] };
  }
  const record = payload as Record<string, unknown>;
  const rawMessage = record.message;
  const message = Array.isArray(rawMessage)
    ? rawMessage.filter((item) => typeof item === "string").join(", ")
    : typeof rawMessage === "string" && rawMessage.trim()
      ? rawMessage
      : fallback;
  const details =
    record.details && typeof record.details === "object"
      ? (record.details as Record<string, unknown>)
      : {};
  const missing = Array.isArray(details.missingFields)
    ? details.missingFields
        .map((field) =>
          field && typeof field === "object"
            ? (field as Record<string, unknown>).label
            : null,
        )
        .filter((label): label is string => typeof label === "string")
    : [];
  const unsupported = Array.isArray(details.unsupportedFields)
    ? details.unsupportedFields.filter(
        (key): key is string => typeof key === "string",
      )
    : [];
  return {
    message: message || fallback,
    fields: [
      ...missing,
      ...unsupported.map((key) => `${key} (not available from this record)`),
    ],
  };
}

function fieldList(values: string[]) {
  const shown = values.slice(0, 3).join(", ");
  return values.length > 3 ? `${shown} and ${values.length - 3} more` : shown;
}
