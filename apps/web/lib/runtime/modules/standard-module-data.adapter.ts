"use client";

import type {
  ModuleDataAdapter,
  RelatedRecordMutationInput,
  RelatedRecordsInput,
} from "../module-data-adapter.types";
import { debugRuntime } from "../runtime-debug";
import type { StandardModuleRuntimeSpec } from "./standard-module-runtime";

type RuntimeRecord = Readonly<Record<string, unknown>>;

export function createStandardModuleDataAdapter(
  spec: StandardModuleRuntimeSpec,
): ModuleDataAdapter<RuntimeRecord, RuntimeRecord> {
  const basePath = spec.apiPath ?? `/api${spec.routeBase}`;
  const createPath = spec.createApiPath ?? basePath;
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
    ...(spec.moduleKey === "attendance"
      ? {
          commandHandlers: {
            "attendance.checkIn": async (context) => {
              const result = await requestJson("/api/attendance/check-in", {
                method: "POST",
                body: JSON.stringify(context.payload ?? {}),
              });
              return {
                ok: true,
                data: result,
                message: "Checked in.",
                invalidateCacheKeys: context.runtime.cacheKeys,
              };
            },
            "attendance.checkOut": async (context) => {
              const result = await requestJson("/api/attendance/check-out", {
                method: "POST",
                body: JSON.stringify(context.payload ?? {}),
              });
              return {
                ok: true,
                data: result,
                message: "Checked out.",
                invalidateCacheKeys: context.runtime.cacheKeys,
              };
            },
          },
        }
      : {}),
    async list(input) {
      const params = new URLSearchParams();
      if (input.search) params.set("search", input.search);
      if (input.page) params.set("page", String(input.page));
      if (input.pageSize) params.set("pageSize", String(input.pageSize));

      const data = await requestJson(`${basePath}${queryString(params)}`);
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
        await requestJson(`${basePath}/${encodeURIComponent(recordId)}`),
      );
    },

    async create(_runtime, values) {
      debugRuntime("Standard adapter create request", {
        moduleKey: spec.moduleKey,
        path: createPath,
        payload: values,
      });
      const record =
        readRecord(
          await requestJson(createPath, {
            body: JSON.stringify(values),
            method: "POST",
          }),
        ) ?? values;
      debugRuntime("Standard adapter create result", {
        moduleKey: spec.moduleKey,
        record,
      });
      return record;
    },

    async update(_runtime, recordId, values) {
      const path = recordPath(basePath, recordId, updatePath);
      debugRuntime("Standard adapter update request", {
        moduleKey: spec.moduleKey,
        recordId,
        path,
        payload: values,
      });
      const record =
        readRecord(
          await requestJson(path, {
            body: JSON.stringify(values),
            method: "PATCH",
          }),
        ) ?? values;
      debugRuntime("Standard adapter update result", {
        moduleKey: spec.moduleKey,
        recordId,
        record,
      });
      return record;
    },

    async softDelete(_runtime, recordIds) {
      if (recordIds.length !== 1) {
        throw new Error("Bulk soft delete is not available for this module.");
      }

      await requestJson(`${basePath}/${encodeURIComponent(recordIds[0])}`, {
        method: "DELETE",
      });
    },

    async assignOwner() {
      throw new Error(
        "Owner assignment is not configured for this module adapter.",
      );
    },

    ...(spec.lookupApiPaths
      ? {
          async getLookupOptions(_runtime, field) {
            const path = spec.lookupApiPaths?.[field.logicalName];
            if (!path) return [];
            const data = await requestJson(path);
            return readRecordList(data).flatMap((record) => {
              const id = typeof record.id === "string" ? record.id : "";
              const name =
                typeof record.name === "string"
                  ? record.name
                  : typeof record.label === "string"
                    ? record.label
                    : "";
              return id && name ? [{ id, name }] : [];
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
      throw new Error(
        `Related list ${input.subgrid.relationshipName} has no list API.`,
      );
    },

    async createRelatedRecord(
      input: RelatedRecordMutationInput<RuntimeRecord>,
    ) {
      throw new Error(
        `Related list ${input.subgrid.relationshipName} has no create API.`,
      );
    },

    async updateRelatedRecord(
      input: RelatedRecordMutationInput<Partial<RuntimeRecord>>,
    ) {
      throw new Error(
        `Related list ${input.subgrid.relationshipName} has no update API.`,
      );
    },

    async deleteRelatedRecord(input) {
      throw new Error(
        `Related list ${input.subgrid.relationshipName} has no delete API.`,
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

async function requestJson(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      message?: unknown;
      error?: unknown;
    } | null;
    const message =
      typeof data?.message === "string"
        ? data.message
        : typeof data?.error === "string"
          ? data.error
          : `Request failed with ${response.status}.`;
    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json();
}

function readRecordList(data: unknown): readonly RuntimeRecord[] {
  if (Array.isArray(data)) return data.filter(isRecord);
  if (!data || typeof data !== "object") return [];

  const record = data as {
    items?: unknown;
    data?: unknown;
    records?: unknown;
  };

  for (const value of [record.items, record.data, record.records]) {
    if (Array.isArray(value)) return value.filter(isRecord);
  }

  return [];
}

function readRecord(data: unknown): RuntimeRecord | null {
  return isRecord(data) ? data : null;
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

function recordPath(basePath: string, recordId: string, pathTemplate?: string) {
  const encodedRecordId = encodeURIComponent(recordId);
  if (!pathTemplate) return `${basePath}/${encodedRecordId}`;

  return pathTemplate
    .replaceAll("{recordId}", encodedRecordId)
    .replaceAll(":recordId", encodedRecordId)
    .replaceAll(":id", encodedRecordId);
}
