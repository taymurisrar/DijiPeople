"use client";

import type { ReactNode } from "react";
import type { CommandDefinition } from "../../../lib/runtime/command-runtime.types";
import type { ModuleRuntimeContext } from "../../../lib/runtime/module-runtime.types";
import { ModuleCommandBar } from "./module-command-bar";
import { ModulePageLayout, type ModuleBreadcrumb } from "./module-page-layout";
import { ModuleViewSelector } from "./module-view-selector";
import type {
  RuntimeCommandGroups,
  RuntimeCommandHandler,
  RuntimeRecordData,
} from "./module-runtime-ui.types";

export function ModuleListShell({
  accessDenied,
  activeViewId,
  breadcrumbs,
  children,
  commandBarAddon,
  commands,
  error,
  loading,
  onCommand,
  onViewChange,
  record,
  runtime,
  selectedRecordIds,
  subtitle,
  tableSlot,
  title,
}: {
  readonly accessDenied?: boolean;
  readonly activeViewId?: string | null;
  readonly breadcrumbs?: readonly ModuleBreadcrumb[];
  readonly children?: ReactNode;
  readonly commandBarAddon?: ReactNode;
  readonly commands: readonly CommandDefinition[] | RuntimeCommandGroups;
  readonly error?: ReactNode;
  readonly loading?: boolean;
  readonly onCommand: RuntimeCommandHandler;
  readonly onViewChange: (viewId: string) => void;
  readonly record?: RuntimeRecordData | null;
  readonly runtime: ModuleRuntimeContext;
  readonly selectedRecordIds?: readonly string[];
  readonly subtitle?: string;
  readonly tableSlot?: ReactNode;
  readonly title?: string;
}) {
  const views = runtime.metadata.views
    .filter(
      (view) =>
        view.isPublished !== false &&
        (view.lifecycleState === "published" ||
          view.lifecycleState === "deprecated"),
    )
    .map((view) => ({
      id: view.viewId ?? view.id,
      name: view.displayName,
      description: view.description,
      type: view.viewId?.startsWith("custom-") ? "custom" : "system",
      isDefault: view.isDefault,
    } satisfies {
      id: string;
      name: string;
      description?: string;
      type?: "system" | "custom";
      isDefault?: boolean;
    }));

  return (
    <ModulePageLayout
      accessDenied={accessDenied}
      breadcrumbs={breadcrumbs}
      commandBarSlot={
        <ModuleCommandBar
          addon={commandBarAddon}
          commands={commands}
          loading={loading}
          onCommand={onCommand}
          record={record}
          runtime={runtime}
          selectedRecordIds={selectedRecordIds}
        />
      }
      error={error}
      headerSlot={
        <ModuleViewSelector
          activeViewId={activeViewId}
          onViewChange={onViewChange}
          views={views}
          mode="dropdown"
        />
      }
      loading={loading}
      subtitle={subtitle}
      title={title ?? runtime.module.label}
    >
      {tableSlot ?? children}
    </ModulePageLayout>
  );
}
