import type { CommandHandler } from "./command-runtime.types";
import type {
  FieldMetadata,
  FormFieldMetadata,
  FormMetadata,
  ViewMetadata,
} from "./metadata-runtime.types";
import type {
  ModuleDataAdapter,
  ModuleListInput,
} from "./module-data-adapter.types";
import type { ModuleRuntimeContext } from "./module-runtime.types";
import { debugRuntime } from "./runtime-debug";

export interface AdapterCommandHandlerInput {
  readonly dataAdapter?: ModuleDataAdapter;
  readonly form?: FormMetadata | null;
  readonly view?: ViewMetadata | null;
  readonly listRecords?: readonly Readonly<Record<string, unknown>>[];
  readonly downloadFile?: (file: Blob | string, filename: string) => void;
  readonly navigate?: (href: string) => void;
  readonly refresh?: () => void;
}

export function buildAdapterCommandHandlers({
  dataAdapter,
  downloadFile,
  form,
  listRecords = [],
  navigate,
  refresh,
  view,
}: AdapterCommandHandlerInput): Readonly<Record<string, CommandHandler>> {
  return {
    ...(dataAdapter?.commandHandlers ?? {}),
    "system.save": async (context) => {
      if (!dataAdapter)
        return unsupported("No ModuleDataAdapter is registered.");

      const values = readValues(context.record, context.payload);
      const recordId = context.recordId;
      debugRuntime("Save payload", {
        commandKey: context.command.key,
        moduleKey: context.runtime.module.key,
        recordId,
        payload: values,
      });
      const savedRecord = recordId
        ? await dataAdapter.update(
            context.runtime,
            recordId,
            values,
            form ?? context.form,
          )
        : await dataAdapter.create(
            context.runtime,
            values,
            form ?? context.form,
          );
      debugRuntime("Save adapter result", {
        commandKey: context.command.key,
        moduleKey: context.runtime.module.key,
        recordId,
        result: savedRecord,
      });

      refresh?.();

      return {
        ok: true,
        data: savedRecord,
        message: recordId ? "Record saved." : "Record created.",
        invalidateCacheKeys: context.runtime.cacheKeys,
      };
    },
    "system.saveAndClose": async (context) => {
      if (!dataAdapter)
        return unsupported("No ModuleDataAdapter is registered.");

      const values = readValues(context.record, context.payload);
      const recordId = context.recordId;
      debugRuntime("Save payload", {
        commandKey: context.command.key,
        moduleKey: context.runtime.module.key,
        recordId,
        payload: values,
      });
      const savedRecord = recordId
        ? await dataAdapter.update(
            context.runtime,
            recordId,
            values,
            form ?? context.form,
          )
        : await dataAdapter.create(
            context.runtime,
            values,
            form ?? context.form,
          );
      debugRuntime("Save adapter result", {
        commandKey: context.command.key,
        moduleKey: context.runtime.module.key,
        recordId,
        result: savedRecord,
      });

      refresh?.();

      return {
        ok: true,
        data: savedRecord,
        message: recordId ? "Record saved." : "Record created.",
        redirectTo: context.runtime.module.routeBase,
        invalidateCacheKeys: context.runtime.cacheKeys,
      };
    },
    "system.delete": async (context) => {
      if (!dataAdapter)
        return unsupported("No ModuleDataAdapter is registered.");
      const recordIds = context.recordId ? [context.recordId] : [];
      if (!recordIds.length)
        return unsupported("No record is selected for soft delete.");

      await dataAdapter.softDelete(context.runtime, recordIds);
      refresh?.();

      return {
        ok: true,
        message: "Record soft deleted.",
        redirectTo: context.runtime.module.routeBase,
        invalidateCacheKeys: context.runtime.cacheKeys,
      };
    },
    "selection.delete": async (context) => {
      if (!dataAdapter)
        return unsupported("No ModuleDataAdapter is registered.");
      const recordIds = context.selectedRecordIds ?? [];
      if (!recordIds.length)
        return unsupported("Select at least one record to soft delete.");

      await dataAdapter.softDelete(context.runtime, recordIds);
      refresh?.();

      return {
        ok: true,
        message: "Selected records soft deleted.",
        invalidateCacheKeys: context.runtime.cacheKeys,
      };
    },
    "selection.assignOwner": async (context) => {
      if (!dataAdapter)
        return unsupported("No ModuleDataAdapter is registered.");
      const recordIds = context.selectedRecordIds ?? [];
      const ownerId = readOwnerId(context.payload);
      if (!recordIds.length)
        return unsupported("Select at least one record to assign.");
      if (!ownerId)
        return unsupported("Owner assignment requires an owner value.");

      debugRuntime("Assign adapter payload", {
        commandKey: context.command.key,
        moduleKey: context.runtime.module.key,
        recordIds,
        ownerId,
      });
      const data = await dataAdapter.assignOwner(
        context.runtime,
        recordIds,
        ownerId,
      );
      debugRuntime("Assign adapter result", {
        commandKey: context.command.key,
        moduleKey: context.runtime.module.key,
        recordIds,
        ownerId,
        ok: true,
        data,
      });
      refresh?.();

      return {
        ok: true,
        data,
        message: "Owner assigned.",
        invalidateCacheKeys: context.runtime.cacheKeys,
      };
    },
    "record.assignOwner": async (context) => {
      if (!dataAdapter)
        return unsupported("No ModuleDataAdapter is registered.");
      if (!context.recordId)
        return unsupported("No record is selected for owner assignment.");
      const ownerId = readOwnerId(context.payload);
      if (!ownerId)
        return unsupported("Owner assignment requires an owner value.");

      debugRuntime("Assign adapter payload", {
        commandKey: context.command.key,
        moduleKey: context.runtime.module.key,
        recordIds: [context.recordId],
        ownerId,
      });
      const data = await dataAdapter.assignOwner(
        context.runtime,
        [context.recordId],
        ownerId,
      );
      debugRuntime("Assign adapter result", {
        commandKey: context.command.key,
        moduleKey: context.runtime.module.key,
        recordIds: [context.recordId],
        ownerId,
        ok: true,
        data,
      });
      refresh?.();

      return {
        ok: true,
        data,
        message: "Owner assigned.",
        invalidateCacheKeys: context.runtime.cacheKeys,
      };
    },
    "record.changeStatus": async (context) => {
      if (!dataAdapter)
        return unsupported("No ModuleDataAdapter is registered.");
      if (!context.recordId)
        return unsupported("No record is selected for status change.");
      const status = readStringPayload(context.payload, "status");
      if (!status) return unsupported("Status change requires a status value.");

      await dataAdapter.changeStatus(
        context.runtime,
        context.recordId,
        status,
        readStringPayload(context.payload, "subStatus"),
      );
      refresh?.();

      return {
        ok: true,
        message: "Status changed.",
        invalidateCacheKeys: context.runtime.cacheKeys,
      };
    },
    "record.changeSubStatus": async (context) => {
      if (!dataAdapter)
        return unsupported("No ModuleDataAdapter is registered.");
      if (!context.recordId)
        return unsupported("No record is selected for sub-status change.");
      const subStatus = readStringPayload(context.payload, "subStatus");
      if (!subStatus)
        return unsupported("Sub-status change requires a sub-status value.");

      await dataAdapter.changeStatus(
        context.runtime,
        context.recordId,
        readStringValue(
          context.record?.[context.runtime.metadata.entity.statusField ?? ""],
        ),
        subStatus,
      );
      refresh?.();

      return {
        ok: true,
        message: "Sub-status changed.",
        invalidateCacheKeys: context.runtime.cacheKeys,
      };
    },
    "system.refresh": () => {
      refresh?.();

      return {
        ok: true,
        message: "Refreshed.",
        invalidateCacheKeys: [],
      };
    },
    "system.export": async (context) => {
      if (!dataAdapter) {
        exportClientCsv({
          downloadFile,
          records: listRecords,
          runtime: context.runtime,
          view: view ?? context.view ?? null,
        });
        return { ok: true, message: "List exported." };
      }

      const file = await dataAdapter.exportList(
        buildListInput(context.runtime, view ?? context.view ?? null),
      );
      if (file) {
        downloadFile?.(file, `${context.runtime.module.key}.csv`);
      } else {
        exportClientCsv({
          downloadFile,
          records: listRecords,
          runtime: context.runtime,
          view: view ?? context.view ?? null,
        });
      }

      return { ok: true, message: "List exported." };
    },
    "system.exportTemplate": async (context) => {
      exportClientCsv({
        downloadFile,
        records: [],
        runtime: context.runtime,
        view: view ?? context.view ?? null,
      });

      return { ok: true, message: "Template exported." };
    },
    "record.export": async (context) => {
      if (!context.recordId)
        return unsupported("No record is selected for export.");

      const activeForm = form ?? context.form;
      if (activeForm && context.record) {
        exportRecordFormCsv({
          downloadFile,
          form: activeForm,
          record: context.record,
          runtime: context.runtime,
        });

        return { ok: true, message: "Record exported." };
      }

      if (!dataAdapter)
        return unsupported("No ModuleDataAdapter is registered.");

      const file = await dataAdapter.exportRecord(
        context.runtime,
        context.recordId,
        form ?? context.form,
      );
      if (file)
        downloadFile?.(
          file,
          `${context.runtime.module.key}-${context.recordId}.csv`,
        );

      return { ok: true, message: "Record exported." };
    },
    "system.import": (context) => {
      navigate?.(`${context.runtime.module.routeBase}/import`);

      return {
        ok: true,
        message: "Opening import.",
        redirectTo: `${context.runtime.module.routeBase}/import`,
      };
    },
  };
}

