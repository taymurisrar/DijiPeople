import {
  SettingsForm,
  type SettingsFieldConfig,
  type SettingsSectionConfig,
} from "@/app/components/settings";
import type { SettingsMap } from "@/app/components/settings/types";
import { TenantSettingsResponse } from "../types";

type WrappedTenantSettingsResponse = {
  settings?: unknown;
  categories?: string[];
};

type ConfigSettingsFormProps = {
  initialSettings: TenantSettingsResponse | WrappedTenantSettingsResponse;
  saveLabel?: string;
  sections: SettingsSectionConfig[];
};

export function ConfigSettingsForm({
  initialSettings,
  saveLabel,
  sections,
}: ConfigSettingsFormProps) {
  const settings = normalizeTenantSettings(initialSettings);

  return (
    <SettingsForm
      initialSettings={settings}
      saveLabel={saveLabel}
      sections={sections}
    />
  );
}

function normalizeTenantSettings(
  initialSettings: TenantSettingsResponse | WrappedTenantSettingsResponse,
): SettingsMap {
  const candidate =
    isRecord(initialSettings) && "settings" in initialSettings
      ? initialSettings.settings
      : initialSettings;

  if (!isRecord(candidate)) {
    return {};
  }

  const settings: SettingsMap = {};

  for (const [category, values] of Object.entries(candidate)) {
    if (!isRecord(values)) continue;

    settings[category] = {};

    for (const [key, value] of Object.entries(values)) {
      if (isSettingsPrimitiveValue(value)) {
        settings[category][key] = value;
      }
    }
  }

  return settings;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSettingsPrimitiveValue(
  value: unknown,
): value is SettingsMap[string][string] {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    (Array.isArray(value) &&
      value.every((entry) => typeof entry === "string"))
  );
}

export type { SettingsFieldConfig, SettingsSectionConfig };