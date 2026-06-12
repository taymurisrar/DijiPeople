import type { CustomizationComponentType } from "@/app/(authenticated)/settings/customization/types";

export type MetadataLayerAction = "create" | "modify" | "remove" | "reference";

export type MetadataLayerLifecycleState =
  | "draft"
  | "published"
  | "deprecated"
  | "archived";

export type MetadataLayerComponent<TMetadata = unknown> = {
  readonly layerId: string;
  readonly packageId: string;
  readonly componentId: string;
  readonly componentType: CustomizationComponentType | string;
  readonly componentKey: string;
  readonly baseComponentId?: string | null;
  readonly layerOrder: number;
  readonly layerAction: MetadataLayerAction;
  readonly lifecycleState: MetadataLayerLifecycleState;
  readonly version: string;
  readonly checksum?: string | null;
  readonly publishedAt?: string | null;
  readonly publishedBy?: string | null;
  readonly createdFromComponentId?: string | null;
  readonly isSystem: boolean;
  readonly isManaged: boolean;
  readonly isCustomizable: boolean;
  readonly metadata: TMetadata;
};

export type MetadataDependencyIssue = {
  readonly severity: "error" | "warning" | "info";
  readonly componentId?: string | null;
  readonly componentType?: string | null;
  readonly message: string;
  readonly blocking: boolean;
};
