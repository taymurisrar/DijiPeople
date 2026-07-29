import type {
  EntityMetadata,
  FormMetadata,
} from "../../../lib/runtime/metadata-runtime.types";
import type { RuntimeRecordData } from "./module-runtime-ui.types";
import {
  columnsFromSectionLayout,
  FormGrid,
  FormGridItem,
  normalizeFormGridColumnCount,
} from "@/app/components/metadata/form-layout-grid";

export function ModuleRuntimeFormPreview({
  entity,
  form,
  values,
}: {
  readonly entity: EntityMetadata;
  readonly form: FormMetadata;
  readonly values: RuntimeRecordData;
}) {
  const fieldsByName = new Map(
    entity.fields.map((field) => [field.logicalName, field]),
  );

  return (
    <article className="rounded-lg border border-border bg-surface p-6 shadow-sm">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase text-muted">
          Metadata Form
        </p>
        <h3 className="mt-2 text-lg font-semibold text-foreground">
          {form.displayName}
        </h3>
      </div>
      <FormGrid columns={form.columns ?? 1} gap="section" kind="preview">
        {form.sections.map((section) => (
          <FormGridItem
            column={section.column}
            columnSpan={section.columnSpan}
            key={section.id}
            parentColumns={form.columns ?? 1}
          >
            <section className="grid gap-3">
              <h4 className="text-base font-semibold text-foreground">
                {section.label}
              </h4>
              <FormGrid
                columns={normalizeFormGridColumnCount(
                  section.columns ?? columnsFromSectionLayout(section.layout),
                )}
                kind="section"
              >
                {section.fields
                  .filter((field) => field.isVisible !== false)
                  .map((formField) => {
                    const field = fieldsByName.get(formField.fieldLogicalName);

                    if (!field) return null;

                    return (
                      <FormGridItem
                        columnSpan={formField.columnSpan}
                        key={`${section.id}-${formField.fieldLogicalName}`}
                        parentColumns={
                          section.columns ?? columnsFromSectionLayout(section.layout)
                        }
                      >
                        <dt className="text-sm font-medium text-muted">
                          {formField.label ?? field.displayName}
                        </dt>
                        <dd className="mt-1 text-sm text-foreground">
                          {formatValue(values[field.logicalName])}
                        </dd>
                      </FormGridItem>
                    );
                  })}
              </FormGrid>
            </section>
          </FormGridItem>
        ))}
      </FormGrid>
    </article>
  );
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}
