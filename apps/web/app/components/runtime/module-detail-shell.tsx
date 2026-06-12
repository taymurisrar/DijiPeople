"use client";

import type { ReactNode } from "react";
import type { CommandDefinition } from "../../../lib/runtime/command-runtime.types";
import type { ModuleRuntimeContext } from "../../../lib/runtime/module-runtime.types";
import { ModuleCommandBar } from "./module-command-bar";
import { ModuleFormSelector } from "./module-form-selector";
import { ModulePageLayout, type ModuleBreadcrumb } from "./module-page-layout";
import { ModuleRecordHeader } from "./module-record-header";
import type {
  RuntimeCommandGroups,
  RuntimeCommandHandler,
  RuntimeRecordData,
  RuntimeStatusGroupConfig,
} from "./module-runtime-ui.types";

export function ModuleDetailShell({
  accessDenied,
  activeFormId,
  breadcrumbs,
  children,
  commands,
  error,
  formSlot,
  loading,
  onCommand,
  onFormChange,
  record,
  recordSubtitle,
  runtime,
  statusGroupConfig,
  subtitle,
  tabsSlot,
  title,
}: {
  readonly accessDenied?: boolean;
  readonly activeFormId?: string | null;
  readonly breadcrumbs?: readonly ModuleBreadcrumb[];
  readonly children?: ReactNode;
  readonly commands: readonly CommandDefinition[] | RuntimeCommandGroups;
  readonly error?: ReactNode;
  readonly formSlot?: ReactNode;
  readonly loading?: boolean;
  readonly onCommand: RuntimeCommandHandler;
  readonly onFormChange: (formId: string) => void;
  readonly record?: RuntimeRecordData | null;
  readonly recordSubtitle?: string;
  readonly runtime: ModuleRuntimeContext;
  readonly statusGroupConfig?: RuntimeStatusGroupConfig | null;
  readonly subtitle?: string;
  readonly tabsSlot?: ReactNode;
  readonly title?: string;
}) {
  return (
    <ModulePageLayout
      accessDenied={accessDenied}
      breadcrumbs={breadcrumbs}
      commandBarSlot={
        <ModuleCommandBar
          commands={commands}
          loading={loading}
          onCommand={onCommand}
          record={record}
          runtime={runtime}
        />
      }
      error={error}
      loading={loading}
      subtitle={subtitle}
      title={title ?? runtime.module.label}
    >
      <div className="grid gap-4">
        <ModuleRecordHeader
          entity={runtime.metadata.entity}
          formSelector={
            <ModuleFormSelector
              activeFormId={activeFormId}
              forms={runtime.metadata.forms.filter(
                (form) =>
                  form.lifecycleState === "published" ||
                  form.lifecycleState === "deprecated",
              )}
              onFormChange={onFormChange}
            />
          }
          record={record}
          statusGroupConfig={statusGroupConfig}
          subtitle={recordSubtitle}
        />
        {tabsSlot ? <div>{tabsSlot}</div> : null}
        {formSlot ?? children}
      </div>
    </ModulePageLayout>
  );
}
