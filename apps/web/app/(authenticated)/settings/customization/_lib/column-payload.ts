/*
 * The request body the Add field / Edit field dialog sends.
 *
 * BUG-3492 — the dialog sent `maxLength: null` for every field type that has
 * no length (choice, reference, number, date, boolean) and for a text field
 * whose length was left blank. The API treated `null` as a length below 1 and
 * refused the field, so choice and lookup fields could not be created at all.
 * A missing length is now simply absent from the payload.
 *
 * Kept free of imports on purpose: the API's seam test
 * (`services/api/src/modules/customization/column-payload.seam.spec.ts`)
 * transpiles this exact file and sends what it builds through the real DTO
 * validation and `CustomizationService.createColumn`, so the client payload and
 * the server validator are tested against each other rather than each against a
 * description of the other.
 */

export type ColumnChoiceOption = {
  label: string;
  value: string;
  active: boolean;
};

export type ColumnPayloadInput = {
  mode: "create" | "edit";
  columnKey: string;
  displayName: string;
  fieldType: string;
  isRequired: boolean;
  isVisible: boolean;
  isSearchable: boolean;
  isFilterable: boolean;
  isSortable: boolean;
  maxLength: number | null;
  defaultValue: string;
  lookupTargetTableKey: string;
  options: readonly ColumnChoiceOption[];
  sortOrder: number | null;
};

const LENGTH_FIELD_TYPES = ["text", "multilineText", "email", "phone"];

export function supportsMaxLength(fieldType: string) {
  return LENGTH_FIELD_TYPES.includes(fieldType);
}

export function apiFieldType(value: string) {
  const map: Record<string, string> = {
    reference: "lookup",
    choice: "select",
    multilineText: "textarea",
  };

  return map[value] ?? value;
}

export function buildColumnPayload(input: ColumnPayloadInput) {
  const payload: Record<string, unknown> = {
    displayName: input.displayName.trim(),
    fieldType: apiFieldType(input.fieldType),
    isRequired: input.isRequired,
    isVisible: input.isVisible,
    isSearchable: input.isSearchable,
    isFilterable: input.isFilterable,
    isSortable: input.isSortable,
    sortOrder: input.sortOrder ?? 0,
  };

  if (supportsMaxLength(input.fieldType) && input.maxLength !== null) {
    payload.maxLength = input.maxLength;
  }
  if (input.defaultValue) {
    payload.defaultValue = input.defaultValue;
  }
  if (input.fieldType === "reference" && input.lookupTargetTableKey) {
    payload.lookupTargetTableKey = input.lookupTargetTableKey;
  }
  if (input.fieldType === "choice") {
    payload.optionSetJson = { options: input.options };
  }

  if (input.mode === "create") {
    payload.columnKey = input.columnKey;
    payload.dataType = apiFieldType(input.fieldType);
  }

  return payload;
}
