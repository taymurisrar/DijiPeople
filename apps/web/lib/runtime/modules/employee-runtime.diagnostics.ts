import type { CommandDefinition } from "../command-runtime.types";
import type { ModuleRuntimeContext } from "../module-runtime.types";
import {
  validateFormFields,
  validateViewColumns,
} from "../metadata-runtime.resolver";

export interface EmployeeRuntimeDiagnostic {
  readonly code:
    | "missing-entity"
    | "missing-default-form"
    | "missing-default-view"
    | "invalid-form-field"
    | "invalid-view-column"
    | "missing-status-field"
    | "missing-command-permission";
  readonly message: string;
}

export function getEmployeeRuntimeDiagnostics(
  runtime: ModuleRuntimeContext,
): readonly EmployeeRuntimeDiagnostic[] {
  const diagnostics: EmployeeRuntimeDiagnostic[] = [];
  const entity = runtime.metadata.entity;

  if (!entity) {
    return [
      {
        code: "missing-entity",
        message: "Employee runtime entity metadata is missing.",
      },
    ];
  }

  const defaultForm = runtime.metadata.forms.find(
    (form) => form.logicalName === runtime.module.defaultFormLogicalName,
  );
  const defaultView = runtime.metadata.views.find(
    (view) => view.logicalName === runtime.module.defaultViewLogicalName,
  );

  if (!defaultForm) {
    diagnostics.push({
      code: "missing-default-form",
      message: `Default form ${runtime.module.defaultFormLogicalName ?? "(none)"} is missing.`,
    });
  }

  if (!defaultView) {
    diagnostics.push({
      code: "missing-default-view",
      message: `Default view ${runtime.module.defaultViewLogicalName ?? "(none)"} is missing.`,
    });
  }

  for (const form of runtime.metadata.forms) {
    diagnostics.push(
      ...validateFormFields(entity, form).map((issue) => ({
        code: "invalid-form-field" as const,
        message: issue.message,
      })),
    );
  }

  for (const view of runtime.metadata.views) {
    diagnostics.push(
      ...validateViewColumns(entity, view).map((issue) => ({
        code: "invalid-view-column" as const,
        message: issue.message,
      })),
    );
  }

  for (const fieldName of [
    entity.ownerField,
    entity.statusField,
    entity.subStatusField,
  ]) {
    if (
      fieldName &&
      !entity.fields.some((field) => field.logicalName === fieldName)
    ) {
      diagnostics.push({
        code: "missing-status-field",
        message: `Status group field ${fieldName} is not present on Employee entity metadata.`,
      });
    }
  }

  diagnostics.push(
    ...findCommandsMissingPermissions(runtime.metadata.commands),
  );

  return diagnostics;
}

export function warnEmployeeRuntimeDiagnostics(
  runtime: ModuleRuntimeContext,
  logger: Pick<Console, "warn"> = console,
) {
  if (process.env.NODE_ENV === "production") return;

  const diagnostics = getEmployeeRuntimeDiagnostics(runtime);

  if (diagnostics.length === 0) return;

  logger.warn("[EmployeeRuntime] diagnostics", diagnostics);
}

function findCommandsMissingPermissions(
  commands: readonly CommandDefinition[],
): readonly EmployeeRuntimeDiagnostic[] {
  return commands
    .filter(
      (command) =>
        command.scope !== "system" ||
        ![
          "system.back",
          "system.refresh",
          "system.save",
          "system.saveAndClose",
        ].includes(command.key),
    )
    .filter((command) => !command.permission)
    .map((command) => ({
      code: "missing-command-permission" as const,
      message: `Command ${command.key} does not declare a permission requirement.`,
    }));
}
