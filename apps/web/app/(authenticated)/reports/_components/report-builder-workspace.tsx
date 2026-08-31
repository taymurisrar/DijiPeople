"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { EmptyState } from "@/app/components/ui/empty-state";
import { SectionCard } from "@/app/components/ui/section-card";
import {
  MultiSelectField,
  SelectField,
  TextAreaField,
  TextField,
} from "@/app/components/ui/form-control";
import { PERIOD_PRESET_OPTIONS } from "@/app/components/filters";
import type {
  BuilderField,
  CatalogSource,
  ReportFilterOperator,
} from "../_lib/reporting-types";
import {
  createReportDefinition,
  fetchBuilderFields,
  reportingErrorMessage,
} from "../_lib/reporting-browser";

/*
 * Building a custom report.
 *
 * The field list is **not** taken from `/reporting/catalog`. It comes from
 * `/reporting/builder-fields?sourceKey=`, which returns the same fields plus
 * each one's `supportedOperators` — so the operator dropdown offers exactly
 * what the engine will accept for that field's type, rather than a fixed twelve
 * of which nine produce a 400.
 *
 * Three things a builder could offer and this one deliberately does not,
 * because `ReportExecutionService.run` ignores all three when it executes a
 * saved definition — it always returns tabular records:
 *
 *   - `groupBy`
 *   - `aggregations`
 *   - `visualization`
 *
 * The DTO accepts them and the validator checks them, so they would save
 * cleanly and then change nothing at all. A setting that is stored, validated
 * and never read is the most convincing kind of dead control, and the honest
 * thing is not to offer it until execution honours it. Noted in this work
 * package's report.
 */

export type ReportBuilderWorkspaceProps = {
  sources: readonly CatalogSource[];
  defaultSourceKey?: string;
};

type FilterRow = {
  id: string;
  field: string;
  operator: ReportFilterOperator | "";
  value: string;
  valueTo: string;
};

const VISIBILITY_OPTIONS = [
  { value: "PRIVATE", label: "Only me" },
  { value: "TENANT", label: "Everyone in this workspace" },
] as const;

const OPERATOR_LABELS: Record<string, string> = {
  eq: "is",
  ne: "is not",
  contains: "contains",
  startswith: "starts with",
  endswith: "ends with",
  gt: "is greater than",
  gte: "is at least",
  lt: "is less than",
  lte: "is at most",
  in: "is one of",
  notin: "is not one of",
  between: "is between",
  isnull: "is empty",
  isnotnull: "is not empty",
};

const VALUELESS_OPERATORS: readonly string[] = ["isnull", "isnotnull"];

/** Operators whose operand is a list rather than a scalar. */
const LIST_OPERATORS: readonly string[] = ["in", "notin"];

