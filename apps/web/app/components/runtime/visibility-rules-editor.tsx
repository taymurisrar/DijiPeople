"use client";

import { Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/app/components/ui/button";
import type { VisibilityRule } from "@/lib/runtime/visibility.resolver";

/*
 * One editor for audience rules, shared by every designer that gates a surface.
 *
 * The rule engine is the same one behind commands, form tabs, form sections and
 * navigation, so a rule composed here means the same thing wherever it is
 * attached. Keeping a single editor is what stops the sidebar and the form
 * designer drifting into two dialects of the same feature.
 *
 * A condition reads as "<dimension> is any of / is none of <values>". The engine
 * underneath has a separate operator for each half of every pair, which as a
 * flat list ran to eleven near-identical entries — "In any of these teams"
 * sitting next to "Not in these teams" — and left the reader to spot which half
 * they were on. Splitting the dimension from the mode makes six choices and a
 * toggle.
 */

export type AudienceOption = { id: string; label: string };

export type AudienceOptions = {
  roleKeys: AudienceOption[];
  teamIds: AudienceOption[];
  departmentIds: AudienceOption[];
  businessUnitIds: AudienceOption[];
  organizationIds: AudienceOption[];
  designationIds: AudienceOption[];
};

export const EMPTY_AUDIENCE_OPTIONS: AudienceOptions = {
  roleKeys: [],
  teamIds: [],
  departmentIds: [],
  businessUnitIds: [],
  organizationIds: [],
  designationIds: [],
};

type AudienceField = keyof AudienceOptions;

/*
 * Only dimensions that can be answered about a person are offered. The engine
 * also has record- and field-scoped operators, but a tab, a section and a
 * navigation entry are all chrome rather than data, so those would never
 * resolve to anything useful here.
 */
const DIMENSIONS: ReadonlyArray<{
  field: AudienceField;
  label: string;
  is: VisibilityRule["operator"];
  isNot: VisibilityRule["operator"];
}> = [
  { field: "roleKeys", label: "Role", is: "has-any-role", isNot: "not-has-role" },
  { field: "teamIds", label: "Team", is: "in-team", isNot: "not-in-team" },
  {
    field: "departmentIds",
    label: "Department",
    is: "in-department",
    isNot: "not-in-department",
  },
  {
    field: "businessUnitIds",
    label: "Business unit",
    is: "in-business-unit",
    isNot: "not-in-business-unit",
  },
  {
    field: "organizationIds",
    label: "Organization",
    is: "in-organization",
    isNot: "not-in-organization",
  },
  {
    field: "designationIds",
    label: "Designation",
    is: "has-designation",
    isNot: "not-has-designation",
  },
];

type OperatorMatch = {
  dimension: (typeof DIMENSIONS)[number];
  negated: boolean;
};

const BY_OPERATOR = new Map<VisibilityRule["operator"], OperatorMatch>(
  DIMENSIONS.flatMap((dimension) => [
    [dimension.is, { dimension, negated: false }],
    [dimension.isNot, { dimension, negated: true }],
  ]),
);

function readRule(rule: VisibilityRule) {
  const matched = BY_OPERATOR.get(rule.operator);
  const dimension = matched?.dimension ?? DIMENSIONS[0];
  return {
    dimension,
    negated: matched?.negated ?? false,
    values: (rule[dimension.field] as readonly string[] | undefined) ?? [],
  };
}

function buildRule(
  dimension: (typeof DIMENSIONS)[number],
  negated: boolean,
  values: readonly string[],
): VisibilityRule {
  return {
    operator: negated ? dimension.isNot : dimension.is,
    [dimension.field]: [...values],
  } as VisibilityRule;
}

/*
 * A checkbox list rather than a native multi-select.
 *
 * The native control needs ctrl-click to add a second value and gives no sign
 * that more than one is even allowed, so a rule intended for three roles was
 * easy to save holding one. Here a plain click toggles, the count is stated,
 * and the current selection stays readable without scrolling the list.
 */
function AudienceMultiSelect({
  label,
  onChange,
  options,
  selected,
}: {
  label: string;
  onChange: (values: string[]) => void;
  options: readonly AudienceOption[];
  selected: readonly string[];
}) {
  const [query, setQuery] = useState("");
  const selectedSet = new Set(selected);

  /* Search only earns its space once the list is long enough to scroll. */
  const isSearchable = options.length > 6;
  const trimmed = query.trim().toLowerCase();
  const visible = trimmed
    ? options.filter((option) => option.label.toLowerCase().includes(trimmed))
    : options;

  function toggle(id: string) {
    onChange(
      selectedSet.has(id)
        ? selected.filter((value) => value !== id)
        : [...selected, id],
    );
  }

  return (
    <div className="rounded-lg border border-border bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-border/70 px-2 py-1.5">
        <span className="text-xs font-medium text-muted">
          {selected.length
            ? `${selected.length} of ${options.length} selected`
            : `Select from ${options.length}`}
        </span>
        {selected.length ? (
          <button
            className="rounded px-1.5 py-0.5 text-xs font-medium text-muted transition hover:bg-muted/20 hover:text-foreground"
            onClick={() => onChange([])}
            type="button"
          >
            Clear
          </button>
        ) : null}
      </div>

      {isSearchable ? (
        <div className="border-b border-border/70 px-2 py-1.5">
          <div className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1">
            <Search aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted" />
            <input
              aria-label={`Search ${label.toLowerCase()}`}
              className="w-full min-w-0 bg-transparent text-xs outline-none"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${label.toLowerCase()}`}
              value={query}
            />
          </div>
        </div>
      ) : null}

      <div
        aria-label={`${label} values`}
        className="max-h-44 overflow-y-auto p-1"
        role="group"
      >
        {visible.length ? (
          visible.map((option) => (
            <label
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs transition hover:bg-accent-soft/40"
              key={option.id}
            >
              <input
                checked={selectedSet.has(option.id)}
                className="h-3.5 w-3.5 shrink-0 rounded border-border"
                onChange={() => toggle(option.id)}
                type="checkbox"
              />
              <span className="min-w-0 flex-1 truncate text-foreground">
                {option.label}
              </span>
            </label>
          ))
        ) : (
          <p className="px-2 py-2 text-xs text-muted">
            Nothing matches that search.
          </p>
        )}
      </div>
    </div>
  );
}

export function VisibilityRulesEditor({
  audiences,
  emptyLabel = "everyone",
  onChange,
  rules,
  title = "Audience",
}: {
  audiences: AudienceOptions;
  emptyLabel?: string;
  onChange: (rules: VisibilityRule[]) => void;
  rules: readonly VisibilityRule[];
  title?: string;
}) {
  function replace(index: number, rule: VisibilityRule) {
    onChange(
      rules.map((current, position) => (position === index ? rule : current)),
    );
  }

  function remove(index: number) {
    onChange(rules.filter((_, position) => position !== index));
  }

  return (
    <div className="mt-3 border-t border-border/60 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {title}
          <span className="ml-2 font-normal normal-case">
            {rules.length === 0
              ? emptyLabel
              : rules.length === 1
                ? "1 condition must pass"
                : `all ${rules.length} conditions must pass`}
          </span>
        </p>
        <Button
          leftIcon={<Plus className="h-3.5 w-3.5" />}
          onClick={() =>
            onChange([...rules, buildRule(DIMENSIONS[0], false, [])])
          }
          size="xs"
          type="button"
          variant="ghost"
        >
          Add condition
        </Button>
      </div>

      <div className="mt-2 grid gap-2">
        {rules.map((rule, index) => {
          /*
           * A rule this editor does not model — a permission or record operator
           * authored elsewhere — is shown but not edited. Rendering it as the
           * first dimension would silently rewrite it on the next save.
           */
          if (!BY_OPERATOR.has(rule.operator)) {
            return (
              <div
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-strong px-2 py-1.5"
                key={`unsupported-${index}`}
              >
                <span className="min-w-0 text-xs text-muted">
                  <code>{rule.operator}</code> — set outside this editor and
                  left unchanged
                </span>
                <button
                  aria-label="Remove condition"
                  className="shrink-0 rounded p-1 text-muted transition hover:bg-danger/10 hover:text-danger"
                  onClick={() => remove(index)}
                  type="button"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          }

          const { dimension, negated, values } = readRule(rule);
          const options = audiences[dimension.field];

          return (
            <div
              className="grid gap-2 rounded-lg border border-border bg-surface p-2"
              key={`${dimension.field}-${index}`}
            >
              <div className="flex items-center gap-2">
                <select
                  aria-label="Audience dimension"
                  className="min-w-0 flex-1 rounded-md border border-border bg-white px-2 py-1 text-xs"
                  onChange={(event) => {
                    const next =
                      DIMENSIONS.find(
                        (item) => item.field === event.target.value,
                      ) ?? DIMENSIONS[0];
                    /*
                     * Values are dropped when the dimension changes: a team id
                     * carried into a department rule would never match.
                     */
                    replace(index, buildRule(next, negated, []));
                  }}
                  value={dimension.field}
                >
                  {DIMENSIONS.map((item) => (
                    <option key={item.field} value={item.field}>
                      {item.label}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Match mode"
                  className="min-w-0 flex-1 rounded-md border border-border bg-white px-2 py-1 text-xs"
                  onChange={(event) =>
                    replace(
                      index,
                      buildRule(
                        dimension,
                        event.target.value === "isNot",
                        values,
                      ),
                    )
                  }
                  value={negated ? "isNot" : "is"}
                >
                  <option value="is">is any of</option>
                  <option value="isNot">is none of</option>
                </select>

                <button
                  aria-label="Remove condition"
                  className="shrink-0 rounded p-1 text-muted transition hover:bg-danger/10 hover:text-danger"
                  onClick={() => remove(index)}
                  type="button"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {options.length ? (
                <AudienceMultiSelect
                  label={dimension.label}
                  onChange={(next) =>
                    replace(index, buildRule(dimension, negated, next))
                  }
                  options={options}
                  selected={values}
                />
              ) : (
                <p className="rounded-md border border-dashed border-border px-2 py-1.5 text-xs text-muted">
                  No {dimension.label.toLowerCase()} options exist in this
                  tenant yet.
                </p>
              )}

              {/*
               * An empty condition means opposite things either way round, so
               * the warning has to say which. "is any of" nothing matches
               * nobody and hides the surface; "is none of" nothing excludes
               * nobody and is merely redundant.
               */}
              {values.length === 0 ? (
                <p
                  className={`rounded-md border px-2 py-1 text-xs ${
                    negated
                      ? "border-border bg-surface-strong text-muted"
                      : "border-amber-300 bg-amber-50 text-amber-900"
                  }`}
                >
                  {negated
                    ? "Nothing selected — this condition excludes no one."
                    : "Nothing selected — this condition hides it from everyone."}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
