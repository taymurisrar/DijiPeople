import type {
  MetadataLayer,
  MetadataLifecycleState,
} from "./metadata-runtime.types";

export type SolutionComponentType =
  | "entity"
  | "field"
  | "form"
  | "view"
  | "command"
  | "optionset"
  | "relationship"
  | "security-role"
  | "field-security-rule"
  | "tenant-branding"
  | "tenant-font"
  | "web-resource";

export type SolutionInstallMode = "managed" | "unmanaged";

export interface SolutionDependency {
  readonly componentType: SolutionComponentType;
  readonly logicalName: string;
  readonly minVersion?: string;
  readonly solutionName?: string;
}

export interface SolutionComponent {
  readonly id: string;
  readonly type: SolutionComponentType;
  readonly logicalName: string;
  readonly displayName?: string;
  readonly version: string;
  readonly layer: MetadataLayer;
  readonly lifecycleState: MetadataLifecycleState;
  readonly dependencies?: readonly SolutionDependency[];
  readonly isCustomizable?: boolean;
}

export interface SolutionManifest {
  readonly name: string;
  readonly displayName: string;
  readonly version: string;
  readonly publisherName: string;
  readonly publisherPrefix: string;
  readonly installMode: SolutionInstallMode;
  readonly description?: string;
  readonly components: readonly SolutionComponent[];
  readonly dependencies?: readonly SolutionDependency[];
  readonly exportedAt?: string;
  readonly schemaVersion: string;
}
