import type { CommandDefinition } from "./command-runtime.types";
import type {
  EntityMetadata,
  FormMetadata,
  ViewMetadata,
} from "./metadata-runtime.types";
import type { SecurityRuntimeContext } from "./security-runtime.types";
import type { SolutionManifest } from "./solution-runtime.types";
import type { TenantRuntimeConfig } from "./tenant-runtime.types";

export type ModuleRuntimePageKind = "list" | "detail" | "create" | "edit";
export type ModuleRuntimeCapability =
  | "approvalTracking"
  | "reportingHierarchy"
  | "timeline"
  | (string & {});

export interface ModuleConfig {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
  readonly entityLogicalName: string;
  readonly routeBase: string;
  readonly recordNavigation?: boolean;
  readonly defaultViewLogicalName?: string;
  readonly defaultFormLogicalName?: string;
  readonly enabled?: boolean;
  readonly iconName?: string;
  readonly order?: number;
  readonly dependencies?: readonly string[];
  readonly capabilities?: readonly ModuleRuntimeCapability[];
}

export interface ModuleMetadataBundle {
  readonly entity: EntityMetadata;
  readonly forms: readonly FormMetadata[];
  readonly views: readonly ViewMetadata[];
  readonly commands: readonly CommandDefinition[];
}

export interface ModuleRuntimeContext {
  readonly tenant: TenantRuntimeConfig;
  readonly security: SecurityRuntimeContext;
  readonly module: ModuleConfig;
  readonly metadata: ModuleMetadataBundle;
  readonly solutions?: readonly SolutionManifest[];
  readonly pageKind?: ModuleRuntimePageKind;
  readonly recordId?: string;
  readonly cacheKeys?: readonly string[];
}
