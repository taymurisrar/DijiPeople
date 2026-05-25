import type { RuntimeCustomizationForm } from "@/lib/customization-forms";

type FieldValueMap = Record<
  string,
  string | number | boolean | null | undefined
>;

export function RuntimeMetadataFormRenderer({
  form,
  values,
}: {
  form: RuntimeCustomizationForm;
  values: FieldValueMap;
}) {
  const tabs = form.layoutJson.tabs ?? [];
  if (tabs.length === 0) return null;

  return (
    <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
      <div className="mb-5">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">
          Metadata Form
        </p>
        <h3 className="mt-2 text-lg font-semibold text-foreground">
          {form.name}
        </h3>
      </div>
      <div className="grid gap-6">
        {tabs.map((tab) => (
          <section key={tab.id} className="grid gap-4">
            <h4 className="text-base font-semibold text-foreground">
              {tab.label}
            </h4>
            {(tab.sections ?? [])
              .filter((section) => section.isVisible !== false)
              .map((section) => (
                <div
                  className="rounded-2xl border border-border bg-white/80 p-4"
                  key={section.id}
                >
                  {section.labelVisible !== false ? (
                    <p className="mb-3 text-sm font-semibold text-foreground">
                      {section.label}
                    </p>
                  ) : null}
                  <dl className={`grid gap-4 ${gridClass(section.columns)}`}>
                    {(section.fields ?? [])
                      .filter((field) => field.isVisible !== false)
                      .map((field) => (
                        <div key={`${section.id}-${field.columnKey}`}>
                          <dt className="text-sm font-medium text-muted">
                            {field.label ?? field.columnKey}
                            {field.required ? (
                              <span className="ml-1 text-danger">*</span>
                            ) : null}
                          </dt>
                          <dd className="mt-1 text-sm text-foreground">
                            {formatValue(values[field.columnKey])}
                            {field.readOnly ? (
                              <span className="ml-2 text-xs text-muted">
                                read-only
                              </span>
                            ) : null}
                          </dd>
                        </div>
                      ))}
                  </dl>
                </div>
              ))}
          </section>
        ))}
      </div>
    </article>
  );
}

function gridClass(columns = 2) {
  if (columns === 1) return "md:grid-cols-1";
  if (columns === 3) return "md:grid-cols-3";
  return "md:grid-cols-2";
}

function formatValue(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined || value === "") return "Not set";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}
