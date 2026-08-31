"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BookmarkPlus, Trash2 } from "lucide-react";
import { ModuleViewSelector } from "@/app/components/runtime/module-view-selector";
import { Button } from "@/app/components/ui/button";
import { Dialog } from "@/app/components/ui/dialog";
import { SelectField, TextField } from "@/app/components/ui/form-control";
import {
  analyticsFilterHref,
  applyAnalyticsFilters,
  readAnalyticsFilters,
} from "@/app/components/filters";
import type { ResolvedScopeFilter } from "../_lib/analytics-surfaces";
import type {
  ReportFilterInput,
  SavedView,
  SavedViewConfig,
} from "../_lib/reporting-types";
import {
  createSavedView,
  deleteSavedView,
  reportingErrorMessage,
} from "../_lib/reporting-browser";

/*
 * Saving where you are, and coming back to it.
 *
 * `ModuleViewSelector` is the app's one view selector — a second near-identical
 * one used to exist and was consolidated into it, so a new one here would be
 * reopening a decision this repository already made.
 *
 * What is different about a *reporting* view is that selecting one does not set
 * `?view=<id>`: it writes the saved period, comparison, scope and breakdown
 * into the URL as their own parameters. The URL stays the whole state, which is
 * the rule the filters module is built on — a `?view=uuid` link that resolves
 * differently after someone edits the view is not a shareable link, it is a
 * pointer to something mutable. This way a pasted link keeps meaning what it
 * meant, and a view is a shortcut rather than an indirection.
 *
 * Delete is offered only for a view the API says this user may edit, and it is
 * a real call, not a hidden row: `canEdit` comes from the server, which decides
 * again when the DELETE arrives.
 */

export type SavedViewsBarProps = {
  /** The data source key — what the API calls a saved view's `surfaceKey`. */
  surfaceKey: string;
  views: readonly SavedView[];
  scopeFilters: readonly ResolvedScopeFilter[];
  canManage: boolean;
};

const VISIBILITY_OPTIONS = [
  { value: "PRIVATE", label: "Only me" },
  { value: "TENANT", label: "Everyone in this workspace" },
] as const;

export function SavedViewsBar({
  surfaceKey,
  views,
  scopeFilters,
  canManage,
}: SavedViewsBarProps) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const query = searchParams?.toString() ?? "";

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [visibility, setVisibility] = React.useState<string>("PRIVATE");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [activeViewId, setActiveViewId] = React.useState<string | null>(null);

  const applyView = React.useCallback(
    (viewId: string) => {
      const view = views.find((candidate) => candidate.id === viewId);
      if (!view) return;

      setActiveViewId(viewId);

      const config = (view.config ?? {}) as SavedViewConfig;
      const params = applyAnalyticsFilters(query, {});

      /* Start from a clean slate for everything a view owns. */
      for (const key of ["preset", "from", "to", "compare", "groupBy", "bucket", "bucketKey"]) {
        params.delete(key);
      }
      for (const binding of scopeFilters) params.delete(binding.param);

      if (config.preset) params.set("preset", config.preset);
      if (config.from) params.set("from", config.from);
      if (config.to) params.set("to", config.to);
      if (config.comparison && config.comparison !== "none") {
        params.set("compare", config.comparison);
      }
      if (config.breakdown) params.set("groupBy", config.breakdown);

      for (const filter of config.filters ?? []) {
        const binding = scopeFilters.find(
          (candidate) => candidate.fieldKey === filter.field,
        );
        if (binding && typeof filter.value === "string") {
          params.set(binding.param, filter.value);
        }
      }

      router.push(analyticsFilterHref(pathname, params));
    },
    [pathname, query, router, scopeFilters, views],
  );

  const save = React.useCallback(async () => {
    setBusy(true);
    setError(null);

    const state = readAnalyticsFilters(query);

    const filters: ReportFilterInput[] = scopeFilters
      .map((binding) => {
        const value = state[binding.param];
        return value
          ? ({ field: binding.fieldKey, operator: "eq", value } as ReportFilterInput)
          : null;
      })
      .filter((filter): filter is ReportFilterInput => filter !== null);

    /*
     * `metricKeys` is deliberately not saved. The surface derives its tiles
     * from the catalog, so a stored metric list would never be read back —
     * and a saved setting that silently does nothing is worse than one that is
     * not offered.
     */
    const config: SavedViewConfig = {
      ...(state.preset ? { preset: state.preset } : {}),
      ...(state.from ? { from: state.from } : {}),
      ...(state.to ? { to: state.to } : {}),
      ...(state.compare ? { comparison: state.compare } : {}),
      ...(state.groupBy ? { breakdown: state.groupBy } : {}),
      ...(filters.length ? { filters } : {}),
    };

    try {
      await createSavedView({
        surfaceKey,
        name: name.trim(),
        config: config as unknown as Record<string, unknown>,
        visibilityScope: visibility,
      });

      setDialogOpen(false);
      setName("");
      router.refresh();
    } catch (caught) {
      setError(reportingErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }, [name, query, router, scopeFilters, surfaceKey, visibility]);

  const remove = React.useCallback(
    async (viewId: string) => {
      setBusy(true);
      setError(null);
      try {
        await deleteSavedView(viewId);
        setActiveViewId(null);
        router.refresh();
      } catch (caught) {
        setError(reportingErrorMessage(caught));
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  const activeView = views.find((view) => view.id === activeViewId) ?? null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {views.length > 0 ? (
        <ModuleViewSelector
          activeViewId={activeViewId}
          mode="dropdown"
          onViewChange={applyView}
          title="Saved views"
          views={views.map((view) => ({
            id: view.id,
            name: view.name,
            type: view.visibilityScope === "PRIVATE" ? "custom" : "system",
            isDefault: view.isDefault,
          }))}
        />
      ) : null}

      {activeView?.canEdit ? (
        <Button
          aria-label={`Delete the saved view ${activeView.name}`}
          disabled={busy}
          leftIcon={<Trash2 aria-hidden="true" className="h-4 w-4" />}
          onClick={() => void remove(activeView.id)}
          size="xs"
          variant="ghost"
        >
          Delete view
        </Button>
      ) : null}

      {canManage ? (
        <Button
          aria-label="Save the current period, filters and breakdown as a view"
          leftIcon={<BookmarkPlus aria-hidden="true" className="h-4 w-4" />}
          onClick={() => setDialogOpen(true)}
          size="xs"
          variant="secondary"
        >
          Save this view
        </Button>
      ) : null}

      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <Dialog
        busy={busy}
        footer={
          <>
            <Button
              disabled={busy}
              onClick={() => setDialogOpen(false)}
              variant="secondary"
            >
              Cancel
            </Button>
            <Button
              disabled={name.trim().length < 2}
              loading={busy}
              onClick={() => void save()}
              variant="primary"
            >
              Save view
            </Button>
          </>
        }
        description="The period, comparison, scope filters and breakdown currently on screen are stored. Metrics are not - they come from what your role can see."
        onClose={() => setDialogOpen(false)}
        open={dialogOpen}
        size="sm"
        title="Save this view"
      >
        <div className="grid gap-4">
          <TextField
            label="View name"
            onChange={setName}
            placeholder="Engineering, previous quarter"
            required
            value={name}
          />
          <SelectField
            hint="A shared view is visible to everyone in this workspace, but each person still only sees the records their own role allows."
            label="Who can use it"
            onChange={setVisibility}
            options={VISIBILITY_OPTIONS.map((option) => ({ ...option }))}
            value={visibility}
          />
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </Dialog>
    </div>
  );
}
