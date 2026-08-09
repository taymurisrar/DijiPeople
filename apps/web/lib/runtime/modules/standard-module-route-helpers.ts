import type { SessionUser } from "@/lib/auth";
import {
  getTableForms,
  type RuntimeCustomizationForm,
} from "@/lib/customization-forms";
import type { FormMetadata } from "../metadata-runtime.types";
import {
  buildStandardModuleRuntimeContext,
  buildStandardRuntimePrincipal,
  type StandardModuleRuntimeSpec,
} from "./standard-module-runtime";

export function buildStandardRouteRuntime({
  pageKind,
  recordId,
  sessionUser,
  spec,
}: {
  readonly pageKind: "list" | "detail" | "create" | "edit";
  readonly recordId?: string;
  readonly sessionUser: SessionUser | null;
  readonly spec: StandardModuleRuntimeSpec;
}) {
  return buildStandardModuleRuntimeContext({
    pageKind,
    principal: buildStandardRuntimePrincipal({
      userId: sessionUser?.userId,
      tenantId: sessionUser?.tenantId,
      displayName: sessionUser
        ? [sessionUser.firstName, sessionUser.lastName]
            .filter(Boolean)
            .join(" ")
        : null,
      name: sessionUser
        ? [sessionUser.firstName, sessionUser.lastName]
            .filter(Boolean)
            .join(" ")
        : null,
      email: sessionUser?.email,
      roleKeys: sessionUser?.roleKeys,
      roles: sessionUser?.roles,
      permissionKeys: sessionUser?.permissionKeys,
    }),
    recordId,
    spec,
  });
}

export async function buildPublishedStandardRouteRuntime(
  input: Parameters<typeof buildStandardRouteRuntime>[0],
) {
  const runtime = buildStandardRouteRuntime(input);
  const publishedForms = await getTableForms(
    input.spec.metadataTableKey ?? input.spec.moduleKey,
  );
  const widgetForms = publishedForms.filter(hasExplicitWidgetPlacement);
  if (widgetForms.length === 0) return runtime;

  return {
    ...runtime,
    metadata: {
      ...runtime.metadata,
      forms: mergePublishedWidgetForms(
        runtime.metadata.forms,
        widgetForms,
        input.spec.entityLogicalName,
      ),
    },
  };
}

export function resolveStandardActiveForm(
  forms: readonly FormMetadata[],
  formId: string,
  preferredType: FormMetadata["formType"] = "main",
) {
  const publishedForms = forms.filter(
    (form) =>
      form.lifecycleState === "published" ||
      form.lifecycleState === "deprecated",
  );
  return (
    publishedForms.find((form) => form.id === formId) ??
    publishedForms.find((form) => form.formType === preferredType) ??
    publishedForms.find((form) => form.formType === "main") ??
    publishedForms[0] ??
    null
  );
}

function hasExplicitWidgetPlacement(form: RuntimeCustomizationForm) {
  return form.layoutJson.tabs.some((tab) =>
    tab.sections.some((section) =>
      Object.prototype.hasOwnProperty.call(section, "components"),
    ),
  );
}

function mergePublishedWidgetForms(
  baseForms: readonly FormMetadata[],
  publishedForms: readonly RuntimeCustomizationForm[],
  entityLogicalName: string,
) {
  const mapped = publishedForms.map((form) =>
    mapPublishedForm(form, entityLogicalName),
  );
  const replacedBaseIds = new Set(
    mapped.flatMap((form) => {
      const matchingBase = baseForms.find(
        (candidate) =>
          candidate.formType === form.formType ||
          candidate.logicalName === form.logicalName,
      );
      return matchingBase ? [matchingBase.id] : [];
    }),
  );

  return [
    ...mapped,
    ...baseForms.filter((form) => !replacedBaseIds.has(form.id)),
  ];
}

function mapPublishedForm(
  form: RuntimeCustomizationForm,
  entityLogicalName: string,
): FormMetadata {
  const formType =
    form.type === "quick"
      ? "quickCreate"
      : form.formKey.toLowerCase().includes("minimal")
        ? "minimal"
        : "main";

  return {
    id: form.id,
    logicalName: form.formKey,
    displayName: form.name,
    version: "published",
    lifecycleState: "published",
    layer: "unmanaged",
    entityLogicalName,
    mode: form.type === "create" ? "create" : "edit",
    formType,
    columns: normalizeColumns(form.layoutJson.columns),
    tabs: form.layoutJson.tabs.map((tab, tabIndex) => ({
      id: tab.id,
      tabKey: tab.id,
      label: tab.label,
      order: tab.sequence ?? (tabIndex + 1) * 10,
      type: "fields",
      columns: normalizeColumns(tab.columns ?? form.layoutJson.columns),
      /* Carried through so a rule saved in the designer reaches the renderer. */
      ...(tab.visibilityRules?.length
        ? { visibilityRules: tab.visibilityRules }
        : {}),
      sectionIds: tab.sections.map((section) => section.id),
    })),
    sections: form.layoutJson.tabs.flatMap((tab, tabIndex) =>
      tab.sections.map((section, sectionIndex) => {
        const columns = normalizeColumns(
          section.columns ?? tab.columns ?? form.layoutJson.columns,
        );
        return {
          id: section.id,
          tabKey: tab.id,
          label: section.label,
          order:
            section.sequence ?? (tabIndex + 1) * 100 + (sectionIndex + 1) * 10,
          layout:
            columns === 1
              ? ("single-column" as const)
              : columns === 3
                ? ("three-column" as const)
                : ("two-column" as const),
          columns,
          ...(section.visibilityRules?.length
            ? { visibilityRules: section.visibilityRules }
            : {}),
          fields: section.fields.map((field, fieldIndex) => ({
            fieldLogicalName: field.columnKey,
            label: field.label,
            order: field.sequence ?? (fieldIndex + 1) * 10,
            isVisible: field.isVisible,
            isReadonly: field.readOnly,
            requirementLevel: field.required
              ? ("required" as const)
              : ("none" as const),
          })),
          components: (section.components ?? []).map(
            (component, componentIndex) => ({
              id: component.id,
              type: "widget" as const,
              widgetId: component.widgetId,
              widgetType: component.widgetType,
              label: component.label,
              order: component.sequence ?? (componentIndex + 1) * 10,
              columnSpan: normalizeColumns(component.columnSpan),
              height: component.height,
              isInitiallyCollapsed: component.isInitiallyCollapsed,
              placementConfig: component.placementConfig,
              lifecycleState: "published" as const,
            }),
          ),
        };
      }),
    ),
  };
}

function normalizeColumns(value?: number): 1 | 2 | 3 | 4 {
  if (value === 4) return 4;
  if (value === 3) return 3;
  if (value === 2) return 2;
  return 1;
}
