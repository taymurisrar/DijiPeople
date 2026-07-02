"use client";

import type { ModuleDataAdapter } from "@/lib/runtime/module-data-adapter.types";

export function createTenantSettingsRuntimeAdapter(
  category: string,
): ModuleDataAdapter {
  const update = async (values: Readonly<Record<string, unknown>>) => {
    const response = await fetch(
      `/api/tenant-settings/${encodeURIComponent(category)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates: Object.entries(values).map(([key, value]) => ({
            category,
            key,
            value: value ?? null,
          })),
        }),
      },
    );
    const payload = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!response.ok)
      throw new Error(
        typeof payload.message === "string"
          ? payload.message
          : "Unable to save settings.",
      );
    return values;
  };
  return {
    async list() {
      return { records: [] };
    },
    async getById() {
      return {};
    },
    async create(_runtime, values) {
      return update(values);
    },
    async update(_runtime, _recordId, values) {
      return update(values);
    },
    async softDelete() {
      throw new Error("Tenant settings cannot be deleted.");
    },
    async assignOwner() {
      throw new Error("Tenant settings do not support ownership.");
    },
    async changeStatus() {
      throw new Error("Tenant settings do not support status changes.");
    },
    async exportRecord() {
      return null;
    },
    async exportList() {
      return null;
    },
    async getRelatedRecords() {
      throw new Error("Related settings are not configured.");
    },
    async createRelatedRecord() {
      throw new Error("Related settings are not configured.");
    },
    async updateRelatedRecord() {
      throw new Error("Related settings are not configured.");
    },
    async deleteRelatedRecord() {
      throw new Error("Related settings are not configured.");
    },
  };
}