function buildListInput(
  runtime: ModuleRuntimeContext,
  view: ViewMetadata | null,
): ModuleListInput {
  return {
    runtime,
    view:
      view ??
      runtime.metadata.views.find((item) => item.isDefault) ??
      runtime.metadata.views[0] ??
      fallbackView(runtime),
  };
}

function fallbackView(runtime: ModuleRuntimeContext): ViewMetadata {
  return {
    id: `${runtime.module.key}.default`,
    logicalName: `${runtime.module.key}.default`,
    displayName: runtime.module.label,
    version: "0.0.0",
    lifecycleState: "draft",
    layer: "system",
    entityLogicalName: runtime.metadata.entity.logicalName,
    type: "main",
    columns: [],
  };
}

function readValues(
  record: Readonly<Record<string, unknown>> | null | undefined,
  payload: unknown,
) {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as Readonly<Record<string, unknown>>;
  }

  return record ?? {};
}

function readOwnerId(payload: unknown) {
  return (
    readStringPayload(payload, "ownerId") ||
    readStringPayload(payload, "ownerUserId")
  );
}

function readStringPayload(payload: unknown, key: string) {
  if (typeof payload === "string") return payload;
  if (!payload || typeof payload !== "object") return "";
  return readStringValue((payload as Record<string, unknown>)[key]);
}

function readStringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function unsupported(message: string) {
  return {
    ok: false,
    message,
  };
}

function exportClientCsv({
  downloadFile,
  records,
  runtime,
  view,
}: {
  readonly downloadFile?: (file: Blob | string, filename: string) => void;
  readonly records: readonly Readonly<Record<string, unknown>>[];
  readonly runtime: ModuleRuntimeContext;
  readonly view: ViewMetadata | null;
}) {
  const columns =
    view?.columns
      .filter((column) => !column.isHidden)
      .sort((left, right) => left.order - right.order) ?? [];
  const fieldsByName = new Map(
    runtime.metadata.entity.fields.map((field) => [field.logicalName, field]),
  );
  const headers = columns.map(
    (column) =>
      column.label ??
      fieldsByName.get(column.fieldLogicalName)?.displayName ??
      column.fieldLogicalName,
  );
  const rows = records.map((record) =>
    columns.map((column) => csvCell(record[column.fieldLogicalName])).join(","),
  );

  downloadFile?.(
    [headers.join(","), ...rows].join("\n"),
    `${runtime.module.key}.csv`,
  );
}

function exportRecordFormCsv({
  downloadFile,
  form,
  record,
  runtime,
}: {
  readonly downloadFile?: (file: Blob | string, filename: string) => void;
  readonly form: FormMetadata;
  readonly record: Readonly<Record<string, unknown>>;
  readonly runtime: ModuleRuntimeContext;
}) {
  const fieldsByName = new Map(
    runtime.metadata.entity.fields.map((field) => [field.logicalName, field]),
  );
  const rows: Array<readonly [string, string, string]> = [];
  const seen = new Set<string>();
  const primaryField = runtime.metadata.entity.primaryNameField;

  if (primaryField) {
    const field = fieldsByName.get(primaryField);
    addRecordExportRow(rows, seen, {
      field,
      fieldLogicalName: primaryField,
      label: field?.displayName ?? "Record Title",
      record,
      sectionLabel: "Record Header",
    });
  }

  const statusFieldNames = [
    runtime.metadata.entity.ownerField,
    runtime.metadata.entity.statusField,
    runtime.metadata.entity.subStatusField,
  ].filter((fieldName): fieldName is string => Boolean(fieldName));

  for (const fieldName of statusFieldNames) {
    const field = fieldsByName.get(fieldName);
    addRecordExportRow(rows, seen, {
      field,
      fieldLogicalName: fieldName,
      label: field?.displayName ?? fieldName,
      record,
      sectionLabel: "Status Group",
    });
  }

  const tabLabels = new Map(
    (form.tabs ?? []).map((tab) => [tab.tabKey, tab.label] as const),
  );
  const sortedSections = [...form.sections].sort(
    (left, right) => left.order - right.order,
  );

  for (const section of sortedSections) {
    if (section.visibilityRuleKey || section.fields.length === 0) {
      continue;
    }

    const sectionLabel = [
      section.tabKey ? tabLabels.get(section.tabKey) : null,
      section.label,
    ]
      .filter(Boolean)
      .join(" / ");

    const sortedFields = [...section.fields]
      .filter((field) => field.isVisible !== false)
      .sort((left, right) => left.order - right.order);

    for (const formField of sortedFields) {
      const field = fieldsByName.get(formField.fieldLogicalName);
      addRecordExportRow(rows, seen, {
        field,
        fieldLogicalName: formField.fieldLogicalName,
        formField,
        label:
          formField.label ?? field?.displayName ?? formField.fieldLogicalName,
        record,
        sectionLabel: sectionLabel || section.label,
      });
    }

    const sortedFieldComponents = [...(section.components ?? [])]
      .filter(
        (component) =>
          component.type === "field" &&
          component.fieldLogicalName &&
          component.isVisible !== false,
      )
      .sort((left, right) => left.order - right.order);

    for (const component of sortedFieldComponents) {
      const fieldLogicalName = component.fieldLogicalName;
      if (!fieldLogicalName) continue;

      const field = fieldsByName.get(fieldLogicalName);
      addRecordExportRow(rows, seen, {
        field,
        fieldLogicalName,
        label: component.label ?? field?.displayName ?? fieldLogicalName,
        record,
        sectionLabel: sectionLabel || section.label,
      });
    }
  }

  const csv = [
    ["Section", "Field", "Value"].map(csvCell).join(","),
    ...rows.map((row) => row.map(csvCell).join(",")),
  ].join("\n");

  downloadFile?.(
    `${csv}\n`,
    `${runtime.module.key}-${readRecordExportId(record, runtime)}.csv`,
  );
}

