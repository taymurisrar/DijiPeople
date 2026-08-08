"use client";

import { useMemo } from "react";
import type {
  EmailTemplateScopeLevel,
  TemplateScopeOptions,
} from "@/lib/notifications-api";

/*
 * Placement and module reach, authored the same way wherever they appear.
 *
 * Email templates and workflows both answer the same two questions: which part
 * of the organization does this apply to, and which module. Keeping one control
 * for both means a new level or module shows up in every authoring screen at
 * once, and a user only has to learn it once.
 */

export type ScopeValue = {
  scopeLevel: EmailTemplateScopeLevel;
  scopeId: string | null;
  moduleKey: string | null;
};

const LEVELS_NEEDING_TARGET: EmailTemplateScopeLevel[] = [
  "ORGANIZATION",
  "BUSINESS_UNIT",
  "DEPARTMENT",
  "TEAM",
];

const TARGET_LABEL: Record<EmailTemplateScopeLevel, string> = {
  TENANT: "",
  ORGANIZATION: "Organization",
  BUSINESS_UNIT: "Business unit",
  DEPARTMENT: "Department",
  TEAM: "Team",
};

export function scopeNeedsTarget(level: EmailTemplateScopeLevel) {
  return LEVELS_NEEDING_TARGET.includes(level);
}

/** Human description of a placement, for tables and summaries. */
export function describeScope(
  level: EmailTemplateScopeLevel | "SYSTEM",
  scopeId: string | null,
  options?: TemplateScopeOptions | null,
) {
  if (level === "SYSTEM") return "System default";
  if (level === "TENANT") return "Whole tenant";

  const name = scopeId ? findTargetName(level, scopeId, options) : null;
  return name ? `${TARGET_LABEL[level]}: ${name}` : TARGET_LABEL[level];
}

function findTargetName(
  level: EmailTemplateScopeLevel,
  scopeId: string,
  options?: TemplateScopeOptions | null,
) {
  if (!options) return null;
  const list =
    level === "ORGANIZATION"
      ? options.organizations
      : level === "BUSINESS_UNIT"
        ? options.businessUnits
        : level === "DEPARTMENT"
          ? options.departments
          : level === "TEAM"
            ? options.teams
            : [];
  return list.find((entry) => entry.id === scopeId)?.name ?? null;
}

const selectClassName =
  "w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted";

export function ScopePicker({
  disabled,
  onChange,
  options,
  value,
}: {
  disabled?: boolean;
  onChange: (next: ScopeValue) => void;
  options: TemplateScopeOptions | null;
  value: ScopeValue;
}) {
  const targets = useMemo(() => {
    if (!options || !scopeNeedsTarget(value.scopeLevel)) return [];
    if (value.scopeLevel === "ORGANIZATION") return options.organizations;
    if (value.scopeLevel === "BUSINESS_UNIT") return options.businessUnits;
    if (value.scopeLevel === "DEPARTMENT") return options.departments;
    return options.teams;
  }, [options, value.scopeLevel]);

  const needsTarget = scopeNeedsTarget(value.scopeLevel);
  const levels = options?.levels ?? [];

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <label className="grid gap-2">
        <span className="text-sm font-medium text-foreground">Applies to</span>
        <select
          className={selectClassName}
          disabled={disabled}
          onChange={(event) => {
            const scopeLevel = event.target.value as EmailTemplateScopeLevel;
            // Changing the level invalidates whichever target was chosen.
            onChange({ ...value, scopeLevel, scopeId: null });
          }}
          value={value.scopeLevel}
        >
          {levels.length ? (
            levels.map((level) => (
              <option key={level.value} value={level.value}>
                {level.label}
              </option>
            ))
          ) : (
            <option value="TENANT">Whole tenant</option>
          )}
        </select>
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium text-foreground">
          {needsTarget ? TARGET_LABEL[value.scopeLevel] : "Scope target"}
          {needsTarget ? <span className="ml-1 text-red-600">*</span> : null}
        </span>
        <select
          className={selectClassName}
          disabled={disabled || !needsTarget}
          onChange={(event) =>
            onChange({ ...value, scopeId: event.target.value || null })
          }
          value={value.scopeId ?? ""}
        >
          <option value="">
            {needsTarget
              ? `Select a ${TARGET_LABEL[value.scopeLevel].toLowerCase()}`
              : "Not applicable"}
          </option>
          {targets.map((target) => (
            <option key={target.id} value={target.id}>
              {target.name}
            </option>
          ))}
        </select>
        {needsTarget && !targets.length ? (
          <span className="text-xs text-muted">
            No {TARGET_LABEL[value.scopeLevel].toLowerCase()}s exist in this
            tenant yet.
          </span>
        ) : null}
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium text-foreground">Module</span>
        <select
          className={selectClassName}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...value, moduleKey: event.target.value || null })
          }
          value={value.moduleKey ?? ""}
        >
          <option value="">All modules</option>
          {(options?.modules ?? []).map((module) => (
            <option key={module.value} value={module.value}>
              {module.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** The client-side check that mirrors what the API enforces. */
export function validateScope(value: ScopeValue) {
  if (scopeNeedsTarget(value.scopeLevel) && !value.scopeId) {
    return `Select a ${TARGET_LABEL[value.scopeLevel].toLowerCase()} for this scope.`;
  }
  return null;
}
