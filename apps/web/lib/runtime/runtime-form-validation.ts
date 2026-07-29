import type {
  EntityMetadata,
  FieldMetadata,
  FormFieldMetadata,
  FormMetadata,
} from "./metadata-runtime.types";
import {
  isValidRuntimeDateValue,
  normalizeRuntimeDateValue,
} from "./runtime-date-value";

export type RuntimeFieldValue =
  | string
  | number
  | boolean
  | readonly string[]
  | readonly Record<string, unknown>[]
  | Record<string, unknown>
  | null
  | undefined;

export type RuntimeFormValues = Readonly<Record<string, RuntimeFieldValue>>;

export interface RuntimeFormValidationResult {
  readonly isValid: boolean;
  readonly errors: Record<string, string[]>;
}

export function validateRuntimeForm({
  entity,
  form,
  values,
}: {
  readonly entity: EntityMetadata;
  readonly form: FormMetadata;
  readonly values: RuntimeFormValues;
}): RuntimeFormValidationResult {
  const fieldsByName = new Map(
    entity.fields.map((field) => [field.logicalName, field]),
  );
  const errors: Record<string, string[]> = {};

  for (const formField of visibleFormFields(form)) {
    const field = fieldsByName.get(formField.fieldLogicalName);
    if (!field || shouldSkipField(field)) continue;

    const fieldErrors = validateField({
      field,
      formField,
      value: values[field.logicalName],
    });

    if (fieldErrors.length) {
      errors[field.logicalName] = fieldErrors;
    }
  }

  mergeFieldErrors(
    errors,
    validateCrossFieldRules({
      entity,
      values,
    }),
  );

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

function validateCrossFieldRules({
  entity,
  values,
}: {
  readonly entity: EntityMetadata;
  readonly values: RuntimeFormValues;
}) {
  if (isPayComponentEntity(entity)) {
    return validatePayComponentRules(values);
  }

  if (isPayrollCycleEntity(entity)) {
    return validatePayrollCycleRules(values);
  }

  return {};
}

function validatePayrollCycleRules(values: RuntimeFormValues) {
  const errors: Record<string, string[]> = {};
  if (
    isValidRuntimeDateValue(values.periodStart) &&
    isValidRuntimeDateValue(values.periodEnd) &&
    normalizeRuntimeDateValue(values.periodEnd) <
      normalizeRuntimeDateValue(values.periodStart)
  ) {
    addFieldError(
      errors,
      "periodEnd",
      "Period End must be on or after Period Start.",
    );
  }
  return errors;
}

function isPayrollCycleEntity(entity: EntityMetadata) {
  return [entity.logicalName, entity.collectionName, entity.routeBase]
    .filter((value): value is string => typeof value === "string")
    .some((value) => {
      const normalized = value.toLowerCase();
      return (
        normalized.includes("payrollcycle") ||
        normalized.includes("payroll-cycle") ||
        normalized.includes("payroll_cycles")
      );
    });
}

function validatePayComponentRules(values: RuntimeFormValues) {
  const errors: Record<string, string[]> = {};
  const calculationMethod = stringValue(values.calculationMethod);

  if (calculationMethod === "FIXED" && isEmptyValue(values.fixedAmount)) {
    addFieldError(
      errors,
      "fixedAmount",
      "Fixed calculation requires Fixed Amount.",
    );
  }

  if (calculationMethod === "PERCENTAGE") {
    const hasFormulaExpression = !isEmptyValue(values.formulaExpression);
    if (!hasFormulaExpression) {
      if (isEmptyValue(values.percentage)) {
        addFieldError(
          errors,
          "percentage",
          "Percentage calculation requires Percentage Value.",
        );
      }

      if (isEmptyValue(values.percentageBaseComponentId)) {
        addFieldError(
          errors,
          "percentageBaseComponentId",
          "Percentage calculation requires Percentage Base Component.",
        );
      }
    }
  }

  if (
    calculationMethod === "FORMULA" &&
    isEmptyValue(values.formulaExpression)
  ) {
    addFieldError(
      errors,
      "formulaExpression",
      "Formula calculation requires Formula Expression.",
    );
  }

  return errors;
}

function isPayComponentEntity(entity: EntityMetadata) {
  return [
    entity.logicalName,
    entity.collectionName,
    entity.routeBase,
    entity.defaultFormLogicalName,
  ]
    .filter((value): value is string => typeof value === "string")
    .some((value) => {
      const normalized = value.toLowerCase();
      return (
        normalized.includes("paycomponent") ||
        normalized.includes("pay-component") ||
        normalized.includes("pay_components") ||
        normalized.includes("pay-components")
      );
    });
}

function mergeFieldErrors(
  target: Record<string, string[]>,
  source: Record<string, string[]>,
) {
  for (const [fieldName, messages] of Object.entries(source)) {
    target[fieldName] = [...(target[fieldName] ?? []), ...messages];
  }
}

function addFieldError(
  errors: Record<string, string[]>,
  fieldName: string,
  message: string,
) {
  errors[fieldName] = [...(errors[fieldName] ?? []), message];
}

export function mapBackendFieldErrors({
  errors,
  fieldMap = {},
}: {
  readonly errors: unknown;
  readonly fieldMap?: Readonly<Record<string, string>>;
}): Record<string, string[]> {
  const mapped: Record<string, string[]> = {};

  if (!errors || typeof errors !== "object") return mapped;

  if (Array.isArray(errors)) {
    for (const item of errors) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const record = item as Record<string, unknown>;
      const fieldName = stringValue(record.field) ?? stringValue(record.path);
      const message = stringValue(record.message) ?? stringValue(record.error);
      if (!fieldName || !message) continue;
      const runtimeField = fieldMap[fieldName] ?? fieldName;
      mapped[runtimeField] = [...(mapped[runtimeField] ?? []), message];
    }
    return mapped;
  }

  for (const [fieldName, messages] of Object.entries(
    errors as Record<string, unknown>,
  )) {
    const runtimeField = fieldMap[fieldName] ?? fieldName;
    const normalizedMessages = Array.isArray(messages)
      ? messages.map(String)
      : [String(messages)];

    mapped[runtimeField] = [
      ...(mapped[runtimeField] ?? []),
      ...normalizedMessages,
    ];
  }

  return mapped;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function validateField({
  field,
  formField,
  value,
}: {
  readonly field: FieldMetadata;
  readonly formField: FormFieldMetadata;
  readonly value: RuntimeFieldValue;
}) {
  const errors: string[] = [];
  const label = formField.label ?? field.displayName;
  const required =
    formField.requirementLevel === "required" ||
    field.requirementLevel === "required";
  const stringValue = typeof value === "string" ? value.trim() : "";

  if (required && isEmptyValue(value)) {
    errors.push(`${label} is required.`);
  }

  if (stringValue) {
    if (field.minLength && stringValue.length < field.minLength) {
      errors.push(`${label} must be at least ${field.minLength} characters.`);
    }

    if (field.maxLength && stringValue.length > field.maxLength) {
      errors.push(`${label} must be ${field.maxLength} characters or fewer.`);
    }

    if (field.dataType === "email" && !isValidEmail(stringValue)) {
      errors.push(`${label} must be a valid email address.`);
    }

    if (field.pattern) {
      const pattern = new RegExp(field.pattern);
      if (!pattern.test(stringValue)) {
        errors.push(`${label} has an invalid format.`);
      }
    }
  }

  if (
    !isEmptyValue(value) &&
    (field.dataType === "lookup" || field.dataType === "optionset") &&
    typeof value !== "string"
  ) {
    errors.push(`${label} must be selected from the available options.`);
  }

  if (!isEmptyValue(value) && field.dataType === "date") {
    if (!isValidRuntimeDateValue(value)) {
      errors.push(`${label} must be a valid date.`);
    }
  }

  if (
    !isEmptyValue(value) &&
    (field.dataType === "number" ||
      field.dataType === "decimal" ||
      field.dataType === "currency")
  ) {
    const numericValue =
      typeof value === "number"
        ? value
        : typeof value === "string"
          ? Number(value)
          : Number.NaN;
    if (!Number.isFinite(numericValue)) {
      errors.push(`${label} must be a valid number.`);
    } else if (field.dataType === "number" && !Number.isInteger(numericValue)) {
      errors.push(`${label} must be a whole number.`);
    }
  }

  if (typeof value === "number") {
    if (field.min !== undefined && value < field.min) {
      errors.push(`${label} must be at least ${field.min}.`);
    }

    if (field.max !== undefined && value > field.max) {
      errors.push(`${label} must be no more than ${field.max}.`);
    }
  }

  return errors;
}

function visibleFormFields(form: FormMetadata) {
  return form.sections
    .filter((section) => !section.visibilityRuleKey)
    .flatMap((section) =>
      section.fields.filter(
        (field) => field.isVisible !== false && !field.visibilityRuleKey,
      ),
    );
}

function shouldSkipField(field: FieldMetadata) {
  return Boolean(
    field.autoGenerated &&
    field.lockedByDefault &&
    field.defaultValue === undefined &&
    field.formatSource,
  );
}

function isEmptyValue(value: RuntimeFieldValue) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
