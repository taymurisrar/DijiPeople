export type SettingsCategoryKey = string;

export type SettingsPrimitiveValue = string | number | boolean | string[] | null;

export type SettingsMap = Record<
  SettingsCategoryKey,
  Record<string, SettingsPrimitiveValue>
>;

export type SettingsFieldConfig = {
  category: SettingsCategoryKey;
  key: string;
  label: string;
  description?: string;
  type:
    | "text"
    | "textarea"
    | "number"
    | "checkbox"
    | "select"
    | "multiselect"
    | "lookup"
    | "color"
    | "url"
    | "phone"
    | "logo-upload"
    | "email";

  options?: { label: string; value: string }[];
  lookupKey?: string;
  placeholder?: string;
};

export type SettingsSectionConfig = {
  title: string;
  description?: string;
  fields: SettingsFieldConfig[];
};
