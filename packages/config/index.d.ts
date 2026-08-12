export declare const DEFAULT_LOCAL_PORTS: Readonly<{
  landing: 3000;
  web: 3001;
  admin: 3002;
  api: 4000;
}>;

export declare const PRODUCTION_APP_URLS: Readonly<{
  landing: string;
  web: string;
  admin: string;
  api: string;
}>;

export declare const AGREEMENT_CATEGORY_OPTIONS: readonly Readonly<{
  value:
    | "PARTNER"
    | "LEAD_PROSPECT"
    | "CUSTOMER"
    | "TENANT_PROVISIONING"
    | "SUPPORT_SERVICE"
    | "OTHER";
  label: string;
}>[];

export declare const AGREEMENT_CATEGORY_VALUES: readonly (
  | "PARTNER"
  | "LEAD_PROSPECT"
  | "CUSTOMER"
  | "TENANT_PROVISIONING"
  | "SUPPORT_SERVICE"
  | "OTHER"
)[];

export declare function getAppPort(
  app: "landing" | "web" | "admin" | "api",
  env?: NodeJS.ProcessEnv,
): number;

export declare function getAppOrigin(
  app: "landing" | "web" | "admin" | "api",
  env?: NodeJS.ProcessEnv,
): string;

export declare function getApiBaseUrl(env?: NodeJS.ProcessEnv): string;

export declare function getAllowedCorsOrigins(env?: NodeJS.ProcessEnv): string[];

export declare function getLocalArchitecture(env?: NodeJS.ProcessEnv): {
  landing: string;
  web: string;
  admin: string;
  api: string;
};

export declare function getAppStage(env?: NodeJS.ProcessEnv): string;

export declare function isProductionLike(env?: NodeJS.ProcessEnv): boolean;

export declare function requireEnv(env: NodeJS.ProcessEnv, key: string): string;

export declare function validateDeploymentEnv(
  env?: NodeJS.ProcessEnv,
  options?: { app?: "api" | "web" | "admin" | "landing" },
): {
  app: string;
  productionLike: boolean;
  apiBaseUrl: string;
  allowedCorsOrigins: string[];
};

export type SystemWidgetAdapterMethod =
  | "getTimelineEntries"
  | "getWidgetData";

export interface SystemWidgetDefinition {
  readonly widgetKey: string;
  readonly aliases: readonly string[];
  readonly displayName: string;
  readonly widgetType: "system";
  readonly supportedModules?: readonly string[];
  readonly supportedModuleCapabilities: readonly string[];
  readonly supportedFormComponentTypes: readonly string[];
  readonly requiredDataAdapterMethods: readonly SystemWidgetAdapterMethod[];
  readonly requiredPermissions: readonly string[];
  readonly allowedRoles: readonly string[];
  readonly savedRecordRequired: boolean;
  readonly emptyState: string;
  readonly unsavedRecordMessage: string;
  readonly missingAdapterDiagnostic: string;
}

export type SystemWidgetAvailabilityStatus =
  | "available"
  | "custom-widget-disabled"
  | "missing-adapter"
  | "permission-denied"
  | "role-denied"
  | "unpublished-placement"
  | "unregistered"
  | "unsaved-record"
  | "unsupported-component"
  | "unsupported-module";

export interface SystemWidgetAvailability {
  readonly status: SystemWidgetAvailabilityStatus;
  readonly definition: SystemWidgetDefinition | null;
  readonly message: string;
  readonly missingAdapterMethods?: readonly SystemWidgetAdapterMethod[];
}

export declare const SYSTEM_WIDGET_REGISTRY: Readonly<
  Record<string, SystemWidgetDefinition>
>;
export declare const SYSTEM_MODULE_CAPABILITIES: Readonly<
  Record<string, readonly string[]>
>;
export declare function listSupportedSystemWidgets(
  moduleKey: string,
): readonly SystemWidgetDefinition[];

export declare function resolveSystemWidgetDefinition(
  widgetKeyOrType?: string,
): SystemWidgetDefinition | null;

export declare function resolveSystemWidgetAvailability(input: {
  readonly widgetKey?: string;
  readonly widgetType?: string;
  readonly lifecycleState?: string;
  readonly formComponentType?: string;
  readonly moduleKey: string;
  readonly moduleCapabilities?: readonly string[];
  readonly recordId?: string;
  readonly adapterMethods?: readonly string[];
  readonly permissionKeys?: readonly string[];
  readonly roleKeys?: readonly string[];
}): SystemWidgetAvailability;

export * from "./platform-runtime-schema";
export * from "./platform-runtime-views";
