import type { CommandDefinition } from "./command-runtime.types";
import type {
  EntityMetadata,
  FormMetadata,
  ViewMetadata,
} from "./metadata-runtime.types";
import type {
  ModuleConfig,
  ModuleMetadataBundle,
  ModuleRuntimeContext,
  ModuleRuntimePageKind,
} from "./module-runtime.types";
import type { SecurityRuntimeContext } from "./security-runtime.types";
import type { SolutionManifest } from "./solution-runtime.types";
import type { TenantRuntimeConfig } from "./tenant-runtime.types";
import {
  resolveDefaultForm,
  resolveDefaultView,
  resolveEntityMetadata,
  resolvePublishedForms,
  resolvePublishedViews,
} from "./metadata-runtime.resolver";

export interface ModuleRuntimeResolverInput {
  readonly tenant: TenantRuntimeConfig;
  readonly security: SecurityRuntimeContext;
  readonly moduleKey: string;
  readonly modules: readonly ModuleConfig[];
  readonly entities: readonly EntityMetadata[];
  readonly forms: readonly FormMetadata[];
  readonly views: readonly ViewMetadata[];
  readonly commands: readonly CommandDefinition[];
  readonly solutions?: readonly SolutionManifest[];
  readonly pageKind?: ModuleRuntimePageKind;
  readonly recordId?: string;
  readonly formKey?: string | null;
  readonly viewKey?: string | null;
}

export interface ModuleRuntimeResolution {
  readonly context: ModuleRuntimeContext | null;
  readonly errors: readonly string[];
}

export function resolveModuleRuntimeContext(
  input: ModuleRuntimeResolverInput,
): ModuleRuntimeResolution {
  const moduleConfig =
    input.modules.find((candidate) => candidate.key === input.moduleKey) ??
    null;

  if (!moduleConfig) {
    return {
      context: null,
      errors: [`Module ${input.moduleKey} is not registered.`],
    };
  }

  const entity = resolveEntityMetadata(
    input.entities,
    moduleConfig.entityLogicalName,
  );

  if (!entity) {
    return {
      context: null,
      errors: [`Entity ${moduleConfig.entityLogicalName} is not registered.`],
    };
  }

  const forms = resolvePublishedForms(input.forms, entity.logicalName);
  const views = resolvePublishedViews(input.views, entity.logicalName);
  const defaultForm = resolveDefaultForm(
    entity,
    forms,
    input.formKey ?? moduleConfig.defaultFormLogicalName,
  );
  const defaultView = resolveDefaultView(
    entity,
    views,
    input.viewKey ?? moduleConfig.defaultViewLogicalName,
  );
  const metadata: ModuleMetadataBundle = {
    entity,
    forms: defaultForm
      ? prioritizeMetadata(forms, defaultForm.logicalName)
      : forms,
    views: defaultView
      ? prioritizeMetadata(views, defaultView.logicalName)
      : views,
    commands: input.commands,
  };

  return {
    context: {
      tenant: input.tenant,
      security: input.security,
      module: moduleConfig,
      metadata,
      solutions: input.solutions,
      pageKind: input.pageKind,
      recordId: input.recordId,
      cacheKeys: [
        input.tenant.cachePartitionKey,
        `module:${moduleConfig.key}`,
        `entity:${entity.logicalName}`,
      ],
    },
    errors: [],
  };
}

function prioritizeMetadata<T extends { readonly logicalName: string }>(
  metadata: readonly T[],
  logicalName: string,
) {
  return [
    ...metadata.filter((entry) => entry.logicalName === logicalName),
    ...metadata.filter((entry) => entry.logicalName !== logicalName),
  ];
}
