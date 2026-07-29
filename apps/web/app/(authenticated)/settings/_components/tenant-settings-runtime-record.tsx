"use client";

import { StandardModuleRecordPage } from "@/app/components/runtime";
import type { FormMetadata } from "@/lib/runtime/metadata-runtime.types";
import type { ModuleRuntimeContext } from "@/lib/runtime/module-runtime.types";
import type { StandardModuleRuntimeSpec } from "@/lib/runtime/modules/standard-module-runtime";
import type { ReactNode } from "react";
import { createTenantSettingsRuntimeAdapter } from "../_lib/tenant-settings-runtime.adapter";

export function TenantSettingsRuntimeRecord({
  activeForm,
  canEditTenantSlug = false,
  category,
  fieldCategories,
  record,
  runtime,
  spec,
  title,
  tabContent,
}: {
  activeForm: FormMetadata | null;
  canEditTenantSlug?: boolean;
  category: string;
  fieldCategories?: Readonly<Record<string, string>>;
  record: Readonly<Record<string, unknown>>;
  runtime: ModuleRuntimeContext;
  spec: StandardModuleRuntimeSpec;
  title: string;
  tabContent?: Readonly<Record<string, ReactNode>>;
}) {
  return (
    <StandardModuleRecordPage
      activeForm={activeForm}
      dataAdapter={createTenantSettingsRuntimeAdapter({
        canEditTenantSlug,
        defaultCategory: category,
        fieldCategories,
        lookupApiPaths: spec.lookupApiPaths,
        multiValueFields: runtime.metadata.entity.fields
          .filter((field) => field.dataType === "multi-optionset")
          .map((field) => field.logicalName),
      })}
      mode="edit"
      record={record}
      recordId={category}
      runtime={runtime}
      spec={spec}
      tabContent={tabContent}
      title={title}
    />
  );
}
