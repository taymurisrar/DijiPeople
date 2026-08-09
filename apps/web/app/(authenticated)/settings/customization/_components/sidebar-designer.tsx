"use client";

import { ArrowDown, ArrowUp, Eye, EyeOff, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { SectionCard } from "@/app/components/ui/section-card";
import {
  applyDashboardNavOverrides,
  dashboardNavItems,
  type DashboardNavOverride,
} from "../../../_components/navigation";
import type { VisibilityRule } from "@/lib/runtime/visibility.resolver";
import {
  VisibilityRulesEditor,
  type AudienceOptions,
} from "@/app/components/runtime/visibility-rules-editor";

export type { AudienceOption, AudienceOptions } from "@/app/components/runtime/visibility-rules-editor";

type DraftRow = {
  itemKey: string;
  codeLabel: string;
  description: string;
  isHidden: boolean;
  label: string;
  visibilityRules: VisibilityRule[];
};

function buildDraft(overrides: readonly DashboardNavOverride[]): DraftRow[] {
  const byKey = new Map(overrides.map((entry) => [entry.itemKey, entry]));

  /*
   * Start from the merged order so the list opens showing what the sidebar
   * actually looks like today. Hidden entries are excluded by the merge, so
   * they are appended afterwards — an administrator still needs to see and
   * un-hide them.
   */
  const visible = applyDashboardNavOverrides(dashboardNavItems, overrides);
  const visibleKeys = new Set(visible.map((item) => item.href));
  const ordered = [
    ...visible,
    ...dashboardNavItems.filter((item) => !visibleKeys.has(item.href)),
  ];

  return ordered.map((item) => {
    const override = byKey.get(item.href);
    const codeItem =
      dashboardNavItems.find((entry) => entry.href === item.href) ?? item;
    return {
      itemKey: item.href,
      codeLabel: codeItem.label,
      description: codeItem.description,
      isHidden: Boolean(override?.isHidden),
      label: override?.label ?? "",
      visibilityRules: [...(override?.visibilityRules ?? [])],
    };
  });
}

function toOverrides(rows: readonly DraftRow[]): DashboardNavOverride[] {
  return rows.map((row, index) => ({
    itemKey: row.itemKey,
    isHidden: row.isHidden,
    label: row.label.trim() ? row.label.trim() : null,
    /*
     * Every row carries its position so a save records the list exactly as it
     * reads on screen. The API drops rows that override nothing, so untouched
     * entries still fall back to the code order.
     */
    sortOrder: index,
    visibilityRules: row.visibilityRules.length ? row.visibilityRules : null,
  }));
}

export function SidebarDesigner({
  audiences,
  initialOverrides,
}: {
  audiences: AudienceOptions;
  initialOverrides: readonly DashboardNavOverride[];
}) {
  const [rows, setRows] = useState<DraftRow[]>(() =>
    buildDraft(initialOverrides),
  );
  const [saved, setSaved] = useState<DraftRow[]>(() =>
    buildDraft(initialOverrides),
  );
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isDirty = useMemo(
    () => JSON.stringify(rows) !== JSON.stringify(saved),
    [rows, saved],
  );

  const hiddenCount = rows.filter((row) => row.isHidden).length;
  const gatedCount = rows.filter((row) => row.visibilityRules.length).length;

  function update(index: number, patch: Partial<DraftRow>) {
    setStatus(null);
    setRows((current) =>
      current.map((row, position) =>
        position === index ? { ...row, ...patch } : row,
      ),
    );
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    setStatus(null);
    setRows((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function save() {
    setIsSaving(true);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch("/api/navigation/sidebar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: toOverrides(rows) }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(payload?.message ?? "Unable to save the sidebar.");
      }

      setSaved(rows);
      setStatus(
        "Saved. Reload any open tab to see the new sidebar — it is rendered once per page load.",
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save the sidebar.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function resetToDefaults() {
    setStatus(null);
    setError(null);
    setRows(buildDraft([]));
  }

  return (
    <div className="grid gap-4">
      <SectionCard
        description="Changes apply to every user in this tenant. Hiding an entry only removes the link — the permissions behind that page still apply, so it is a tidying tool, not a security control."
        title="Sidebar layout"
      >
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Button
            disabled={!isDirty || isSaving}
            onClick={() => void save()}
            type="button"
          >
            {isSaving ? "Saving…" : "Save sidebar"}
          </Button>
          <Button
            disabled={!isDirty || isSaving}
            onClick={() => setRows(saved)}
            type="button"
            variant="secondary"
          >
            Discard changes
          </Button>
          <Button
            disabled={isSaving}
            leftIcon={<RotateCcw className="h-4 w-4" />}
            onClick={resetToDefaults}
            type="button"
            variant="ghost"
          >
            Reset to product default
          </Button>
          <span className="text-xs text-muted">
            {rows.length} entries · {hiddenCount} hidden · {gatedCount}{" "}
            audience-gated
          </span>
        </div>

        {error ? (
          <p
            className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        {status ? (
          <p
            className="mb-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
            role="status"
          >
            {status}
          </p>
        ) : null}

        <ol className="grid gap-2">
          {rows.map((row, index) => (
            <li
              className={`rounded-lg border border-border bg-surface p-3 ${
                row.isHidden ? "opacity-60" : ""
              }`}
              key={row.itemKey}
            >
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex flex-col">
                  <button
                    aria-label={`Move ${row.codeLabel} up`}
                    className="rounded p-0.5 text-muted transition hover:bg-muted/20 hover:text-foreground disabled:opacity-30"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    type="button"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    aria-label={`Move ${row.codeLabel} down`}
                    className="rounded p-0.5 text-muted transition hover:bg-muted/20 hover:text-foreground disabled:opacity-30"
                    disabled={index === rows.length - 1}
                    onClick={() => move(index, 1)}
                    type="button"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {row.label.trim() || row.codeLabel}
                    {row.label.trim() ? (
                      <span className="ml-2 text-xs font-normal text-muted">
                        (renamed from {row.codeLabel})
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-muted">{row.itemKey}</p>
                </div>

                <input
                  aria-label={`Rename ${row.codeLabel}`}
                  className="w-44 rounded-md border border-border bg-white px-2 py-1 text-sm"
                  maxLength={60}
                  onChange={(event) =>
                    update(index, { label: event.target.value })
                  }
                  placeholder={row.codeLabel}
                  value={row.label}
                />

                <Button
                  leftIcon={
                    row.isHidden ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )
                  }
                  onClick={() => update(index, { isHidden: !row.isHidden })}
                  size="sm"
                  type="button"
                  variant={row.isHidden ? "secondary" : "ghost"}
                >
                  {row.isHidden ? "Hidden" : "Visible"}
                </Button>
              </div>

              <VisibilityRulesEditor
                audiences={audiences}
                onChange={(visibilityRules) =>
                  update(index, { visibilityRules })
                }
                rules={row.visibilityRules}
              />
            </li>
          ))}
        </ol>
      </SectionCard>
    </div>
  );
}
