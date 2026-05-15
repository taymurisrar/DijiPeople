import type {
  SettingsFieldConfig,
  SettingsSectionConfig,
} from "./settings-section-types";
import type { TenantSettingsResponse, TenantSettingsValue } from "../types";

export function getSettingValue(
  settings: TenantSettingsResponse,
  field: SettingsFieldConfig,
): TenantSettingsValue {
  return settings?.[field.category as keyof TenantSettingsResponse]?.[field.key] ?? null;
}

export function buildSettingsPayload(
  values: Record<string, TenantSettingsValue>,
  sections: SettingsSectionConfig[],
) {
  const payload: Record<string, Record<string, TenantSettingsValue>> = {};

  for (const section of sections) {
    for (const field of section.fields) {
      const compositeKey = `${field.category}.${field.key}`;
      if (!payload[field.category]) {
        payload[field.category] = {};
      }
      payload[field.category][field.key] = values[compositeKey] ?? null;
    }
  }

  return payload;
}