export function ReportBuilderWorkspace({
  sources,
  defaultSourceKey,
}: ReportBuilderWorkspaceProps) {
  const router = useRouter();

  const [sourceKey, setSourceKey] = React.useState(
    defaultSourceKey ?? sources[0]?.key ?? "",
  );
  const [fields, setFields] = React.useState<BuilderField[]>([]);
  const [fieldsError, setFieldsError] = React.useState<string | null>(null);
  const [loadingFields, setLoadingFields] = React.useState(false);

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [columns, setColumns] = React.useState<string[]>([]);
  const [sortField, setSortField] = React.useState("");
  const [sortDirection, setSortDirection] = React.useState("desc");
  const [preset, setPreset] = React.useState("last_30_days");
  const [visibility, setVisibility] = React.useState("PRIVATE");
  const [filters, setFilters] = React.useState<FilterRow[]>([]);

  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!sourceKey) return;

    let cancelled = false;
    setLoadingFields(true);
    setFieldsError(null);

    fetchBuilderFields<BuilderField[]>(sourceKey)
      .then((next) => {
        if (cancelled) return;
        setFields(Array.isArray(next) ? next : []);
        /*
         * Columns, sort and filters all name fields of the *previous* source.
         * Carrying them across would produce a definition the validator
         * rejects field by field, with the reader unable to see why.
         */
        setColumns([]);
        setSortField("");
        setFilters([]);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setFields([]);
        setFieldsError(reportingErrorMessage(caught));
      })
      .finally(() => {
        if (!cancelled) setLoadingFields(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sourceKey]);

  const fieldsByKey = React.useMemo(
    () => new Map(fields.map((field) => [field.key, field])),
    [fields],
  );

  const filterableFields = fields.filter((field) => field.filterable);
  const sortableFields = fields.filter((field) => field.sortable);

  const canSave =
    name.trim().length >= 2 &&
    category.trim().length > 0 &&
    sourceKey.length > 0 &&
    columns.length > 0 &&
    !saving;

  const save = React.useCallback(async () => {
    setSaving(true);
    setError(null);

    /*
     * `forbidNonWhitelisted` is on, so every optional key is added only when it
     * has a value rather than sent as `undefined` — and each filter row is
     * reduced to exactly `field`, `operator` and the operands the operator
     * takes. A `value: ""` on an `isnull` row is a 400.
     */
    const payloadFilters = filters
      .filter((row) => row.field && row.operator)
      .map((row) => {
        const base: Record<string, unknown> = {
          field: row.field,
          operator: row.operator,
        };
        if (!VALUELESS_OPERATORS.includes(row.operator)) {
          /*
           * `in` and `notin` take a *list*. The engine rejects a string with
           * "requires a list of values", so the comma-separated text the field
           * hint asks for is split here rather than sent as typed.
           */
          base.value = LIST_OPERATORS.includes(row.operator)
            ? row.value
                .split(",")
                .map((part) => part.trim())
                .filter(Boolean)
            : row.value;

          if (row.operator === "between") base.valueTo = row.valueTo;
        }
        return base;
      });

    try {
      const created = await createReportDefinition<{ id?: string }>({
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        category: category.trim(),
        dataSourceKey: sourceKey,
        config: {
          columns,
          ...(payloadFilters.length ? { filters: payloadFilters } : {}),
          ...(sortField ? { sortField, sortDirection } : {}),
          ...(preset ? { preset } : {}),
        },
        visibilityScope: visibility,
      });

      router.push(
        created?.id
          ? `/reports/library?target=${encodeURIComponent(`def:${created.id}`)}`
          : "/reports/my-reports",
      );
    } catch (caught) {
      setError(reportingErrorMessage(caught));
      setSaving(false);
    }
  }, [
    category,
    columns,
    description,
    filters,
    name,
    preset,
    router,
    sortDirection,
    sortField,
    sourceKey,
    visibility,
  ]);

  if (sources.length === 0) {
    return (
      <EmptyState
        description="No reporting data sources are available to your role, so there is nothing to build a report on. Reporting access is granted separately from the modules it reports on."
        title="No data sources are available to you"
      />
    );
  }

  return (
    <div className="grid gap-5 [&>*]:min-w-0">
      <SectionCard
        description="A report is a data source, a set of columns, and the filters that narrow them. It runs against each reader's own access, so sharing a report is not sharing its rows."
        title="What this report reads"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <SelectField
            hint={
              sources.find((source) => source.key === sourceKey)?.description
            }
            label="Data source"
            onChange={setSourceKey}
            options={sources.map((source) => ({
              value: source.key,
              label: source.label,
            }))}
            required
            value={sourceKey}
          />

          <SelectField
            hint="The default window when someone opens the report. They can change it, and the change is in the URL."
            label="Default period"
            onChange={setPreset}
            options={PERIOD_PRESET_OPTIONS.filter(
              (option) => option.value !== "custom",
            ).map((option) => ({ ...option }))}
            value={preset}
          />
        </div>

        {fieldsError ? (
          <p className="mt-4 text-sm text-danger" role="alert">
            {fieldsError}
          </p>
        ) : null}
      </SectionCard>

      <SectionCard
        description="Only the fields your role can see are listed, and the list is rebuilt when you change the data source."
        title="Columns"
      >
        {loadingFields ? (
          <p className="text-sm text-muted" role="status">
            Loading the fields available on this data source...
          </p>
        ) : fields.length === 0 ? (
          <EmptyState
            description="This data source exposes no fields your role can select. Choose another source, or ask an administrator about your reporting field permissions."
            title="No selectable fields on this source"
          />
        ) : (
          <div className="grid gap-4">
            <MultiSelectField
              hint="Columns appear in the order they are listed here, which is the order the data source declares them."
              label="Columns to include"
              onChange={setColumns}
              options={fields.map((field) => ({
                value: field.key,
                label: field.label,
              }))}
              required
              value={columns}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <SelectField
                hint="Only fields the engine will actually sort on are listed."
                label="Sort by"
                onChange={setSortField}
                options={sortableFields.map((field) => ({
                  value: field.key,
                  label: field.label,
                }))}
                placeholder="No sort"
                value={sortField}
              />
              <SelectField
                disabled={!sortField}
                label="Sort direction"
                onChange={setSortDirection}
                options={[
                  { value: "desc", label: "Highest or latest first" },
                  { value: "asc", label: "Lowest or earliest first" },
                ]}
                value={sortDirection}
              />
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard
        description="Filters saved here always apply. A reader can narrow further, but cannot remove them."
        title="Filters"
      >
        <div className="grid gap-4">
          {filters.map((row, index) => {
            const field = fieldsByKey.get(row.field);
            const operators = field?.supportedOperators ?? [];
            const needsValue = !VALUELESS_OPERATORS.includes(row.operator);

            return (
              <div
                className="grid gap-3 rounded-[18px] border border-border p-4 md:grid-cols-4"
                key={row.id}
              >
                <SelectField
                  label={`Field ${index + 1}`}
                  onChange={(next) =>
                    setFilters((current) =>
                      current.map((candidate) =>
                        candidate.id === row.id
                          ? { ...candidate, field: next, operator: "", value: "" }
                          : candidate,
                      ),
                    )
                  }
                  options={filterableFields.map((candidate) => ({
                    value: candidate.key,
                    label: candidate.label,
                  }))}
                  placeholder="Select a field"
                  value={row.field}
                />

                <SelectField
                  disabled={!row.field}
                  label="Condition"
                  onChange={(next) =>
                    setFilters((current) =>
                      current.map((candidate) =>
                        candidate.id === row.id
                          ? {
                              ...candidate,
                              operator: next as ReportFilterOperator,
                            }
                          : candidate,
                      ),
                    )
                  }
                  options={operators.map((operator) => ({
                    value: operator,
                    label: OPERATOR_LABELS[operator] ?? operator,
                  }))}
                  placeholder="Select a condition"
                  value={row.operator}
                />

                {needsValue ? (
                  <TextField
                    disabled={!row.operator}
                    hint={
                      row.operator === "in" || row.operator === "notin"
                        ? "Comma-separated"
                        : undefined
                    }
                    label="Value"
                    onChange={(next) =>
                      setFilters((current) =>
                        current.map((candidate) =>
                          candidate.id === row.id
                            ? { ...candidate, value: next }
                            : candidate,
                        ),
                      )
                    }
                    value={row.value}
                  />
                ) : (
                  <p className="self-end pb-3 text-xs text-muted">
                    This condition takes no value.
                  </p>
                )}

                <div className="flex items-end gap-2">
                  {row.operator === "between" ? (
                    <TextField
                      label="Upper bound"
                      onChange={(next) =>
                        setFilters((current) =>
                          current.map((candidate) =>
                            candidate.id === row.id
                              ? { ...candidate, valueTo: next }
                              : candidate,
                          ),
                        )
                      }
                      value={row.valueTo}
                    />
                  ) : null}

                  <Button
                    aria-label={`Remove filter ${index + 1}${
                      field ? ` on ${field.label}` : ""
                    }`}
                    leftIcon={<Trash2 aria-hidden="true" className="h-4 w-4" />}
                    onClick={() =>
                      setFilters((current) =>
                        current.filter((candidate) => candidate.id !== row.id),
                      )
                    }
                    size="xs"
                    variant="ghost"
                  >
                    Remove
                  </Button>
                </div>
              </div>
            );
          })}

          <div>
            <Button
              aria-label="Add a filter to this report"
              disabled={filterableFields.length === 0}
              leftIcon={<Plus aria-hidden="true" className="h-4 w-4" />}
              onClick={() =>
                setFilters((current) => [
                  ...current,
                  {
                    id: `filter-${current.length}-${Date.now()}`,
                    field: "",
                    operator: "",
                    value: "",
                    valueTo: "",
                  },
                ])
              }
              size="sm"
              variant="secondary"
            >
              Add a filter
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        description="The name is what people search for, so make it say what the report answers."
        title="Name and sharing"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            label="Report name"
            onChange={setName}
            placeholder="Joiners by department, last quarter"
            required
            value={name}
          />
          <TextField
            hint="Reports are grouped by category in the library."
            label="Category"
            onChange={setCategory}
            placeholder="Workforce"
            required
            value={category}
          />
          <TextAreaField
            className="md:col-span-2"
            label="Description"
            onChange={setDescription}
            placeholder="What question does this report answer, and what should a reader know before acting on it?"
            rows={3}
            value={description}
          />
          <SelectField
            hint="A shared report is visible to everyone here, but each reader still only sees the records their own role allows."
            label="Who can use it"
            onChange={setVisibility}
            options={VISIBILITY_OPTIONS.map((option) => ({ ...option }))}
            value={visibility}
          />
        </div>

        {error ? (
          <p className="mt-4 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-3">
          <Button
            disabled={!canSave}
            loading={saving}
            onClick={() => void save()}
            variant="primary"
          >
            Save report
          </Button>
          <Button href="/reports/my-reports" variant="secondary">
            Cancel
          </Button>
        </div>

        {!canSave && !saving ? (
          <p className="mt-3 text-xs text-muted">
            A report needs a name, a category and at least one column before it
            can be saved.
          </p>
        ) : null}
      </SectionCard>
    </div>
  );
}
