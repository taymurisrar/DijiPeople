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
  readonly parentLookupField?: string;
}

export interface RelatedRecordMutationInput<
  TValues = Readonly<Record<string, unknown>>,
> {
  readonly runtime: ModuleRuntimeContext;
  readonly parentRecordId: string;
  readonly subgrid: RelatedSubgridMetadata;
  readonly values: TValues;
  readonly recordId?: string;
  readonly parentLookupField?: string;
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

/**
 * A write a widget needs to perform against its own record — add/edit/remove
 * a related row, promote something to primary, and so on. `action` is a
 * widget-owned string (e.g. `"assign"`, `"setPrimary"`, `"remove"`); the
 * shared widget-rendering code never needs to know what endpoint, if any, a
 * given action calls, only that it can ask the record's own data adapter to
 * run it. This is the write-side counterpart to `getWidgetData` — the same
 * reason that method exists (a shared widget file must not hardcode a
 * module's route) applies here.
 */
export interface WidgetActionInput {
  readonly runtime: ModuleRuntimeContext;
  readonly recordId: string;
  readonly widget: WidgetMetadata;
  readonly action: string;
  readonly payload?: Readonly<Record<string, unknown>>;
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
  readonly employeeLevelId?: string | null;
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
  /*
   * BUG-3376 — `search` is optional and additive on purpose. A caller built
   * before this existed still compiles and still gets the (now larger, see
   * `ENTITY_LOOKUP_PAGE_SIZE`) default page; a caller that wires the field's
   * `onSearch` can pass the typed query straight through instead of filtering
   * whatever the first response happened to contain.
   */
  readonly getLookupOptions?: (
    runtime: ModuleRuntimeContext,
    field: FieldMetadata,
    values: Readonly<Record<string, unknown>>,
    options?: Readonly<{ search?: string }>,
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
  readonly runWidgetAction?: (input: WidgetActionInput) => Promise<unknown>;
}