function addRecordExportRow(
  rows: Array<readonly [string, string, string]>,
  seen: Set<string>,
  input: {
    readonly field?: FieldMetadata;
    readonly fieldLogicalName: string;
    readonly formField?: FormFieldMetadata;
    readonly label: string;
    readonly record: Readonly<Record<string, unknown>>;
    readonly sectionLabel: string;
  },
) {
  if (seen.has(input.fieldLogicalName)) return;
  if (input.formField?.visibilityRuleKey) return;

  seen.add(input.fieldLogicalName);
  rows.push([
    input.sectionLabel,
    input.label,
    displayExportValue(input.record[input.fieldLogicalName], input.field),
  ]);
}

function displayExportValue(value: unknown, field?: FieldMetadata) {
  if (Array.isArray(value)) return value.map(String).join("; ");
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (field?.options?.length && typeof value === "string") {
    return (
      field.options.find((option) => option.value === value)?.label ?? value
    );
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["label", "name", "fullName", "displayName", "email"]) {
      if (typeof record[key] === "string") return record[key];
    }
    return "";
  }

  return String(value);
}

function readRecordExportId(
  record: Readonly<Record<string, unknown>>,
  runtime: ModuleRuntimeContext,
) {
  const primaryField = runtime.metadata.entity.primaryNameField;
  const value =
    (primaryField ? record[primaryField] : null) ??
    record.id ??
    runtime.recordId ??
    "record";

  return (
    String(value)
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "record"
  );
}

function csvCell(value: unknown) {
  const text = Array.isArray(value)
    ? value.join("; ")
    : value === null || value === undefined
      ? ""
      : String(value);

  return `"${text.replace(/"/g, '""')}"`;
}
