import type {
  EntityMetadata,
  FieldMetadata,
  FormMetadata,
  ViewMetadata,
} from "./metadata-runtime.types";

export interface MetadataValidationIssue {
  readonly code: "missing-field" | "wrong-entity";
  readonly message: string;
  readonly logicalName: string;
}

export function resolveEntityMetadata(
  entities: readonly EntityMetadata[],
  entityLogicalName: string,
) {
  return (
    entities.find((entity) => entity.logicalName === entityLogicalName) ?? null
  );
}

export function resolvePublishedForms(
  forms: readonly FormMetadata[],
  entityLogicalName: string,
) {
  return forms.filter(
    (form) =>
      form.entityLogicalName === entityLogicalName &&
      form.lifecycleState === "published",
  );
}

export function resolveDefaultForm(
  entity: EntityMetadata,
  forms: readonly FormMetadata[],
  formKey?: string | null,
) {
  const publishedForms = resolvePublishedForms(forms, entity.logicalName);
  return (
    (formKey
      ? publishedForms.find((form) => form.logicalName === formKey)
      : null) ??
    publishedForms.find(
      (form) => form.logicalName === entity.defaultFormLogicalName,
    ) ??
    publishedForms[0] ??
    null
  );
}

export function resolvePublishedViews(
  views: readonly ViewMetadata[],
  entityLogicalName: string,
) {
  return views.filter(
    (view) =>
      view.entityLogicalName === entityLogicalName &&
      view.lifecycleState === "published",
  );
}

export function resolveDefaultView(
  entity: EntityMetadata,
  views: readonly ViewMetadata[],
  viewKey?: string | null,
) {
  const publishedViews = resolvePublishedViews(views, entity.logicalName);
  return (
    (viewKey
      ? publishedViews.find((view) => view.logicalName === viewKey)
      : null) ??
    publishedViews.find(
      (view) => view.logicalName === entity.defaultViewLogicalName,
    ) ??
    publishedViews[0] ??
    null
  );
}

export function resolveFieldMetadata(
  entity: EntityMetadata,
  fieldLogicalName: string,
): FieldMetadata | null {
  return (
    entity.fields.find((field) => field.logicalName === fieldLogicalName) ??
    null
  );
}

export function validateFormFields(
  entity: EntityMetadata,
  form: FormMetadata,
): readonly MetadataValidationIssue[] {
  const issues: MetadataValidationIssue[] = [];
  const entityFieldNames = new Set(
    entity.fields.map((field) => field.logicalName),
  );

  if (form.entityLogicalName !== entity.logicalName) {
    issues.push({
      code: "wrong-entity",
      logicalName: form.logicalName,
      message: `Form ${form.logicalName} targets ${form.entityLogicalName}, not ${entity.logicalName}.`,
    });
  }

  for (const section of form.sections) {
    for (const field of section.fields) {
      if (!entityFieldNames.has(field.fieldLogicalName)) {
        issues.push({
          code: "missing-field",
          logicalName: field.fieldLogicalName,
          message: `Form ${form.logicalName} references missing field ${field.fieldLogicalName}.`,
        });
      }
    }
  }

  return issues;
}

export function validateViewColumns(
  entity: EntityMetadata,
  view: ViewMetadata,
): readonly MetadataValidationIssue[] {
  const issues: MetadataValidationIssue[] = [];
  const entityFieldNames = new Set(
    entity.fields.map((field) => field.logicalName),
  );

  if (view.entityLogicalName !== entity.logicalName) {
    issues.push({
      code: "wrong-entity",
      logicalName: view.logicalName,
      message: `View ${view.logicalName} targets ${view.entityLogicalName}, not ${entity.logicalName}.`,
    });
  }

  for (const column of view.columns) {
    if (!entityFieldNames.has(column.fieldLogicalName)) {
      issues.push({
        code: "missing-field",
        logicalName: column.fieldLogicalName,
        message: `View ${view.logicalName} references missing column ${column.fieldLogicalName}.`,
      });
    }
  }

  return issues;
}
