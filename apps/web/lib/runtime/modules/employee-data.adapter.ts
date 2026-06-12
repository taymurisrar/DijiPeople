import type {
  ModuleDataAdapter,
  ModuleListInput,
  RelatedRecordMutationInput,
  RelatedRecordsInput,
} from "../module-data-adapter.types";
import { debugRuntime } from "../runtime-debug";
import {
  type EmployeeRuntimeFormValues,
  mapEmployeeRuntimeValuesToUpdatePayload,
} from "./employee-metadata.adapter";

type RuntimeRecord = Readonly<Record<string, unknown>>;

export const employeeModuleDataAdapter: ModuleDataAdapter<
  RuntimeRecord,
  RuntimeRecord
> = {
  async list(input) {
    const params = new URLSearchParams();

    if (input.search) params.set("search", input.search);
    if (input.page) params.set("page", String(input.page));
    if (input.pageSize) params.set("pageSize", String(input.pageSize));

    const data = await requestJson(`/api/employees${queryString(params)}`);
    const records = readRecordList(data);

    return {
      records,
      page: readNumber(data, "page") ?? input.page,
      pageSize: readNumber(data, "pageSize") ?? input.pageSize,
      totalRecords:
        readNumber(data, "totalRecords") ??
        readNumber(data, "total") ??
        records.length,
    };
  },

  async getById(_runtime, recordId) {
    const data = await requestJson(
      `/api/employees/${encodeURIComponent(recordId)}`,
    );
    return readRecord(data);
  },

  async create(_runtime, values) {
    debugRuntime("Employee adapter create request", {
      payload: stripGeneratedLockedValues(mapFormValues(values)),
    });
    const data = await requestJson("/api/employees", {
      body: JSON.stringify(stripGeneratedLockedValues(mapFormValues(values))),
      method: "POST",
    });
    debugRuntime("Employee adapter create response", data);

    return readRecord(data) ?? values;
  },

  async update(_runtime, recordId, values) {
    const payload = stripGeneratedLockedValues(
      mapEmployeeRuntimeValuesToUpdatePayload(
        values as EmployeeRuntimeFormValues,
      ),
    );
    debugRuntime("Employee adapter update request", {
      recordId,
      payload,
      systemFields: {
        ownerId: values.ownerId,
        ownerUserId: payload.ownerUserId,
        status: values.status,
        subStatus: values.subStatus,
      },
    });
    const data = await requestJson(
      `/api/employees/${encodeURIComponent(recordId)}`,
      {
        body: JSON.stringify(payload),
        method: "PATCH",
      },
    );
    debugRuntime("Employee adapter update response", data);

    return readRecord(data) ?? values;
  },

  async softDelete(_runtime, recordIds) {
    if (recordIds.length === 0) return;

    if (recordIds.length === 1) {
      await requestJson(`/api/employees/${encodeURIComponent(recordIds[0])}`, {
        method: "DELETE",
      });
      return;
    }

    await requestJson("/api/employees/bulk-delete", {
      body: JSON.stringify({ ids: recordIds }),
      method: "DELETE",
    });
  },

  async assignOwner(_runtime, recordIds, ownerId) {
    debugRuntime("Employee adapter assignOwner request", {
      recordIds,
      ownerId,
    });
    const result = await assignOwnerRequest(recordIds, ownerId);
    debugRuntime("Employee adapter assignOwner response", { ok: true });
    return result;
  },

  async getOwnerOptions(_runtime, search) {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    const data = await requestJson(
      `/api/employees/owner-options${queryString(params)}`,
    );

    if (!data || typeof data !== "object") return [];
    const items = (data as { items?: unknown }).items;
    if (!Array.isArray(items)) return [];

    return items
      .filter(isRecord)
      .map((item) => ({
        id: stringValue(item.id),
        name:
          stringValue(item.name) ||
          stringValue(item.email) ||
          stringValue(item.id),
        subtitle: stringValue(item.email),
        roleKeys: Array.isArray(item.roleKeys)
          ? item.roleKeys.filter(
              (roleKey): roleKey is string => typeof roleKey === "string",
            )
          : [],
      }))
      .filter((item) => item.id && item.name);
  },

  async getLookupOptions(_runtime, field, values) {
    if (field.logicalName === "stateProvinceId") {
      const params = new URLSearchParams();
      const countryId = stringValue(values.countryId);
      if (countryId) params.set("countryId", countryId);
      return readLookupOptions(
        await requestJson(`/api/lookups/states${queryString(params)}`),
      );
    }

    if (field.logicalName === "cityId") {
      const params = new URLSearchParams();
      const countryId = stringValue(values.countryId);
      const stateProvinceId = stringValue(values.stateProvinceId);
      if (countryId) params.set("countryId", countryId);
      if (stateProvinceId) params.set("stateProvinceId", stateProvinceId);
      return readLookupOptions(
        await requestJson(`/api/lookups/cities${queryString(params)}`),
      );
    }

    return [];
  },

  async changeStatus() {
    throw new Error(
      "Record status/sub-status API is not available for Employee yet. Edit values and use Save when backend support is added.",
    );
  },

  async exportRecord(_runtime, recordId) {
    return requestFile(`/api/employees/${encodeURIComponent(recordId)}/export`);
  },

  async exportList(input) {
    return requestFile(`/api/employees/export${viewExportQuery(input)}`);
  },

  async getRelatedRecords(input) {
    const endpoint = relatedEndpoint(input);
    if (!endpoint?.list) {
      throw new Error(
        `Related list ${input.subgrid.relationshipName} has no list API.`,
      );
    }

    const data = await requestJson(endpoint.list);
    const records = readRecordList(data);

    return {
      records,
      totalRecords: records.length,
    };
  },

  async createRelatedRecord(input) {
    const endpoint = relatedEndpoint(input);
    if (!endpoint?.list) {
      throw new Error(
        `Related list ${input.subgrid.relationshipName} has no create API.`,
      );
    }

    const data = await requestJson(endpoint.list, {
      body: JSON.stringify(input.values),
      method: "POST",
    });

    return readRecord(data) ?? input.values;
  },

  async updateRelatedRecord(input) {
    const endpoint = relatedEndpoint(input);
    if (!input.recordId || !endpoint?.record) {
      throw new Error(
        `Related list ${input.subgrid.relationshipName} has no update API.`,
      );
    }

    const data = await requestJson(endpoint.record(input.recordId), {
      body: JSON.stringify(input.values),
      method: "PATCH",
    });

    return readRecord(data) ?? input.values;
  },

  async deleteRelatedRecord(input) {
    const endpoint = relatedEndpoint(input);
    if (!endpoint?.record) {
      throw new Error(
        `Related list ${input.subgrid.relationshipName} has no delete API.`,
      );
    }

    await Promise.all(
      input.recordIds.map((recordId) =>
        requestJson(endpoint.record(recordId), { method: "DELETE" }),
      ),
    );
  },

  async getTimelineEntries(input) {
    const data = await requestJson(
      `/api/employees/${encodeURIComponent(input.recordId)}/history`,
    );
    const records = readRecordList(data);
    const normalizedSearch = input.search?.trim().toLowerCase();

    return records
      .flatMap((record) => {
        const changedByUser = isRecord(record.changedByUser)
          ? record.changedByUser
          : null;
        const actorDisplayName = changedByUser
          ? [
              stringValue(changedByUser.firstName),
              stringValue(changedByUser.lastName),
            ]
              .filter(Boolean)
              .join(" ") || stringValue(changedByUser.email)
          : undefined;
        const title =
          stringValue(record.title) ||
          stringValue(record.eventType) ||
          "Employee history updated";
        const description = stringValue(record.description);
        const id = stringValue(record.id);
        const occurredAt =
          stringValue(record.eventDate) || stringValue(record.createdAt);
        if (!id || !occurredAt) return [];

        return [
          {
            id,
            occurredAt,
            template: description
              ? "{{title}} - {{description}} - {{record}}"
              : "{{title}} - {{record}}",
            category: stringValue(record.eventType) || "employee-history",
            actorDisplayName,
            placeholders: [
              { key: "title", value: title },
              ...(description
                ? [{ key: "description", value: description }]
                : []),
              {
                key: "record",
                value: "Employee",
                href: `/employees/${encodeURIComponent(input.recordId)}`,
              },
            ],
          },
        ];
      })
      .filter((entry) =>
        normalizedSearch
          ? [
              entry.template,
              entry.category,
              entry.actorDisplayName,
              ...entry.placeholders.map((placeholder) => placeholder.value),
            ]
              .filter(Boolean)
              .some((value) => value?.toLowerCase().includes(normalizedSearch))
          : true,
      );
  },

  async getWidgetData(input) {
    if (
      input.widget.logicalName === "employee.profilePhoto" ||
      input.widget.widgetType === "profile_photo"
    ) {
      return requestJson(
        `/api/employees/${encodeURIComponent(input.recordId)}`,
      );
    }
    if (
      input.widget.logicalName === "system.agentDesktop" ||
      input.widget.widgetType === "agent_desktop"
    ) {
      return requestJson(
        `/api/agent/employees/${encodeURIComponent(input.recordId)}/summary`,
      );
    }

    if (
      input.widget.logicalName === "system.reportingHierarchy" ||
      input.widget.widgetType === "reporting_hierarchy"
    ) {
      return mapReportingHierarchy(
        await requestJson(
          `/api/employees/${encodeURIComponent(input.recordId)}/reporting-structure`,
        ),
      );
    }

    throw new Error(
      `${input.widget.displayName} is not supported by the Employee data adapter.`,
    );
  },
};

