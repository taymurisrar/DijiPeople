"use client";

import type { ModuleDataAdapter } from "@/lib/runtime/module-data-adapter.types";
import { notifyTenantSettingsChanged } from "@/lib/settings-events";

export function createTenantSettingsRuntimeAdapter({
  canEditTenantSlug = false,
  defaultCategory,
  fieldCategories = {},
  lookupApiPaths = {},
  multiValueFields = [],
}: {
  canEditTenantSlug?: boolean;
  defaultCategory: string;
  fieldCategories?: Readonly<Record<string, string>>;
  lookupApiPaths?: Readonly<Record<string, string>>;
  multiValueFields?: readonly string[];
}): ModuleDataAdapter {
  const multiValueFieldSet = new Set(multiValueFields);
  const supportedSettingKeys = new Set(Object.keys(fieldCategories));
  const update = async (values: Readonly<Record<string, unknown>>) => {
    const { tenantSlug, settingsValues } = splitTenantSettingsValues(
      values,
      supportedSettingKeys,
    );
    let savedTenantSlug: string | null = null;

    if (
      canEditTenantSlug &&
      typeof tenantSlug === "string" &&
      tenantSlug.trim()
    ) {
      const slugResponse = await fetch("/api/tenants/current/slug", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: tenantSlug.trim().toLowerCase() }),
      });
      const slugPayload = (await slugResponse.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;

      if (!slugResponse.ok) {
        throw new Error(
          typeof slugPayload.message === "string"
            ? slugPayload.message
            : "Unable to save tenant slug.",
        );
      }

      savedTenantSlug =
        typeof slugPayload.slug === "string" ? slugPayload.slug : tenantSlug;
    }

    const updates = Object.entries(settingsValues).map(([key, value]) => ({
      category: fieldCategories[key] ?? defaultCategory,
      key,
      value: value ?? null,
    }));

    if (updates.length === 0) {
      return {
        ...values,
        tenantSlug: savedTenantSlug ?? tenantSlug ?? "",
      };
    }

    const response = await fetch("/api/tenant-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates }),
    });
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
    /*
     * BUG-0046(b) — this path wrote to the database and told the running app
     * nothing, so date format, timezone, currency, density and theme changed and
     * then sat there until a full page reload.
     *
     * `settings-form.tsx` has always announced its saves on this event and the
     * providers have always listened; this adapter simply never joined in, which
     * is why the same setting appeared to work from one screen and not another.
     * It reports the categories that actually changed, so a listener can decide
     * whether it cares rather than refetching everything on every save.
     */
    notifyTenantSettingsChanged(updates.map((update) => update.category));

    const settingsPayload =
      payload.settings &&
      typeof payload.settings === "object" &&
      !Array.isArray(payload.settings)
        ? (payload.settings as Record<string, unknown>)
        : null;

    return settingsPayload
      ? {
          ...flattenSettingsPayload({
            defaultCategory,
            fieldCategories,
            multiValueFields: multiValueFieldSet,
            settings: settingsPayload,
          }),
          tenantSlug: savedTenantSlug ?? tenantSlug ?? "",
        }
      : values;
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
    async getLookupOptions(_runtime, field, values) {
      const path = lookupApiPaths[field.logicalName];
      if (!path) return [];

      const params = new URLSearchParams();
      const dependencyValue =
        field.dependsOnFieldId && values ? values[field.dependsOnFieldId] : null;

      if (
        field.dependencyFilterKey &&
        dependencyValue !== null &&
        dependencyValue !== undefined &&
        String(dependencyValue).trim()
      ) {
        params.set(field.dependencyFilterKey, String(dependencyValue));
      }

      const requestPath = params.size
        ? `${path}${path.includes("?") ? "&" : "?"}${params.toString()}`
        : path;
      const data = await requestJson(requestPath);

      return readLookupRecords(data).flatMap((record) => {
        const code = stringValue(record.code);
        const value = stringValue(record.value);
        const recordId = stringValue(record.id);
        const id = value || code || recordId;
        const name =
          stringValue(record.name) || stringValue(record.label) || value || code;

        return id && name ? [{ id, name, code, key: recordId || null }] : [];
      });
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

async function requestJson(path: string) {
  const response = await fetch(path, {
    headers: { Accept: "application/json" },
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data && typeof data === "object" && !Array.isArray(data)
        ? stringValue((data as Record<string, unknown>).message) ||
          stringValue((data as Record<string, unknown>).error)
        : "";
    throw new Error(message || `Request failed with ${response.status}.`);
  }

  return data;
}

function readLookupRecords(data: unknown): readonly Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.filter(isRecord);
  }

  if (!isRecord(data)) return [];

  const items = data.items;
  if (Array.isArray(items)) return items.filter(isRecord);

  const options = data.options;
  if (Array.isArray(options)) return options.filter(isRecord);

  const records = data.records;
  if (Array.isArray(records)) return records.filter(isRecord);

  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function splitTenantSettingsValues(
  values: Readonly<Record<string, unknown>>,
  supportedSettingKeys: ReadonlySet<string>,
) {
  const settingsValues: Record<string, unknown> = {};
  let tenantSlug: unknown;

  Object.entries(values).forEach(([key, value]) => {
    if (key === "tenantSlug") {
      tenantSlug = value;
      return;
    }

    // Runtime records can carry presentation metadata and calculated values.
    // Only fields declared by the settings metadata are valid tenant settings.
    if (supportedSettingKeys.has(key)) {
      settingsValues[key] = value;
    }
  });

  return { tenantSlug, settingsValues };
}

function flattenSettingsPayload({
  defaultCategory,
  fieldCategories,
  multiValueFields,
  settings,
}: {
  defaultCategory: string;
  fieldCategories: Readonly<Record<string, string>>;
  multiValueFields: ReadonlySet<string>;
  settings: Readonly<Record<string, unknown>>;
}) {
  const flattened: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(fieldCategories)]);

  Object.entries(settings).forEach(([category, values]) => {
    if (!values || typeof values !== "object" || Array.isArray(values)) return;
    Object.keys(values).forEach((key) => {
      if ((fieldCategories[key] ?? defaultCategory) === category) {
        keys.add(key);
      }
    });
  });

  keys.forEach((key) => {
    const category = fieldCategories[key] ?? defaultCategory;
    const categorySettings = settings[category];
    if (
      categorySettings &&
      typeof categorySettings === "object" &&
      !Array.isArray(categorySettings)
    ) {
      flattened[key] = normalizeSavedValue(
        key,
        (categorySettings as Record<string, unknown>)[key],
        multiValueFields,
      );
    }
  });

  return flattened;
}

function normalizeSavedValue(
  key: string,
  value: unknown,
  multiValueFields: ReadonlySet<string>,
) {
  if (!multiValueFields.has(key)) return value;

  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
