"use client";

import { ModuleRecordPage } from "./module-record-page";
import type { LookupOption } from "@/app/components/ui/form-control";
import type {
  FieldMetadata,
  FormMetadata,
} from "@/lib/runtime/metadata-runtime.types";
import { getEntityMetadata } from "@/lib/runtime/metadata-registry";
import type { ModuleRuntimeContext } from "@/lib/runtime/module-runtime.types";
import { createStandardModuleDataAdapter } from "@/lib/runtime/modules/standard-module-data.adapter";
import type { StandardModuleRuntimeSpec } from "@/lib/runtime/modules/standard-module-runtime";
import type { RuntimeRecordData } from "./module-runtime-ui.types";
import type { ModuleDataAdapter } from "@/lib/runtime/module-data-adapter.types";

export function StandardModuleRecordPage({
  activeForm,
  lookupDisplayValues,
  lookupOptions,
  mode,
  record,
  recordId,
  runtime,
  spec,
  title,
  dataAdapter,
}: {
  readonly activeForm: FormMetadata | null;
  readonly lookupDisplayValues?: Record<string, string>;
  readonly lookupOptions?: Record<string, readonly LookupOption[]>;
  readonly mode: "create" | "read" | "edit";
  readonly record: RuntimeRecordData;
  readonly recordId?: string;
  readonly runtime: ModuleRuntimeContext;
  readonly spec: StandardModuleRuntimeSpec;
  readonly title?: string;
  readonly dataAdapter?: ModuleDataAdapter;
}) {
  const resolvedLookupDisplayValues = {
    ...deriveLookupDisplayValues(runtime, record),
    ...lookupDisplayValues,
  };

  return (
    <ModuleRecordPage
      activeForm={activeForm}
      dataAdapter={dataAdapter ?? createStandardModuleDataAdapter(spec)}
      lookupDisplayValues={resolvedLookupDisplayValues}
      lookupOptions={lookupOptions}
      mode={mode}
      moduleKey={runtime.module.key}
      record={record}
      recordId={recordId}
      runtime={runtime}
      title={title}
    />
  );
}

function deriveLookupDisplayValues(
  runtime: ModuleRuntimeContext,
  record: RuntimeRecordData,
) {
  const displayValues: Record<string, string> = {};

  for (const field of runtime.metadata.entity.fields) {
    if (field.dataType !== "lookup") continue;
    const value = record[field.logicalName];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const display = readableLookupDisplayValue(field, value);
      if (display) displayValues[field.logicalName] = display;
      continue;
    }

    const relationKey = relationKeyForLookupField(field.logicalName);
    const relationValue = relationKey ? record[relationKey] : null;
    const display = readableLookupDisplayValue(field, relationValue);
    if (display) displayValues[field.logicalName] = display;
  }

  return displayValues;
}

function relationKeyForLookupField(fieldLogicalName: string) {
  if (fieldLogicalName.endsWith("Id")) {
    return fieldLogicalName.slice(0, -"Id".length);
  }

  if (fieldLogicalName.endsWith("Code")) {
    return fieldLogicalName.slice(0, -"Code".length);
  }

  return "";
}

function readableLookupDisplayValue(field: FieldMetadata, value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const record = value as Record<string, unknown>;

  return stringValue(record[lookupPrimaryNameField(field)]);
}

function lookupPrimaryNameField(field: FieldMetadata) {
  const targetEntityLogicalName = field.lookupTargets?.[0]?.entityLogicalName;
  if (!targetEntityLogicalName) return "name";

  return getEntityMetadata(targetEntityLogicalName)?.primaryNameField ?? "name";
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
