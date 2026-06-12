import type {
  FieldMetadata,
  FormMetadata,
  RelatedSubgridMetadata,
  TimelineEntryMetadata,
  WidgetMetadata,
  ViewMetadata,
} from "./metadata-runtime.types";
import type { ModuleRuntimeContext } from "./module-runtime.types";
import type { CommandHandler } from "./command-runtime.types";

export interface ModuleListInput {
  readonly runtime: ModuleRuntimeContext;
  readonly view: ViewMetadata;
  readonly search?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface ModuleListResult<TRecord = Readonly<Record<string, unknown>>> {
  readonly records: readonly TRecord[];
  readonly page?: number;
  readonly pageSize?: number;
  readonly totalRecords?: number;
}

export interface RelatedRecordsInput {
  readonly runtime: ModuleRuntimeContext;
  readonly parentRecordId: string;
  readonly subgrid: RelatedSubgridMetadata;
}

export interface RelatedRecordMutationInput<
  TValues = Readonly<Record<string, unknown>>,
> {
  readonly runtime: ModuleRuntimeContext;
  readonly parentRecordId: string;
  readonly subgrid: RelatedSubgridMetadata;
  readonly values: TValues;
  readonly recordId?: string;
}

export interface TimelineQueryInput {
  readonly runtime: ModuleRuntimeContext;
  readonly recordId: string;
  readonly search?: string;
  readonly category?: string;
  readonly sortDirection?: "asc" | "desc";
}

export interface WidgetDataInput {
  readonly runtime: ModuleRuntimeContext;
  readonly recordId: string;
  readonly widget: WidgetMetadata;
}

export interface ModuleOwnerOption {
  readonly id: string;
  readonly name: string;
  readonly value?: string;
  readonly label?: string;
  readonly displayName?: string;
  readonly email?: string | null;
  readonly subtitle?: string | null;
  readonly code?: string | null;
  readonly roleKeys?: readonly string[];
  readonly roles?: readonly unknown[];
}

export interface ModuleLookupOption {
  readonly id: string;
  readonly name: string;
  readonly key?: string | null;
  readonly code?: string | null;
  readonly subtitle?: string | null;
}

export interface ModuleDataAdapter<
  TRecord = Readonly<Record<string, unknown>>,
  TValues = Readonly<Record<string, unknown>>,
> {
  readonly commandHandlers?: Readonly<Record<string, CommandHandler>>;
  readonly list: (input: ModuleListInput) => Promise<ModuleListResult<TRecord>>;
  readonly getById: (
    runtime: ModuleRuntimeContext,
    recordId: string,
  ) => Promise<TRecord | null>;
  readonly create: (
    runtime: ModuleRuntimeContext,
    values: TValues,
    form?: FormMetadata,
  ) => Promise<TRecord>;
  readonly update: (
    runtime: ModuleRuntimeContext,
    recordId: string,
    values: Partial<TValues>,
    form?: FormMetadata,
  ) => Promise<TRecord>;
  readonly softDelete: (
    runtime: ModuleRuntimeContext,
    recordIds: readonly string[],
  ) => Promise<void>;
  readonly assignOwner: (
    runtime: ModuleRuntimeContext,
    recordIds: readonly string[],
    ownerId: string,
  ) => Promise<unknown>;
  readonly getOwnerOptions?: (
    runtime: ModuleRuntimeContext,
    search?: string,
  ) => Promise<readonly ModuleOwnerOption[]>;
  readonly getLookupOptions?: (
    runtime: ModuleRuntimeContext,
    field: FieldMetadata,
    values: Readonly<Record<string, unknown>>,
  ) => Promise<readonly ModuleLookupOption[]>;
  readonly changeStatus: (
    runtime: ModuleRuntimeContext,
    recordId: string,
    status: string,
    subStatus?: string,
  ) => Promise<void>;
  readonly exportRecord: (
    runtime: ModuleRuntimeContext,
    recordId: string,
    form?: FormMetadata,
  ) => Promise<Blob | string | null>;
  readonly exportList: (
    input: ModuleListInput,
  ) => Promise<Blob | string | null>;
  readonly getRelatedRecords: (
    input: RelatedRecordsInput,
  ) => Promise<ModuleListResult<TRecord>>;
  readonly createRelatedRecord: (
    input: RelatedRecordMutationInput<TValues>,
  ) => Promise<TRecord>;
  readonly updateRelatedRecord: (
    input: RelatedRecordMutationInput<Partial<TValues>>,
  ) => Promise<TRecord>;
  readonly deleteRelatedRecord: (
    input: RelatedRecordsInput & { readonly recordIds: readonly string[] },
  ) => Promise<void>;
  readonly getTimelineEntries?: (
    input: TimelineQueryInput,
  ) => Promise<readonly TimelineEntryMetadata[]>;
  readonly getWidgetData?: (input: WidgetDataInput) => Promise<unknown>;
}
