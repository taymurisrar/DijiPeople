"use client";

import { ModuleRecordPage } from "./module-record-page";
import type { LookupOption } from "@/app/components/ui/form-control";
import type { FormMetadata } from "@/lib/runtime/metadata-runtime.types";
import type { ModuleRuntimeContext } from "@/lib/runtime/module-runtime.types";
import { createStandardModuleDataAdapter } from "@/lib/runtime/modules/standard-module-data.adapter";
import type { StandardModuleRuntimeSpec } from "@/lib/runtime/modules/standard-module-runtime";
import type { RuntimeRecordData } from "./module-runtime-ui.types";

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
}) {
  return (
    <ModuleRecordPage
      activeForm={activeForm}
      dataAdapter={createStandardModuleDataAdapter(spec)}
      lookupDisplayValues={lookupDisplayValues}
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