function mapFormValues(values: RuntimeRecord) {
  const payload = mapEmployeeRuntimeValuesToUpdatePayload(
    values as EmployeeRuntimeFormValues,
  );

  return {
    ...payload,
    ownerUserId: emptyToUndefined(values.ownerId),
    provisionSystemAccess: booleanOrUndefined(values.provisionSystemAccess),
    sendInvitationNow: booleanOrUndefined(values.sendInvitationNow),
    initialRoleIds: Array.isArray(values.initialRoleIds)
      ? values.initialRoleIds
      : [],
  };
}

function stripGeneratedLockedValues<TValues extends Record<string, unknown>>(
  values: TValues,
) {
  const nextValues = { ...values };
  delete nextValues.employeeCode;
  return nextValues;
}

function mapReportingHierarchy(data: unknown) {
  if (!isRecord(data)) return data;
  return {
    currentEmployee: mapReportingNode(data.currentEmployee),
    reportingLine: mapReportingNodes(data.reportingLine),
    directReports: mapReportingNodes(data.directReports),
  };
}

function mapReportingNodes(value: unknown) {
  return Array.isArray(value)
    ? value.map(mapReportingNode).filter(Boolean)
    : [];
}

function mapReportingNode(value: unknown) {
  if (!isRecord(value)) return null;
  const id = stringValue(value.employeeId);
  const displayName = stringValue(value.displayName);
  if (!id || !displayName) return null;
  const jobTitle = stringValue(value.jobTitle);
  const department = stringValue(value.department);
  return {
    id,
    displayName,
    subtitle: [jobTitle, department].filter(Boolean).join(" - ") || undefined,
  };
}

