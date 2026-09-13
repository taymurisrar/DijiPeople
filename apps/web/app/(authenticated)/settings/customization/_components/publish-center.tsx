"use client";

import { MoveRight, RefreshCw, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { useFormattingContext } from "@/app/components/filters/use-formatting-context";
import { Button } from "@/app/components/ui/button";
import { EmptyState } from "@/app/components/ui/empty-state";
import { SelectField } from "@/app/components/ui/form-control";
import { StatusPill } from "@/app/components/ui/status-pill";
import { PermissionGate } from "@/app/(authenticated)/_components/permission-gate";
import { formatDateTime } from "@/lib/formatting-context";
import type {
  CustomizationPublishDraftComponent,
  CustomizationPublishValidationResult,
  CustomizationPackage,
} from "../types";

/*
 * The legacy holding package. Drafts no longer land in it (BUG-3493), but a
 * tenant can still have drafts there from before; it is never a move target.
 */
const UNASSIGNED_PACKAGE_KEY = "unassigned-draft-customizations";

export function PublishCenter({
  drafts,
  packages,
}: {
  drafts: CustomizationPublishDraftComponent[];
  packages: CustomizationPackage[];
}) {
  const router = useRouter();
  /*
   * BUG-3496 — dates were formatted with `Intl.DateTimeFormat(undefined, …)`
   * during render: the server's locale and timezone on the server, the
   * browser's on the client. The two strings differed, React raised #418 on
   * every load, and the global error handler put a blocking modal over the
   * page. Both passes now use the tenant's formatting context.
   */
  const formattingContext = useFormattingContext();
  const [validation, setValidation] =
    useState<CustomizationPublishValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [publishedIds, setPublishedIds] = useState<string[]>([]);
  const [packageFilter, setPackageFilter] = useState("");
  const [targetPackageId, setTargetPackageId] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [isRefreshing, startRefreshTransition] = useTransition();
  const visibleDrafts = useMemo(
    () =>
      (packageFilter
        ? drafts.filter((draft) => draft.packageId === packageFilter)
        : drafts
      ).filter((draft) => !publishedIds.includes(draft.id)),
    [drafts, packageFilter, publishedIds],
  );
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected =
    visibleDrafts.length > 0 &&
    visibleDrafts.every((draft) => selectedIdSet.has(draft.id));
  /*
   * BUG-3493 — every writable Custom Package is a move target. The tenant's own
   * Custom Package is created on first customization, so this list is not empty
   * on the path an administrator actually takes.
   */
  const movablePackages = packages.filter(
    (item) =>
      !item.isDefault &&
      !item.isReadOnly &&
      !item.isManaged &&
      item.packageKey !== UNASSIGNED_PACKAGE_KEY,
  );
  const issuesByComponent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const issue of validation?.issues ?? []) {
      if (!issue.componentId || issue.severity === "info") continue;
      counts.set(issue.componentId, (counts.get(issue.componentId) ?? 0) + 1);
    }
    return counts;
  }, [validation]);
  const isBusy = isValidating || isPublishing || isMoving || isRefreshing;

  const columns: DataTableColumn<CustomizationPublishDraftComponent>[] = [
    {
      key: "select",
      header: "",
      render: (row) => (
        <PermissionGate
          anyOf={["customization.publish"]}
          fallback={<span className="text-muted">-</span>}
        >
          <input
            aria-label={`Select ${row.componentName}`}
            checked={selectedIdSet.has(row.id)}
            className="h-4 w-4 rounded border-border"
            disabled={isBusy}
            onChange={(event) => {
              setValidation(null);
              setSuccess(null);
              setSelectedIds((current) =>
                event.target.checked
                  ? [...new Set([...current, row.id])]
                  : current.filter((id) => id !== row.id),
              );
            }}
            type="checkbox"
          />
        </PermissionGate>
      ),
    },
    {
      key: "name",
      header: "Name",
      searchable: true,
      sortable: true,
      sortAccessor: (row) => row.componentName,
      render: (row) => (
        <span className="font-semibold text-foreground">
          {row.componentName}
        </span>
      ),
    },
    {
      key: "type",
      header: "Type",
      filterable: true,
      filterType: "select",
      filterAccessor: (row) => componentTypeLabel(row.componentType),
      filterOptions: [
        "Module",
        "Field",
        "Form",
        "View",
        "Choice List",
        "Relationship",
        "Action Bar",
      ].map((value) => ({ label: value, value })),
      render: (row) => componentTypeLabel(row.componentType),
    },
    {
      key: "module",
      header: "Module",
      searchable: true,
      render: (row) => row.module,
    },
    {
      key: "package",
      header: "Package",
      searchable: true,
      render: (row) => row.packageName,
    },
    {
      key: "change",
      header: "Change",
      render: (row) => changeLabel(row.layerAction),
    },
    {
      key: "state",
      header: "State",
      render: (row) => (
        <StatusPill tone={row.lifecycleState === "draft" ? "muted" : "good"}>
          {stateLabel(row.lifecycleState)}
        </StatusPill>
      ),
    },
    {
      key: "modifiedOn",
      header: "Modified on",
      sortable: true,
      sortAccessor: (row) => row.modifiedOn,
      render: (row) =>
        formatDateTime(row.modifiedOn, formattingContext) || "Not set",
    },
    {
      key: "issues",
      header: "Issues",
      render: (row) =>
        validation ? (issuesByComponent.get(row.id) ?? "None") : "-",
    },
  ];

  async function validate() {
    setIsValidating(true);
    setError(null);
    setSuccess(null);
    setValidation(null);
    try {
      const response = await fetch("/api/customization/publish/validate", {
        method: "POST",
        body: JSON.stringify({ componentIds: selectedIds }),
        headers: { "Content-Type": "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as
        | CustomizationPublishValidationResult
        | { message?: string | string[] };
      if (!response.ok || !("issues" in data)) {
        setError(readApiMessage(data) ?? "Unable to validate the selection.");
        return;
      }
      setValidation(data);
    } catch {
      setError("Unable to validate the selection. Check your connection and retry.");
    } finally {
      setIsValidating(false);
    }
  }

  async function publishSelected() {
    setIsPublishing(true);
    setError(null);
    setSuccess(null);
    const publishingIds = [...selectedIds];
    try {
      const response = await fetch("/api/customization/publish/components", {
        method: "POST",
        body: JSON.stringify({ componentIds: publishingIds }),
        headers: { "Content-Type": "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as {
        count?: number;
        message?: string | string[];
        issues?: CustomizationPublishValidationResult["issues"];
      };
      if (!response.ok) {
        if (Array.isArray(data.issues) && data.issues.length) {
          setValidation({ valid: false, issues: data.issues });
        }
        setError(
          readApiMessage(data) ?? "Unable to publish the selection.",
        );
        return;
      }
      setPublishedIds((current) => [
        ...new Set([...current, ...publishingIds]),
      ]);
      setSelectedIds([]);
      setValidation(null);
      const count = data.count ?? publishingIds.length;
      setSuccess(`${count} component${count === 1 ? "" : "s"} published.`);
      router.refresh();
    } catch {
      setError("Unable to publish the selection. Check your connection and retry.");
    } finally {
      setIsPublishing(false);
    }
  }

  async function moveSelected() {
    setIsMoving(true);
    setError(null);
    setSuccess(null);
    const movingIds = [...selectedIds];
    try {
      const response = await fetch("/api/customization/components/move", {
        method: "POST",
        body: JSON.stringify({
          componentIds: movingIds,
          targetPackageId,
        }),
        headers: { "Content-Type": "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as {
        count?: number;
        message?: string | string[];
      };
      if (!response.ok) {
        setError(readApiMessage(data) ?? "Unable to move the selection.");
        return;
      }
      const target = movablePackages.find((item) => item.id === targetPackageId);
      setSelectedIds([]);
      setTargetPackageId("");
      setValidation(null);
      const count = data.count ?? movingIds.length;
      setSuccess(
        `${count} component${count === 1 ? "" : "s"} moved${target ? ` to ${target.displayName}` : ""}.`,
      );
      router.refresh();
    } catch {
      setError("Unable to move the selection. Check your connection and retry.");
    } finally {
      setIsMoving(false);
    }
  }

  function refresh() {
    setError(null);
    setSuccess(null);
    startRefreshTransition(() => router.refresh());
  }

  const blockingIssues = (validation?.issues ?? []).filter(
    (issue) => issue.blocking,
  );
  const warnings = (validation?.issues ?? []).filter(
    (issue) => !issue.blocking && issue.severity === "warning",
  );

  return (
    <div className="grid gap-4">
      <section
        aria-label="Publish actions"
        className="rounded-2xl border border-border bg-surface p-4 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-4">
          <p className="text-sm font-semibold text-foreground" aria-live="polite">
            {selectedIds.length} selected
          </p>
          <Button
            disabled={isBusy && !isRefreshing}
            leftIcon={<RefreshCw className="h-4 w-4" />}
            loading={isRefreshing}
            loadingText="Refreshing..."
            onClick={refresh}
            size="sm"
            type="button"
            variant="ghost"
          >
            Refresh
          </Button>
        </div>

        <div className="mt-4 grid items-end gap-3 lg:grid-cols-[minmax(12rem,1fr)_auto_minmax(14rem,1fr)]">
          <div className="grid gap-3 sm:grid-cols-[auto_minmax(12rem,1fr)] sm:items-end">
            <PermissionGate anyOf={["customization.publish"]}>
              <label
                className={[
                  "inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm text-foreground",
                  isBusy ? "cursor-not-allowed opacity-70" : "cursor-pointer",
                ].join(" ")}
              >
                <input
                  checked={allSelected}
                  className="h-4 w-4 rounded border-border"
                  disabled={isBusy || visibleDrafts.length === 0}
                  onChange={(event) => {
                    setValidation(null);
                    setSuccess(null);
                    setSelectedIds(
                      event.target.checked
                        ? visibleDrafts.map((row) => row.id)
                        : [],
                    );
                  }}
                  type="checkbox"
                />
                Select all
              </label>
            </PermissionGate>
            <SelectField
              className="min-w-0"
              disabled={isBusy}
              label="Package"
              onChange={(value) => {
                setPackageFilter(value);
                setSelectedIds([]);
                setValidation(null);
              }}
              options={packages
                .filter((item) => !item.isDefault)
                .map((item) => ({
                  label: item.displayName,
                  value: item.id,
                }))}
              placeholder="All packages"
              value={packageFilter}
            />
          </div>

          <PermissionGate anyOf={["customization.publish"]}>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!selectedIds.length || isBusy}
                leftIcon={<ShieldCheck className="h-4 w-4" />}
                loading={isValidating}
                loadingText="Validating..."
                onClick={() => void validate()}
                size="sm"
                type="button"
                variant="secondary"
              >
                Validate
              </Button>
              <Button
                disabled={!selectedIds.length || isBusy}
                loading={isPublishing}
                loadingText="Publishing..."
                onClick={() => void publishSelected()}
                size="sm"
                type="button"
              >
                Publish
              </Button>
            </div>

            <div className="grid items-end gap-3 sm:grid-cols-[minmax(12rem,1fr)_auto]">
              <SelectField
                className="min-w-0"
                disabled={isBusy || movablePackages.length === 0}
                label="Move to package"
                onChange={setTargetPackageId}
                options={movablePackages.map((item) => ({
                  label: item.displayName,
                  value: item.id,
                }))}
                placeholder="Select a package"
                value={targetPackageId}
              />
              <Button
                disabled={!selectedIds.length || !targetPackageId || isBusy}
                leftIcon={<MoveRight className="h-4 w-4" />}
                loading={isMoving}
                loadingText="Moving..."
                onClick={() => void moveSelected()}
                size="sm"
                type="button"
                variant="ghost"
              >
                Move
              </Button>
            </div>
          </PermissionGate>
        </div>
      </section>

      {error ? (
        <div
          className="rounded-lg border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger"
          role="alert"
        >
          {error}
        </div>
      ) : null}
      {success ? (
        <div
          className="rounded-lg border border-success/20 bg-success/5 px-4 py-3 text-sm text-success"
          role="status"
        >
          {success}
        </div>
      ) : null}
      {validation ? (
        <div
          aria-live="polite"
          className="grid gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm"
        >
          <p className="font-semibold text-foreground">
            {blockingIssues.length
              ? `${blockingIssues.length} issue${blockingIssues.length === 1 ? "" : "s"} block publishing`
              : "Ready to publish"}
          </p>
          {[...blockingIssues, ...warnings].length ? (
            <ul className="grid gap-1 text-muted">
              {[...blockingIssues, ...warnings].map((issue, index) => (
                <li key={`${issue.componentId ?? "general"}-${index}`}>
                  <span
                    className={
                      issue.blocking ? "font-semibold text-danger" : "text-amber-700"
                    }
                  >
                    {issue.blocking ? "Blocking" : "Warning"}:
                  </span>{" "}
                  {issue.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <DataTable
        className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm"
        columns={columns}
        emptyState={
          <EmptyState
            description="There are no unpublished changes."
            title="Nothing to publish"
          />
        }
        getRowKey={(row) => row.id}
        pagination={{ page: 1, pageSize: 10, total: visibleDrafts.length }}
        rows={visibleDrafts}
        searchPlaceholder="Search"
        tableClassName="min-w-[900px] divide-y divide-border text-xs"
      />
    </div>
  );
}

function componentTypeLabel(value: string) {
  const labels: Record<string, string> = {
    table: "Module",
    column: "Field",
    optionSet: "Choice List",
    lookup: "Relationship",
    actionBar: "Action Bar",
  };
  return labels[value] ?? value.charAt(0).toUpperCase() + value.slice(1);
}

/* ITEM-0184 — "Layer action: Create/Reference" read as developer jargon. */
function changeLabel(value: string) {
  const labels: Record<string, string> = {
    create: "New",
    modify: "Changed",
    remove: "Removed",
    reference: "Included",
  };
  return labels[value] ?? value;
}

function stateLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function readApiMessage(value: unknown) {
  if (typeof value !== "object" || value === null || !("message" in value)) {
    return null;
  }

  const message = value.message;
  if (typeof message === "string" && message.trim()) {
    return message;
  }

  if (Array.isArray(message)) {
    const messages = message.filter(
      (item): item is string =>
        typeof item === "string" && Boolean(item.trim()),
    );
    return messages.length ? messages.join(" ") : null;
  }

  return null;
}
