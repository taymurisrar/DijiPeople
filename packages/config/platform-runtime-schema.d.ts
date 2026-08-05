export interface RuntimeSchemaField {
  key: string; label: string; type: string; relationModel: string | null;
  required: boolean; nullable: boolean; list: boolean; enumValues: string[];
  readable: boolean; creatable: boolean; editable: boolean; filterable: boolean;
  sortable: boolean; searchable: boolean; exportable: boolean;
  systemManaged: boolean; sensitive: boolean; defaultControl: string; defaultValue: string | null;
}
export declare const PLATFORM_RUNTIME_SCHEMA_MANIFEST: {
  version: number;
  modules: Record<string, { moduleKey: string; model: string; fields: Record<string, RuntimeSchemaField> }>;
  models: Record<string, { model: string; fields: Record<string, RuntimeSchemaField> }>;
};
export declare function getRuntimeSchema(moduleKey: string): { moduleKey: string; model: string; fields: Record<string, RuntimeSchemaField> } | null;
export declare function resolveRuntimeField(moduleKey: string, fieldPath: string): RuntimeSchemaField | null;
export declare function validateRuntimeDefinition(definition: unknown): string[];
