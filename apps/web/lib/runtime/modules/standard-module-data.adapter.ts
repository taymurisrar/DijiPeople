"use client";

import type {
  ModuleDataAdapter,
  RelatedRecordMutationInput,
  RelatedRecordsInput,
} from "../module-data-adapter.types";
import type {
  FieldMetadata,
  RelatedSubgridMetadata,
} from "../metadata-runtime.types";
import { relatedRecordPaths } from "../related-record-api";
import { debugRuntime } from "../runtime-debug";
import { normalizeRuntimeDateValue } from "../runtime-date-value";
import type { StandardModuleRuntimeSpec } from "./standard-module-runtime";
import {
  buildLocationPayload,
  captureAttendanceLocation,
} from "@/lib/location/location-capture";

type RuntimeRecord = Readonly<Record<string, unknown>>;

export function createStandardModuleDataAdapter(
  spec: StandardModuleRuntimeSpec,
): ModuleDataAdapter<RuntimeRecord, RuntimeRecord> {
  const basePath = spec.apiPath ?? `/api${spec.routeBase}`;
  const { path: baseResourcePath, params: baseQueryParams } =
    splitPathAndQuery(basePath);
  const createPath = spec.createApiPath ?? baseResourcePath;
  const updatePath = spec.updateApiPath;

  return {
    ...(spec.moduleKey === "leaves"
      ? {
          commandHandlers: {
            "leave.approve": async (context) => {
              if (!context.recordId) {
                return { ok: false, errors: ["No Leave record is selected."] };
              }
              const result = await requestJson(
                `${basePath}/${encodeURIComponent(context.recordId)}/approve`,
                { method: "POST", body: JSON.stringify({}) },
              );
              return {
                ok: true,
                data: result,
                message: "Leave request approved.",
                invalidateCacheKeys: context.runtime.cacheKeys,
              };
            },
            "leave.reject": async (context) => {
              if (!context.recordId) {
                return { ok: false, errors: ["No Leave record is selected."] };
              }
              const result = await requestJson(
                `${basePath}/${encodeURIComponent(context.recordId)}/reject`,
                { method: "POST", body: JSON.stringify({}) },
              );
              return {
                ok: true,
                data: result,
                message: "Leave request rejected.",
                invalidateCacheKeys: context.runtime.cacheKeys,
              };
            },
          },
        }
      : {}),
    ...(spec.moduleKey === "timesheets"
      ? {
          commandHandlers: {
            "system.new": () => ({
              ok: true,
              redirectTo: "/timesheets/new",
            }),
            "system.save": () => ({
              ok: false,
              message: "Use the monthly timesheet editor to save entries.",
            }),
            "system.saveAndClose": () => ({
              ok: false,
              message: "Use the monthly timesheet editor to save entries.",
            }),
          },
        }
      : {}),
    ...(spec.moduleKey === "attendance"
      ? {
          commandHandlers: {
            "attendance.checkIn": async (context) => {
              const payload = await buildAttendanceLocationPayload(
                "checkIn",
                context.payload,
                context.record,
              );
              const result = await requestJson("/api/attendance/check-in", {
                method: "POST",
                body: JSON.stringify(payload),
              });
              return {
                ok: true,
                data: result,
                message: "Checked in.",
                invalidateCacheKeys: context.runtime.cacheKeys,
              };
            },
            "attendance.checkOut": async (context) => {
              const payload = await buildAttendanceLocationPayload(
                "checkOut",
                context.payload,
                context.record,
              );
              const result = await requestJson("/api/attendance/check-out", {
                method: "POST",
                body: JSON.stringify(payload),
              });
              return {
                ok: true,
                data: result,
                message: "Checked out.",
                invalidateCacheKeys: context.runtime.cacheKeys,
              };
            },
            "attendance.correction": () => ({
              ok: true,
              redirectTo: "/attendance/corrections/new",
            }),
          },
        }
      : {}),
    ...(spec.moduleKey === "employee-bank-accounts"
      ? {
          commandHandlers: {
            "employeeBankAccounts.submitVerification": async (context) => {
              const recordId = requireRecordId(context.recordId);
              const result = await requestJson(
                `${basePath}/${encodeURIComponent(recordId)}/submit-verification`,
                { method: "POST", body: JSON.stringify({}) },
              );
              return {
                ok: true,
                data: result,
                message: "Bank account submitted for verification.",
                invalidateCacheKeys: context.runtime.cacheKeys,
              };
            },
            "employeeBankAccounts.verify": async (context) => {
              const recordId = requireRecordId(context.recordId);
              const result = await requestJson(
                `${basePath}/${encodeURIComponent(recordId)}/verify`,
                {
                  method: "POST",
                  body: JSON.stringify({ verificationStatus: "VERIFIED" }),
                },
              );
              return {
                ok: true,
                data: result,
                message: "Bank account verified.",
                invalidateCacheKeys: context.runtime.cacheKeys,
              };
            },
            "employeeBankAccounts.setPayroll": async (context) => {
              const recordId = requireRecordId(context.recordId);
              const result = await requestJson(
                `${basePath}/${encodeURIComponent(recordId)}/set-payroll`,
                { method: "POST", body: JSON.stringify({}) },
              );
              return {
                ok: true,
                data: result,
                message: "Bank account set as primary payroll account.",
                invalidateCacheKeys: context.runtime.cacheKeys,
              };
            },
          },
        }
      : {}),
    async list(input) {
      const params = new URLSearchParams(baseQueryParams);
      if (input.search) params.set("search", input.search);
      if (input.page) params.set("page", String(input.page));
      if (input.pageSize) params.set("pageSize", String(input.pageSize));

      const data = await requestJson(
        `${baseResourcePath}${queryString(params)}`,
      );
      const records = readRecordList(data);

      return {
        records,
        page:
          readNumber(data, "page") ?? readNestedNumber(data, "meta", "page"),
        pageSize:
          readNumber(data, "pageSize") ??
          readNestedNumber(data, "meta", "pageSize"),
        totalRecords:
          readNumber(data, "total") ??
          readNumber(data, "totalRecords") ??
          readNestedNumber(data, "meta", "total") ??
          records.length,
      };
    },

    async getById(_runtime, recordId) {
      return readRecord(
        await requestJson(
          `${baseResourcePath}/${encodeURIComponent(recordId)}`,
        ),
      );
    },

    async create(_runtime, values) {
      const payload = sanitizeStandardMutationValues(values, spec, "create");
      debugRuntime("Standard adapter create request", {
        moduleKey: spec.moduleKey,
        path: createPath,
        payload,
      });
      const record =
        readRecord(
          await requestJson(createPath, {
            body: JSON.stringify(payload),
            method: "POST",
          }),
        ) ?? payload;
      debugRuntime("Standard adapter create result", {
        moduleKey: spec.moduleKey,
        record,
      });
      return record;
    },

    async update(_runtime, recordId, values) {
      const path = recordPath(baseResourcePath, recordId, updatePath);
      const payload = sanitizeStandardMutationValues(values, spec, "update");
      debugRuntime("Standard adapter update request", {
        moduleKey: spec.moduleKey,
        recordId,
        path,
        payload,
      });
      const record =
        readRecord(
          await requestJson(path, {
            body: JSON.stringify(payload),
            method: "PATCH",
          }),
        ) ?? payload;
      debugRuntime("Standard adapter update result", {
        moduleKey: spec.moduleKey,
        recordId,
        record,
      });
      return record;
    },

    async softDelete(_runtime, recordIds) {
      if (recordIds.length === 0) return;

      if (recordIds.length > 1 && spec.moduleKey !== "attendance") {
        try {
          await requestJson(basePath, {
            method: "DELETE",
            body: JSON.stringify({ recordIds, ids: recordIds }),
          });
          return;
        } catch (error) {
          debugRuntime("Standard adapter bulk delete fallback", {
            moduleKey: spec.moduleKey,
            path: basePath,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      await Promise.all(
        recordIds.map((recordId) =>
          requestJson(`${basePath}/${encodeURIComponent(recordId)}`, {
            method: "DELETE",
          }),
        ),
      );
    },

    async assignOwner() {
      throw new Error(
        "Owner assignment is not configured for this module adapter.",
      );
    },

    async getOwnerOptions(_runtime, query = "") {
      const params = new URLSearchParams();
      if (query.trim()) params.set("search", query.trim());
      const data = await requestJson(`/api/users${queryString(params)}`);
      return readRecordList(data).flatMap((record) => {
        const id = stringValue(record.id) || stringValue(record.userId);
        const name =
          stringValue(record.name) ||
          [stringValue(record.firstName), stringValue(record.lastName)]
            .filter(Boolean)
            .join(" ") ||
          stringValue(record.email);
        if (!id || !name) return [];
        return [{ id, name, email: stringValue(record.email) || null }];
      });
    },

    ...(spec.lookupApiPaths
      ? {
          async getLookupOptions(_runtime, field, values) {
            const path = spec.lookupApiPaths?.[field.logicalName];
            if (!path) return [];
            const params = new URLSearchParams();
            const dependencyValue =
              field.dependsOnFieldId && values
                ? values[field.dependsOnFieldId]
                : null;

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
            let data: unknown;
            try {
              data = await requestJson(requestPath);
            } catch (error) {
              if (
                params.has("pageSize") &&
                isUnsupportedQueryParamError(error, "pageSize")
              ) {
                params.delete("pageSize");
                const fallbackPath = params.size
                  ? `${path}${path.includes("?") ? "&" : "?"}${params.toString()}`
                  : path;
                data = await requestJson(fallbackPath);
              } else {
                throw withLookupRequestContext(error, {
                  field: field.logicalName,
                  path: requestPath,
                });
              }
            }
            const selectedValue =
              values && values[field.logicalName] !== undefined
                ? String(values[field.logicalName] ?? "").trim()
                : "";
            const records = [...readRecordList(data)];
            if (
              selectedValue &&
              !records.some(
                (record) =>
                  stringValue(record.id) === selectedValue ||
                  stringValue(record.value) === selectedValue ||
                  stringValue(record.code) === selectedValue ||
                  stringValue(record.key) === selectedValue,
              )
            ) {
              try {
                const selectedRecord = readRecord(
                  await requestJson(
                    `${path.split("?")[0]}/${encodeURIComponent(selectedValue)}`,
                  ),
                );
                if (selectedRecord) records.unshift(selectedRecord);
              } catch (error) {
                debugRuntime(
                  "Standard adapter selected lookup fallback failed",
                  {
                    field: field.logicalName,
                    path,
                    selectedValue,
                    error:
                      error instanceof Error ? error.message : String(error),
                  },
                );
              }
            }

            return records.flatMap((record) => {
              const targetEntity = field.lookupTargets?.[0]?.entityLogicalName;
              const code =
                targetEntity === "employee"
                  ? stringValue(record.workEmail)
                  : typeof record.code === "string"
                    ? record.code
                    : "";
              const recordId = typeof record.id === "string" ? record.id : "";
              const value =
                typeof record.value === "string" ? record.value : "";
              const id =
                shouldUseLookupCodeAsValue(field.logicalName) && code
                  ? code
                  : recordId || value || code;
              const name = lookupDisplayName(record, field);
              const subtitle =
                targetEntity === "employee"
                  ? stringValue(record.workEmail)
                  : stringValue(record.subtitle);
              return id && name
                ? [{ id, name, code, key: recordId, subtitle }]
                : [];
            });
          },
        }
      : {}),

    async changeStatus() {
      throw new Error(
        "Dedicated status change is not configured for this module adapter.",
      );
    },

    async exportRecord() {
      return null;
    },

    async exportList() {
      return null;
    },

    async getRelatedRecords(input: RelatedRecordsInput) {
      const path = relatedRecordPaths(input).list;
      if (!path)
        throw new Error(
          `Related list ${input.subgrid.relationshipName} has no list API metadata.`,
        );
      const data = await requestJson(path);
      const records = readRecordList(data);
      return { records, totalRecords: records.length };
    },

    async createRelatedRecord(
      input: RelatedRecordMutationInput<RuntimeRecord>,
    ) {
      const { create: path, createConsumedParentId } = relatedRecordPaths(input);
      if (!path)
        throw new Error(
          `Related list ${input.subgrid.relationshipName} has no create API metadata.`,
        );
      const data = await requestJson(path, {
        method: "POST",
        body: JSON.stringify(
          withRelatedRecordDefaults(input.subgrid.relatedEntityLogicalName, {
            ...sanitizeRelatedMutationValues(input.values, input.subgrid),
            /*
             * BUG-2011 — the parent id goes in the body unless the path already
             * carried it. This used to ask `!input.subgrid.api`, which is
             * whether the subgrid was *configured*, not whether the configured
             * path consumed the parent id. A declared `api` block with a flat
             * `createPath` therefore sent it in neither place.
             */
            ...(!createConsumedParentId && input.parentLookupField
              ? { [input.parentLookupField]: input.parentRecordId }
              : {}),
          }),
        ),
      });
      return readRecord(data) ?? input.values;
    },

    async updateRelatedRecord(
      input: RelatedRecordMutationInput<Partial<RuntimeRecord>>,
    ) {
      const path = input.recordId
        ? relatedRecordPaths(input).record(input.recordId, "update")
        : undefined;
      if (!path)
        throw new Error(
          `Related list ${input.subgrid.relationshipName} has no update API metadata.`,
        );
      const data = await requestJson(path, {
        method: "PATCH",
        body: JSON.stringify(
          sanitizeRelatedMutationValues(input.values, input.subgrid),
        ),
      });
      return readRecord(data) ?? input.values;
    },

    async deleteRelatedRecord(input) {
      const paths = relatedRecordPaths(input);
      if (paths.bulkDelete) {
        await requestJson(paths.bulkDelete, {
          method: "DELETE",
          body: JSON.stringify({ recordIds: input.recordIds }),
        });
        return;
      }
      await Promise.all(
        input.recordIds.map(async (recordId) => {
          const path = paths.record(recordId, "delete");
          if (!path)
            throw new Error(
              `Related list ${input.subgrid.relationshipName} has no delete API metadata.`,
            );
          await requestJson(path, { method: "DELETE" });
        }),
      );
    },

    ...(spec.timelineApiPath
      ? {
          async getTimelineEntries(input) {
            const data = await requestJson(
              spec.timelineApiPath!.replace(
                "{recordId}",
                encodeURIComponent(input.recordId),
              ),
            );
            return readTimelineEntries(data, input.search);
          },
        }
      : {}),

    ...(spec.widgets?.some((widget) => widget.dataSource)
      ? {
          async getWidgetData(input) {
            const widget = spec.widgets?.find(
              (candidate) =>
                candidate.id === input.widget.id ||
                candidate.widgetType === input.widget.widgetType,
            );
            if (!widget?.dataSource) {
              throw new Error(
                "This Widget is not supported by the module adapter.",
              );
            }
            const params = new URLSearchParams({
              ...(widget.dataSource.query ?? {}),
            });
            if (!widget.dataSource.apiPath.includes("{recordId}")) {
              params.set(
                widget.dataSource.recordIdQueryKey ?? "recordId",
                input.recordId,
              );
            }
            const apiPath = widget.dataSource.apiPath.replace(
              "{recordId}",
              encodeURIComponent(input.recordId),
            );
            const data = await requestJson(`${apiPath}${queryString(params)}`);
            return widget.dataSource.responseAdapter === "approval-record"
              ? mapApprovalRecord(data)
              : data;
          },
        }
      : {}),
  };
}

async function buildAttendanceLocationPayload(
  action: "checkIn" | "checkOut",
  payload: unknown,
  record: Readonly<Record<string, unknown>> | null | undefined,
) {
  const base = isRecord(payload) ? { ...payload } : {};
  const runtimeContext = await requestJson("/api/attendance/runtime-context");
  const attendanceMode =
    stringValue(base.attendanceMode) ||
    stringValue(record?.attendanceMode) ||
    stringValue(record?.defaultAttendanceMode) ||
    stringValue(runtimeContext.defaultAttendanceMode);

  if (!attendanceMode && action === "checkIn") {
    throw new Error("No attendance mode is available for check-in.");
  }

  if (action === "checkIn" && attendanceMode) {
    base.attendanceMode = attendanceMode;
  }

  const officeLocationId =
    stringValue(base.officeLocationId) ||
    stringValue(record?.officeLocationId) ||
    stringValue(record?.defaultOfficeLocationId) ||
    stringValue(runtimeContext.defaultOfficeLocationId);
  if (action === "checkIn" && attendanceMode === "OFFICE" && officeLocationId) {
    base.officeLocationId = officeLocationId;
  }

  const policy = isRecord(runtimeContext.policy) ? runtimeContext.policy : {};
  const location = await captureAttendanceLocation({
    timeoutSeconds: optionalNumberValue(policy.locationTimeoutSeconds) ?? 15,
    retryAttempts: optionalNumberValue(policy.locationRetryAttempts) ?? 2,
    highAccuracy:
      policy.highAccuracyLocation === undefined
        ? true
        : booleanValue(policy.highAccuracyLocation),
  });
  if (!location.ok) throw new Error(location.message);
  /*
   * BUG-2333. `storeUserAgent` is a tenant privacy setting, and this path
   * ignored it: the user agent was attached to every check-in regardless.
   * Confirmed against a tenant whose policy reports `storeUserAgent: false`
   * and whose check-in still transmitted the full browser UA string.
   *
   * The sibling path in module-runtime-command-handler.tsx has always gated on
   * the policy. This is the path the attendance module's own Check In button
   * uses, so the setting had no effect on the surface that matters most.
   */
  const locationPayload = buildLocationPayload(location, {
    userAgent:
      booleanValue(policy.storeUserAgent) && typeof navigator !== "undefined"
        ? navigator.userAgent
        : undefined,
  });

  return {
    ...base,
    ...locationPayload,
    ...(action === "checkIn"
      ? {
          checkInAddressText: location.addressText,
        }
      : {
          checkOutAddressText: location.addressText,
        }),
  };
}

async function requestJson(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-dijipeople-error-handling": "inline",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      message?: unknown;
      error?: unknown;
      description?: unknown;
      status?: unknown;
      statusCode?: unknown;
    } | null;
    const method = init?.method ?? "GET";
    const serverMessage =
      typeof data?.message === "string"
        ? data.message
        : typeof data?.error === "string"
          ? data.error
          : `Request failed with ${response.status}.`;

    /*
     * BUG-1963 — the thrown message used to be
     * `${serverMessage} (${method} ${path})`, and the runtime command handler
     * puts a failed command's message straight into the dialog and the toast.
     * A customer therefore read
     * "leavePolicyId must be a UUID (POST /api/leave-policies/assignments)":
     * a DTO property name and an internal route.
     *
     * The method and the path are diagnostic. They stay on `error.data`, which
     * is what reaches the error log and the downloadable report, and they are
     * written to the console here so a developer still sees them at the point
     * of failure. `resolveUserFacingMessage` decides what the user reads from
     * the contract's own `description`/`message` pair.
     */
    if (typeof console !== "undefined") {
      console.warn(
        `[dijipeople] ${method} ${path} failed with ${response.status}`,
        serverMessage,
      );
    }

    const error = new Error(serverMessage) as Error & { data?: unknown };
    error.data = {
      ...(data && typeof data === "object" ? data : {}),
      message: serverMessage,
      path,
      method,
      status: response.status,
      statusCode:
        typeof data?.statusCode === "number"
          ? data.statusCode
          : response.status,
    };
    throw error;
  }

  if (response.status === 204) return null;
  return response.json();
}

function withLookupRequestContext(
  error: unknown,
  context: { field: string; path: string },
) {
  if (!(error instanceof Error)) {
    return new Error(
      `Lookup ${context.field} failed at ${context.path}: ${String(error)}`,
    );
  }

  const contextualError = new Error(
    `Lookup ${context.field} failed at ${context.path}: ${error.message}`,
  ) as Error & { data?: unknown; cause?: unknown };
  contextualError.stack = error.stack;
  contextualError.cause = error;
  const source = error as Error & { data?: unknown };
  contextualError.data = {
    ...(source.data && typeof source.data === "object" ? source.data : {}),
    errorCode:
      source.data &&
      typeof source.data === "object" &&
      "errorCode" in source.data &&
      typeof source.data.errorCode === "string"
        ? source.data.errorCode
        : "LOOKUP_REQUEST_FAILED",
    message: contextualError.message,
    description: `The ${context.field} lookup could not load options from ${context.path}.`,
    lookupField: context.field,
    lookupPath: context.path,
  };
  return contextualError;
}

function readRecordList(data: unknown): readonly RuntimeRecord[] {
  if (Array.isArray(data)) return data.filter(isMeaningfulRecord);
  if (!data || typeof data !== "object") return [];

  const record = data as {
    items?: unknown;
    data?: unknown;
    records?: unknown;
    results?: unknown;
  };

  for (const value of [record.items, record.records, record.results]) {
    if (Array.isArray(value)) return value.filter(isMeaningfulRecord);
  }

  if (isRecord(record.data)) return readRecordList(record.data);
  if (Array.isArray(record.data)) return record.data.filter(isMeaningfulRecord);

  return [];
}

function isMeaningfulRecord(value: unknown): value is RuntimeRecord {
  if (!isRecord(value)) return false;

  return Object.values(value).some((fieldValue) => {
    if (fieldValue === null || fieldValue === undefined) return false;
    if (typeof fieldValue === "string") return fieldValue.trim().length > 0;
    if (Array.isArray(fieldValue)) return fieldValue.length > 0;
    if (typeof fieldValue === "object") {
      return Object.keys(fieldValue).length > 0;
    }
    return true;
  });
}

function readRecord(data: unknown): RuntimeRecord | null {
  if (!isRecord(data)) return null;
  if (
    typeof data.id === "string" ||
    typeof data.value === "string" ||
    typeof data.code === "string" ||
    typeof data.name === "string"
  ) {
    return data;
  }

  for (const key of ["data", "record", "item", "result"] as const) {
    if (isRecord(data[key])) return readRecord(data[key]);
  }

  return data;
}

function isUnsupportedQueryParamError(error: unknown, paramName: string) {
  const haystack = errorMessageParts(error).join(" ").toLowerCase();
  return (
    haystack.includes(paramName.toLowerCase()) &&
    (haystack.includes("should not exist") ||
      haystack.includes("not allowed") ||
      haystack.includes("unknown"))
  );
}

function errorMessageParts(error: unknown): string[] {
  if (!error || typeof error !== "object") {
    return [String(error ?? "")];
  }

  const record = error as { message?: unknown; data?: unknown };
  return [
    ...messageParts(record.message),
    ...(isRecord(record.data)
      ? [
          ...messageParts(record.data.message),
          ...messageParts(record.data.error),
        ]
      : []),
  ];
}

function messageParts(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(messageParts);
  if (typeof value === "string") return [value];
  return [];
}

function lookupDisplayName(record: RuntimeRecord, field: FieldMetadata) {
  const target = field.lookupTargets?.[0];
  const primaryNameField =
    target?.primaryNameField ??
    defaultLookupPrimaryNameField(target?.entityLogicalName);

  return (
    stringValue(record[primaryNameField]) ||
    (primaryNameField === "name" ? stringValue(record.label) : "") ||
    stringValue(record.fullName) ||
    [stringValue(record.firstName), stringValue(record.lastName)]
      .filter(Boolean)
      .join(" ") ||
    stringValue(record.email)
  );
}

function defaultLookupPrimaryNameField(entityLogicalName?: string) {
  if (entityLogicalName === "employerBankAccount") return "name";
  if (entityLogicalName === "businessUnit") return "name";
  if (entityLogicalName === "employee") return "fullName";
  if (entityLogicalName === "employeeBankAccount") return "accountTitle";
  return "name";
}

function shouldUseLookupCodeAsValue(fieldLogicalName: string) {
  return fieldLogicalName.endsWith("Code") || fieldLogicalName === "currency";
}

function sanitizeStandardMutationValues(
  values: RuntimeRecord,
  spec: StandardModuleRuntimeSpec,
  mode: "create" | "update" = "create",
) {
  const writableFields = spec.fields.filter(
    (field) =>
      !field.isReadOnly && field.logicalName !== (spec.primaryIdField ?? "id"),
  );
  const writableFieldNames = new Set(
    writableFields.map((field) => field.logicalName),
  );
  const fieldsByName = new Map(
    writableFields.map((field) => [field.logicalName, field]),
  );
  const payload: Record<string, unknown> = {};

  for (const fieldName of writableFieldNames) {
    if (Object.prototype.hasOwnProperty.call(values, fieldName)) {
      payload[fieldName] = sanitizeStandardFieldValue(
        fieldsByName.get(fieldName),
        values[fieldName],
      );
    }
  }

  if (spec.entityLogicalName === "settings_designations") {
    if (Object.prototype.hasOwnProperty.call(payload, "code")) {
      payload.level = payload.code;
      delete payload.code;
    }
  }

  if (spec.moduleKey === "settings-access-teams") {
    payload.teamType = "ACCESS";
  }

  if (spec.moduleKey === "settings-organization-teams") {
    payload.teamType = "ORGANIZATIONAL";
  }

  if (spec.moduleKey === "employer-bank-accounts") {
    if (Object.prototype.hasOwnProperty.call(payload, "name")) {
      payload.accountName = payload.name;
      delete payload.name;
    }
  }

  if (spec.moduleKey === "recruitmentCandidates") {
    for (const fieldName of [
      "skills",
      "certifications",
      "interests",
      "hobbies",
      "strengths",
    ]) {
      if (Object.prototype.hasOwnProperty.call(payload, fieldName)) {
        payload[fieldName] = toDelimitedStringArray(payload[fieldName]);
      }
    }
  }

  if (spec.moduleKey === "recruitmentJobs") {
    return normalizeJobOpeningMutationPayload(payload);
  }

  // Modules whose form fields are generated at runtime cannot be described by a
  // static field list, so they supply their own reshape. See
  // `StandardModuleRuntimeSpec.mutationPayloadTransform`.
  if (spec.mutationPayloadTransform) {
    return spec.mutationPayloadTransform(payload, values, mode);
  }

  return payload;
}

function normalizeJobOpeningMutationPayload(payload: Record<string, unknown>) {
  const next = { ...payload };
  const requiredSkills = toDelimitedStringArray(next.requiredSkills);
  const preferredSkills = toDelimitedStringArray(next.preferredSkills);
  const allowedLocations = toDelimitedStringArray(next.allowedLocations);
  const educationLevels = toDelimitedStringArray(next.educationLevels);
  const allowedWorkModes = toDelimitedStringArray(next.allowedWorkModes);
  const minimumYearsExperience = optionalNumberValue(
    next.minimumYearsExperience,
  );
  const noticePeriodDays = optionalIntegerValue(next.noticePeriodDays);
  const weights = {
    skillMatch: optionalIntegerValue(next.skillMatchWeight) ?? 40,
    experienceFit: optionalIntegerValue(next.experienceFitWeight) ?? 20,
    educationFit: optionalIntegerValue(next.educationFitWeight) ?? 10,
    locationFit: optionalIntegerValue(next.locationFitWeight) ?? 15,
    availabilityFit: optionalIntegerValue(next.availabilityFitWeight) ?? 15,
  };
  const knockoutRules = {
    requireAllMandatorySkills: booleanValue(next.requireAllMandatorySkills),
    rejectIfExperienceBelowMinimum: booleanValue(
      next.rejectIfExperienceBelowMinimum,
    ),
    rejectIfWorkModeMismatch: booleanValue(next.rejectIfWorkModeMismatch),
    rejectIfLocationMismatch: booleanValue(next.rejectIfLocationMismatch),
  };

  for (const fieldName of [
    "requiredSkills",
    "preferredSkills",
    "minimumYearsExperience",
    "educationLevels",
    "allowedWorkModes",
    "allowedLocations",
    "noticePeriodDays",
    "skillMatchWeight",
    "experienceFitWeight",
    "educationFitWeight",
    "locationFitWeight",
    "availabilityFitWeight",
    "requireAllMandatorySkills",
    "rejectIfExperienceBelowMinimum",
    "rejectIfWorkModeMismatch",
    "rejectIfLocationMismatch",
  ]) {
    delete next[fieldName];
  }

  if (next.pipelineId === null || next.pipelineId === "") {
    delete next.pipelineId;
  }

  const isScoringConfigured =
    (Array.isArray(requiredSkills) && requiredSkills.length > 0) ||
    (Array.isArray(preferredSkills) && preferredSkills.length > 0) ||
    (Array.isArray(allowedLocations) && allowedLocations.length > 0) ||
    (Array.isArray(educationLevels) && educationLevels.length > 0) ||
    (Array.isArray(allowedWorkModes) && allowedWorkModes.length > 0) ||
    minimumYearsExperience !== undefined ||
    noticePeriodDays !== undefined;

  if (!isScoringConfigured) {
    next.matchCriteria = null;
    return next;
  }

  const totalWeight =
    weights.skillMatch +
    weights.experienceFit +
    weights.educationFit +
    weights.locationFit +
    weights.availabilityFit;
  if (totalWeight !== 100) {
    throw new Error("Scoring weights must total 100.");
  }

  next.matchCriteria = {
    requiredSkills: Array.isArray(requiredSkills) ? requiredSkills : [],
    preferredSkills: Array.isArray(preferredSkills) ? preferredSkills : [],
    minimumYearsExperience,
    educationLevels: Array.isArray(educationLevels) ? educationLevels : [],
    allowedWorkModes: Array.isArray(allowedWorkModes) ? allowedWorkModes : [],
    allowedLocations: Array.isArray(allowedLocations) ? allowedLocations : [],
    noticePeriodDays,
    weights,
    ...(Object.values(knockoutRules).some(Boolean) ? { knockoutRules } : {}),
  };

  return next;
}

function toDelimitedStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : String(item)))
      .filter(Boolean);
  }

  if (typeof value !== "string") return value;

  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function optionalNumberValue(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function optionalIntegerValue(value: unknown) {
  const number = optionalNumberValue(value);
  return number === undefined ? undefined : Math.trunc(number);
}

function booleanValue(value: unknown) {
  return value === true || value === "true" || value === "on" || value === 1;
}

function sanitizeStandardFieldValue(
  field: StandardModuleRuntimeSpec["fields"][number] | undefined,
  value: unknown,
) {
  if (field?.dataType === "date") {
    if (value === "" || value === null || value === undefined) return null;
    return normalizeRuntimeDateValue(value);
  }

  if (field?.dataType === "lookup" && value === "") {
    return null;
  }

  if (field?.dataType === "decimal" || field?.dataType === "currency") {
    if (value === null || value === undefined || value === "") return null;
    return String(value);
  }

  if (field?.dataType === "number" && value === "") {
    return null;
  }

  if (
    field?.dataType === "lookup" &&
    field.logicalName.endsWith("Code") &&
    isRecord(value)
  ) {
    return (
      stringValue(value.code) ||
      stringValue(value.value) ||
      stringValue(value.id) ||
      ""
    );
  }

  return value;
}

function mapApprovalRecord(data: unknown) {
  const record = readRecord(data);
  if (!record) return { items: [] };

  const status = stringValue(record.status) || "PENDING";
  const approverUser = isRecord(record.approverUser)
    ? record.approverUser
    : null;
  const actionAt =
    stringValue(record.reviewedAt) ||
    stringValue(record.approvedAt) ||
    stringValue(record.rejectedAt);

  return {
    items: [
      {
        id: stringValue(record.id) || "approval-record",
        status,
        steps: [
          {
            id: `${stringValue(record.id) || "approval-record"}-review`,
            name: "Manager review",
            status,
            assignments: approverUser
              ? [
                  {
                    assignedToUser: {
                      firstName: stringValue(approverUser.firstName),
                      lastName: stringValue(approverUser.lastName),
                      email: stringValue(approverUser.email),
                    },
                  },
                ]
              : [],
            actions: actionAt
              ? [
                  {
                    actionAtUtc: actionAt,
                    comment:
                      stringValue(record.reviewNote) ||
                      stringValue(record.comments),
                  },
                ]
              : [],
          },
        ],
      },
    ],
  };
}

function withRelatedRecordDefaults(
  relatedEntityLogicalName: string | undefined,
  values: RuntimeRecord,
) {
  if (relatedEntityLogicalName === "projectAssignment") {
    const { resourceStatus, ...rest } = values;
    return {
      ...normalizeProjectAssignmentValues(rest),
      ...(resourceStatus !== undefined ? { status: resourceStatus } : {}),
    };
  }

  if (relatedEntityLogicalName !== "leave_policy_rules") return values;
  if (
    typeof values.accrualType === "string" &&
    values.accrualType.trim().length > 0
  ) {
    return values;
  }

  return {
    ...values,
    accrualType: "FIXED_ANNUAL",
  };
}

function sanitizeRelatedMutationValues(
  values: RuntimeRecord,
  subgrid: RelatedSubgridMetadata,
) {
  const dataTypes = new Map(
    (subgrid.quickCreateFields ?? []).map((field) => [
      field.fieldLogicalName,
      field.dataType,
    ]),
  );
  return Object.fromEntries(
    Object.entries(values).map(([fieldName, value]) => {
      const dataType = dataTypes.get(fieldName);
      if (dataType === "lookup" && value === "") return [fieldName, null];
      if (dataType === "number") {
        return [
          fieldName,
          value === "" || value === null || value === undefined
            ? null
            : Number(value),
        ];
      }
      if (dataType === "currency" || dataType === "decimal") {
        return [
          fieldName,
          value === "" || value === null || value === undefined
            ? null
            : String(value),
        ];
      }
      return [fieldName, value];
    }),
  );
}

function normalizeProjectAssignmentValues(values: RuntimeRecord) {
  return {
    ...values,
    ...(values.allocationPercent !== undefined
      ? {
          allocationPercent:
            values.allocationPercent === null || values.allocationPercent === ""
              ? null
              : Number(values.allocationPercent),
        }
      : {}),
    ...(values.allocationHours !== undefined
      ? {
          allocationHours:
            values.allocationHours === null || values.allocationHours === ""
              ? null
              : String(values.allocationHours),
        }
      : {}),
    ...(values.billingRateAmount !== undefined
      ? {
          billingRateAmount:
            values.billingRateAmount === null || values.billingRateAmount === ""
              ? null
              : String(values.billingRateAmount),
        }
      : {}),
    ...(values.costRateAmount !== undefined
      ? {
          costRateAmount:
            values.costRateAmount === null || values.costRateAmount === ""
              ? null
              : String(values.costRateAmount),
        }
      : {}),
  };
}

function readTimelineEntries(data: unknown, search?: string) {
  if (!isRecord(data) || !Array.isArray(data.items)) return [];
  const normalizedSearch = search?.trim().toLowerCase();

  return data.items.filter(isRecord).flatMap((item) => {
    const id = stringValue(item.id);
    const actionLabel = stringValue(item.actionLabel);
    const occurredAt = stringValue(item.occurredAt);
    if (!id || !actionLabel || !occurredAt) return [];
    const actionType = stringValue(item.actionType) || "activity";
    const actorDisplayName = stringValue(item.actorDisplayName) || "System";
    const reference = isRecord(item.recordReference)
      ? item.recordReference
      : null;
    const referenceLabel = reference ? stringValue(reference.label) : "";
    const referenceHref = reference ? stringValue(reference.href) : "";
    const entry = {
      id,
      occurredAt,
      category: actionType,
      actorDisplayName,
      template: referenceLabel ? "{{action}} - {{record}}" : "{{action}}",
      placeholders: [
        { key: "action", value: actionLabel },
        ...(referenceLabel
          ? [
              {
                key: "record",
                value: referenceLabel,
                href: referenceHref || undefined,
              },
            ]
          : []),
      ],
    };
    if (
      normalizedSearch &&
      ![actionLabel, actionType, actorDisplayName, referenceLabel].some(
        (value) => value.toLowerCase().includes(normalizedSearch),
      )
    ) {
      return [];
    }
    return [entry];
  });
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function requireRecordId(recordId: string | undefined) {
  if (!recordId) throw new Error("No record is selected.");
  return recordId;
}

function readNumber(data: unknown, key: string) {
  if (!data || typeof data !== "object") return undefined;
  const value = (data as Record<string, unknown>)[key];
  return typeof value === "number" ? value : undefined;
}

function readNestedNumber(data: unknown, parentKey: string, key: string) {
  if (!data || typeof data !== "object") return undefined;
  return readNumber((data as Record<string, unknown>)[parentKey], key);
}

function isRecord(value: unknown): value is RuntimeRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function queryString(params: URLSearchParams) {
  const value = params.toString();
  return value ? `?${value}` : "";
}

function splitPathAndQuery(path: string) {
  const [resourcePath = path, query = ""] = path.split("?", 2);
  return {
    path: resourcePath,
    params: new URLSearchParams(query),
  };
}

function recordPath(basePath: string, recordId: string, pathTemplate?: string) {
  const encodedRecordId = encodeURIComponent(recordId);
  if (!pathTemplate) return `${basePath}/${encodedRecordId}`;

  return pathTemplate
    .replaceAll("{recordId}", encodedRecordId)
    .replaceAll(":recordId", encodedRecordId)
    .replaceAll(":id", encodedRecordId);
}