async function assignOwnerRequest(
  recordIds: readonly string[],
  ownerId: string,
) {
  if (recordIds.length === 0) return;

  if (recordIds.length === 1) {
    const response = await requestJson(
      `/api/employees/${encodeURIComponent(recordIds[0])}/assign-owner`,
      {
        body: JSON.stringify({ ownerUserId: ownerId }),
        method: "PATCH",
      },
    );
    debugRuntime("Employee adapter single assignOwner backend response", {
      recordId: recordIds[0],
      ownerId,
      response,
    });
    return mapOwnerAssignmentResult(response);
  }

  const response = await requestJson("/api/employees/assign-owner", {
    body: JSON.stringify({ employeeIds: recordIds, ownerUserId: ownerId }),
    method: "PATCH",
  });
  debugRuntime("Employee adapter bulk assignOwner backend response", {
    recordIds,
    ownerId,
    response,
  });
  return mapOwnerAssignmentResult(response);
}

function mapOwnerAssignmentResult(value: unknown) {
  if (!isRecord(value) || !isRecord(value.owner)) return value;
  const ownerId = stringValue(value.owner.id);
  const ownerName = stringValue(value.owner.fullName);
  const ownerEmail = stringValue(value.owner.email);
  return {
    ownerId,
    ownerName,
    ownerDisplayName: ownerName || ownerEmail,
    ownerEmail,
    ownerUser: {
      id: ownerId,
      fullName: ownerName,
      email: ownerEmail,
    },
  };
}

