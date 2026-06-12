"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { CommandDefinition } from "../../../lib/runtime/command-runtime.types";
import type {
  FormMetadata,
  ViewMetadata,
} from "../../../lib/runtime/metadata-runtime.types";
import type { ModuleRuntimeContext } from "../../../lib/runtime/module-runtime.types";
import type { RuntimeRecordData } from "./module-runtime-ui.types";

export interface ModuleRuntimeProviderValue {
  readonly runtime: ModuleRuntimeContext;
  readonly entityLogicalName: string;
  readonly moduleKey: string;
  readonly recordId?: string;
  readonly tenant: ModuleRuntimeContext["tenant"];
  readonly metadata: ModuleRuntimeContext["metadata"];
  readonly security: ModuleRuntimeContext["security"];
  readonly activeForm?: FormMetadata | null;
  readonly activeView?: ViewMetadata | null;
  readonly record?: RuntimeRecordData | null;
  readonly commands: readonly CommandDefinition[];
}

const ModuleRuntimeContextValue =
  createContext<ModuleRuntimeProviderValue | null>(null);

export function ModuleRuntimeProvider({
  activeForm,
  activeView,
  children,
  record,
  runtime,
}: {
  readonly activeForm?: FormMetadata | null;
  readonly activeView?: ViewMetadata | null;
  readonly children: ReactNode;
  readonly record?: RuntimeRecordData | null;
  readonly runtime: ModuleRuntimeContext;
}) {
  const value = useMemo<ModuleRuntimeProviderValue>(
    () => ({
      runtime,
      entityLogicalName: runtime.metadata.entity.logicalName,
      moduleKey: runtime.module.key,
      recordId: runtime.recordId,
      tenant: runtime.tenant,
      metadata: runtime.metadata,
      security: runtime.security,
      activeForm: activeForm ?? runtime.metadata.forms[0] ?? null,
      activeView: activeView ?? runtime.metadata.views[0] ?? null,
      record,
      commands: runtime.metadata.commands,
    }),
    [activeForm, activeView, record, runtime],
  );

  return (
    <ModuleRuntimeContextValue.Provider value={value}>
      {children}
    </ModuleRuntimeContextValue.Provider>
  );
}

export function useModuleRuntime() {
  const context = useContext(ModuleRuntimeContextValue);

  if (!context) {
    throw new Error(
      "useModuleRuntime must be used within ModuleRuntimeProvider.",
    );
  }

  return context;
}
