"use client";

import { StandardModuleRecordPage } from "@/app/components/runtime";
import type { FormMetadata } from "@/lib/runtime/metadata-runtime.types";
import type { ModuleRuntimeContext } from "@/lib/runtime/module-runtime.types";
import type { StandardModuleRuntimeSpec } from "@/lib/runtime/modules/standard-module-runtime";
import { createTenantSettingsRuntimeAdapter } from "../_lib/tenant-settings-runtime.adapter";

export function TenantSettingsRuntimeRecord({
  activeForm,
  category,
  record,
  runtime,
  spec,
  title,
}: {
  activeForm: FormMetadata | null;
  category: string;
  record: Readonly<Record<string, unknown>>;
  runtime: ModuleRuntimeContext;
  spec: StandardModuleRuntimeSpec;
  title: string;
}) {
  return (
    <StandardModuleRecordPage
      activeForm={activeForm}
      dataAdapter={createTenantSettingsRuntimeAdapter(category)}
      mode="edit"
      record={record}
      recordId={category}
      runtime={runtime}
      spec={spec}
      title={title}
    />
  );
}
