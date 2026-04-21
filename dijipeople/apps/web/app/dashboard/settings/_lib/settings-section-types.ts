// app/dashboard/settings/_lib/settings-section-types.ts
export type SettingsFieldType =
  | "text"
  | "textarea"
  | "number"
  | "checkbox"
  | "select"
  | "lookup"
  | "email"
  | "phone"
  | "url"
  | "color"
  | "date";

export type SettingsOption = {
  label: string;
  value: string;
};

export type SettingsFieldConfig = {
  category: string;
  key: string;
  label: string;
  type: SettingsFieldType;
  description?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  options?: SettingsOption[];
  lookupKey?: string;
  min?: number;
  max?: number;
  step?: number;
};

export type SettingsSectionConfig = {
  title: string;
  description?: string;
  fields: SettingsFieldConfig[];
};