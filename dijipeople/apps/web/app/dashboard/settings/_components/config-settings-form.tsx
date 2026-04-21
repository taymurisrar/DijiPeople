import {
  SettingsForm,
  type SettingsFieldConfig,
  type SettingsSectionConfig,
} from "@/app/components/settings";
import { TenantSettingsResponse } from "../types";

type ConfigSettingsFormProps = {
  initialSettings: TenantSettingsResponse;
  saveLabel?: string;
  sections: SettingsSectionConfig[];
};

export function ConfigSettingsForm({
  initialSettings,
  saveLabel,
  sections,
}: ConfigSettingsFormProps) {
  return (
    <SettingsForm
      initialSettings={initialSettings}
      saveLabel={saveLabel}
      sections={sections}
    />
  );
}

export type { SettingsFieldConfig, SettingsSectionConfig };