function relatedEndpoint(
  input: RelatedRecordsInput | RelatedRecordMutationInput,
) {
  const parentId = encodeURIComponent(input.parentRecordId);

  if (input.subgrid.relationshipName === "employee_previous_employments") {
    return {
      list: `/api/employees/${parentId}/previous-employments`,
      record: (recordId: string) =>
        `/api/employees/${parentId}/previous-employments/${encodeURIComponent(recordId)}`,
    };
  }

  if (input.subgrid.relationshipName === "employee_education") {
    return {
      list: `/api/employees/${parentId}/education`,
      record: (recordId: string) =>
        `/api/employees/${parentId}/education/${encodeURIComponent(recordId)}`,
    };
  }

  return null;
}

function viewExportQuery(input: ModuleListInput) {
  const params = new URLSearchParams();
  const viewId = input.view.viewId ?? input.view.id;
  const columns = input.view.columns
    .filter((column) => !column.isHidden)
    .sort((left, right) => left.order - right.order)
    .map((column) => column.fieldLogicalName);

  if (viewId) params.set("viewId", viewId);
  if (columns.length) params.set("columns", columns.join(","));

  return queryString(params);
}

async function requestJson(path: string, init: RequestInit = {}) {
  const response = await fetch(path, {
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    throw await readResponseError(response, "Employee API request failed.");
  }

  if (response.status === 204) return null;

  return response.json();
}

async function requestFile(path: string) {
  const response = await fetch(path, { cache: "no-store" });

  if (!response.ok) {
    throw await readResponseError(response, "Employee export failed.");
  }

  return response.blob();
}

class EmployeeApiError extends Error {
  readonly data?: unknown;

  constructor(message: string, data?: unknown) {
    super(message);
    this.name = "EmployeeApiError";
    this.data = data;
  }
}

async function readResponseError(response: Response, fallback: string) {
  const text = await response.text().catch(() => "");
  if (!text) return new EmployeeApiError(fallback);

  try {
    const data = JSON.parse(text) as {
      message?: unknown;
      errors?: unknown;
      fieldErrors?: unknown;
    };
    const message = Array.isArray(data.message)
      ? data.message.join(", ")
      : typeof data.message === "string"
        ? data.message
        : fallback;

    return new EmployeeApiError(message, {
      fieldErrors:
        data.fieldErrors ??
        data.errors ??
        fieldErrorsFromValidationMessages(data.message),
      response: data,
    });
  } catch {
    return new EmployeeApiError(text);
  }
}

function fieldErrorsFromValidationMessages(message: unknown) {
  if (!Array.isArray(message)) return undefined;
  const fieldErrors: Record<string, string[]> = {};

  for (const item of message) {
    const text = String(item);
    const fieldName = text.match(/^([A-Za-z][A-Za-z0-9_]*)\s/)?.[1];
    if (!fieldName) continue;
    fieldErrors[fieldName] = [...(fieldErrors[fieldName] ?? []), text];
  }

  return Object.keys(fieldErrors).length ? fieldErrors : undefined;
}

function readRecordList(data: unknown): readonly RuntimeRecord[] {
  if (Array.isArray(data)) return data.filter(isRecord);
  if (!data || typeof data !== "object") return [];

  const record = data as Record<string, unknown>;
  for (const key of ["items", "records", "data"]) {
    const value = record[key];
    if (Array.isArray(value)) return value.filter(isRecord);
  }

  return [];
}

function readRecord(data: unknown): RuntimeRecord | null {
  if (isRecord(data)) {
    if (isRecord(data.data)) return data.data;
    if (isRecord(data.item)) return data.item;
    if (isRecord(data.record)) return data.record;
    return data;
  }

  return null;
}

function readLookupOptions(data: unknown) {
  return readRecordList(data)
    .map((item) => ({
      id: stringValue(item.id),
      name: stringValue(item.name),
      key: stringValue(item.key) || null,
      code: stringValue(item.code) || null,
      subtitle: stringValue(item.subtitle) || null,
    }))
    .filter((item) => item.id && item.name);
}

function readNumber(data: unknown, key: string) {
  if (!data || typeof data !== "object") return null;
  const value = (data as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function emptyToUndefined(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function booleanOrUndefined(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function isRecord(value: unknown): value is RuntimeRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function queryString(params: URLSearchParams) {
  const query = params.toString();
  return query ? `?${query}` : "";
}
