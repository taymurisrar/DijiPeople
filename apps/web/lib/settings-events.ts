export const tenantSettingsChangedEvent = "dijipeople:tenant-settings-changed";

export type TenantSettingsChangedDetail = {
  categories: string[];
};

export function notifyTenantSettingsChanged(categories: string[]) {
  window.dispatchEvent(
    new CustomEvent<TenantSettingsChangedDetail>(tenantSettingsChangedEvent, {
      detail: { categories: Array.from(new Set(categories)) },
    }),
  );
}
