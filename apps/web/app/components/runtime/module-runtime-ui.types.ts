"use client";

import type { ReactNode } from "react";
import type {
  CommandDefinition,
  StatusGroupConfig,
} from "../../../lib/runtime/command-runtime.types";
import type {
  FieldMetadata,
  FormMetadata,
  ViewMetadata,
} from "../../../lib/runtime/metadata-runtime.types";
import type { ModuleRuntimeContext } from "../../../lib/runtime/module-runtime.types";

export type RuntimeRecordData = Readonly<Record<string, unknown>>;

export type RuntimeCommandPlacementGroup =
  | "primary"
  | "secondary"
  | "overflow"
  | "destructive"
  | "group"
  | "statusGroup";

export type RuntimeCommandGroups = Partial<
  Record<RuntimeCommandPlacementGroup, readonly CommandDefinition[]>
>;

export interface RuntimeCommandButtonGroup {
  readonly key: string;
  readonly label: string;
  readonly commands: readonly CommandDefinition[];
}

export interface RuntimeCommandEventContext {
  readonly runtime: ModuleRuntimeContext;
  readonly record?: RuntimeRecordData | null;
  readonly recordId?: string;
  readonly selectedRecordIds?: readonly string[];
  readonly source: RuntimeCommandPlacementGroup;
  readonly value?: unknown;
}

export type RuntimeCommandHandler = (
  commandKey: string,
  context: RuntimeCommandEventContext,
) => void;

export interface RuntimeSelectorOption {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
}

export interface RuntimeStatusGroupConfig extends StatusGroupConfig {
  readonly enabled?: boolean;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly onValueChange?: (fieldLogicalName: string, value: string) => void;
  readonly ownerField?: FieldMetadata | null;
  readonly ownerOptions?: readonly { readonly value: string; readonly label: string; readonly email?: string | null }[];
  readonly ownerOptionsError?: string | null;
  readonly onOwnerSearch?: (query: string) => void;
  readonly lookupDisplayValues?: Readonly<Record<string, string>>;
  readonly statusField?: FieldMetadata | null;
  readonly subStatusField?: FieldMetadata | null;
}

export interface RuntimeShellSlots {
  readonly children?: ReactNode;
  readonly headerSlot?: ReactNode;
  readonly tabsSlot?: ReactNode;
  readonly tableSlot?: ReactNode;
}

export interface RuntimeActiveMetadata {
  readonly activeForm?: FormMetadata | null;
  readonly activeView?: ViewMetadata | null;
}
