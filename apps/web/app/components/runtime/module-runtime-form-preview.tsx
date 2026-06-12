import type {
  EntityMetadata,
  FormMetadata,
} from "../../../lib/runtime/metadata-runtime.types";
import type { RuntimeRecordData } from "./module-runtime-ui.types";

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
      <div className="grid gap-5">
        {form.sections.map((section) => (
          <section key={section.id} className="grid gap-3">
            <h4 className="text-base font-semibold text-foreground">
              {section.label}
            </h4>
            <dl className="grid gap-4 md:grid-cols-2">
              {section.fields
                .filter((field) => field.isVisible !== false)
                .map((formField) => {
                  const field = fieldsByName.get(formField.fieldLogicalName);

                  if (!field) return null;

                  return (
                    <div key={`${section.id}-${formField.fieldLogicalName}`}>
                      <dt className="text-sm font-medium text-muted">
                        {formField.label ?? field.displayName}
                      </dt>
                      <dd className="mt-1 text-sm text-foreground">
                        {formatValue(values[field.logicalName])}
                      </dd>
                    </div>
                  );
                })}
            </dl>
          </section>
        ))}
      </div>
    </article>
  );
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "Not set";
  return String(value);
}
