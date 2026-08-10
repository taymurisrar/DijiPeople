export interface RuntimeViewRule {
  label: string;
  field: string;
  values?: unknown[];
}
export type RuntimeViewRules = Partial<
  Record<'active' | 'my-records', RuntimeViewRule>
>;
export declare const PLATFORM_MODULE_VIEW_RULES: Record<string, RuntimeViewRules>;
export declare function listRuntimeViewKeys(moduleKey: string): string[];
export declare function resolveRuntimeViewRule(
  moduleKey: string,
  viewKey: string | undefined,
): RuntimeViewRule | null;
export declare function runtimeViewLabel(
  moduleKey: string,
  viewKey: string,
): string | null;
