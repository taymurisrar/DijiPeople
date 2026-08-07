/**
 * Field and module descriptors that drive import templates, column mapping and
 * validation.
 *
 * Descriptors are derived from the generated platform runtime schema rather
 * than hand-written lists, so a field added to a module becomes importable
 * without touching this feature.
 */

export type ImportFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'dateTime'
  | 'enum'
  | 'lookup'
  | 'json';

/** How a lookup column in the file is matched to an existing record. */
export type LookupMatchKey =
  | 'id'
  | 'code'
  | 'employeeNumber'
  | 'email'
  | 'name';

export type ImportFieldDescriptor = {
  /** Stable machine identifier used as the template's column key. */
  key: string;
  /** Human label shown in the template header and mapping UI. */
  label: string;
  type: ImportFieldType;
  required: boolean;
  maxLength?: number;
  /** Allowed values for enum fields. */
  allowedValues?: readonly string[];
  /** Target model for lookup fields. */
  lookupModel?: string;
  /** Accepted match keys, most specific first. */
  lookupMatchKeys?: readonly LookupMatchKey[];
  expectedFormat?: string;
  exampleValue?: string;
  validationNotes?: string;
  /** Alternative header spellings accepted during automatic mapping. */
  aliases?: readonly string[];
  /** Present but never writable from a file; shown so users understand why. */
  readOnly: boolean;
};

export type DataModuleDescriptor = {
  moduleKey: string;
  label: string;
  /** Model name in the generated runtime schema. */
  modelName: string;
  /** Fields that may be supplied in an import file. */
  importFields: ImportFieldDescriptor[];
  /** Fields deliberately excluded, with the reason, for the Instructions sheet. */
  excludedFields: Array<{ key: string; reason: string }>;
  /** Keys usable to match an existing record when updating. */
  matchingKeys: readonly string[];
  supportsImport: boolean;
  supportsExport: boolean;
};
