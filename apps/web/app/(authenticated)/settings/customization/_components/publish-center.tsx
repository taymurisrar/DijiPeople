"use client";

import { Eye, MoveRight, RefreshCw, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { Button } from "@/app/components/ui/button";
import { EmptyState } from "@/app/components/ui/empty-state";
import { SelectField } from "@/app/components/ui/form-control";
import { StatusPill } from "@/app/components/ui/status-pill";
import { PermissionGate } from "@/app/(authenticated)/_components/permission-gate";
import type {
  CustomizationPublishDraftComponent,
  CustomizationPublishValidationResult,
  CustomizationPackage,
} from "../types";

export function PublishCenter({
  drafts,
  packages,
}: {
  drafts: CustomizationPublishDraftComponent[];
  packages: CustomizationPackage[];
}) {
  const router = useRouter();
  const [validation, setValidation] =
    useState<CustomizationPublishValidationResult | null>(null);
  const [validationScope, setValidationScope] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [publishedIds, setPublishedIds] = useState<string[]>([]);
  const [packageFilter, setPackageFilter] = useState("");
  const [targetPackageId, setTargetPackageId] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
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
  const movablePackages = packages.filter(
    (item) =>
      !item.isDefault &&
      !item.isReadOnly &&
      item.type === "custom" &&
      item.packageKey !== "unassigned-draft-customizations",
  );
  const isBusy =
    isValidating ||
    isPublishing ||
    isMoving ||
    Boolean(reviewingId) ||
    isRefreshing;

  const columns: DataTableColumn<CustomizationPublishDraftComponent>[] = [
    {
      key: "select",
      header: "",
      render: (row) => (
        <PermissionGate
          anyOf={["customization.publish"]}
          fallback={<span className="text-muted">N/A</span>}
        >
          <input
            aria-label={`Select ${row.componentName}`}
            checked={selectedIdSet.has(row.id)}
            className="h-4 w-4 rounded border-border"
            disabled={isBusy}
            onChange={(event) => {
              clearValidationFeedback();
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
      header: "Component name",
      searchable: true,
      sortable: true,
      sortAccessor: (row) => row.componentName,
      render: (row) => (
        <div>
          <p className="font-semibold text-foreground">{row.componentName}</p>
          <p className="mt-1 text-xs text-muted">{row.componentId}</p>
        </div>
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
      key: "layerAction",
      header: "Layer action",
      render: (row) => actionLabel(row.layerAction),
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
      render: (row) => formatDate(row.modifiedOn),
    },
    {
      key: "issues",
      header: "Issues",
      render: (row) => row.issues.length || "None",
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <PermissionGate
          anyOf={["customization.publish"]}
          fallback={<span className="text-xs text-muted">Read only</span>}
        >
          <Button
            disabled={isBusy && reviewingId !== row.id}
            leftIcon={<Eye className="h-4 w-4" />}
            loading={reviewingId === row.id}
            loadingText="Reviewing..."
            onClick={() => void validate([row.id], row.componentName, row.id)}
            size="xs"
            title={`Validate ${row.componentName} before publishing.`}
            variant="ghost"
          >
            Review
          </Button>
        </PermissionGate>
      ),
    },
  ];

  function clearValidationFeedback() {
    setValidation(null);
    setValidationScope(null);
    setSuccess(null);
  }

  async function validate(
    componentIds: string[],
    scope: string,
    rowId?: string,
  ) {
    if (!componentIds.length) {
      setError("Select at least one draft component to validate.");
      return;
    }

    if (rowId) {
      setReviewingId(rowId);
    } else {
      setIsValidating(true);
    }
    setError(null);
    setSuccess(null);
    setValidation(null);
    setValidationScope(null);
    try {
      const response = await fetch("/api/customization/publish/validate", {
        method: "POST",
        body: JSON.stringify({ componentIds }),
        headers: { "Content-Type": "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as
        | CustomizationPublishValidationResult
        | { message?: string | string[] };
      if (!response.ok || !("issues" in data)) {
        setError(readApiMessage(data) ?? "Unable to validate draft metadata.");
        return;
      }
      setValidation(data);
      setValidationScope(scope);
    } catch {
      setError(
        "Unable to validate draft metadata. Check your connection and retry.",
      );
    } finally {
      if (rowId) {
        setReviewingId(null);
      } else {
        setIsValidating(false);
      }
    }
  }

  async function publishSelected() {
    if (!selectedIds.length) {
      setError("Select at least one draft component to publish.");
      return;
    }
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
        issues?: Array<{ message?: string }>;
        packages?: Array<{
          afterState?: string;
          draftComponentsCount?: number;
          packageName?: string;
          publishedComponentsCount?: number;
        }>;
      };
      if (!response.ok) {
        setError(
          readApiMessage(data) ??
            data.issues?.[0]?.message ??
            "Unable to publish selected draft metadata.",
        );
        return;
      }
      setPublishedIds((current) => [
        ...new Set([...current, ...publishingIds]),
      ]);
      setSelectedIds([]);
      setValidation(null);
      setValidationScope(null);
      const packageSummary = data.packages?.length
        ? ` ${data.packages
            .map(
              (item) =>
                `${item.packageName ?? "Package"} is ${item.afterState ?? "updated"} (${item.draftComponentsCount ?? 0} draft, ${item.publishedComponentsCount ?? 0} published).`,
            )
            .join(" ")}`
        : "";
      setSuccess(
        `${data.count ?? publishingIds.length} component(s) published.${packageSummary}`,
      );
      router.refresh();
    } catch {
      setError(
        "Unable to publish selected draft metadata. Check your connection and retry.",
      );
    } finally {
      setIsPublishing(false);
    }
  }

  async function moveSelected() {
    if (!selectedIds.length || !targetPackageId) {
      setError("Select draft components and a target Custom Package.");
      return;
    }
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
        setError(readApiMessage(data) ?? "Unable to move draft components.");
        return;
      }
      setSelectedIds([]);
      setTargetPackageId("");
      setValidation(null);
      setValidationScope(null);
      setSuccess(`${data.count ?? movingIds.length} component(s) moved.`);
      router.refresh();
    } catch {
      setError(
        "Unable to move draft components. Check your connection and retry.",
      );
    } finally {
      setIsMoving(false);
    }
  }

  function refresh() {
    setError(null);
    setSuccess(null);
    startRefreshTransition(() => router.refresh());
  }

  return (
    <div className="grid gap-4">
      <section
        aria-label="Publish actions"
        className="rounded-2xl border border-border bg-surface p-4 shadow-sm"
      >
        <div className="flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Publish actions
            </h2>
            <p className="mt-1 text-xs text-muted" aria-live="polite">
              {selectedIds.length
                ? `${selectedIds.length} draft component${selectedIds.length === 1 ? "" : "s"} selected`
                : "Select draft components to validate, publish, or move."}
            </p>
          </div>
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

        <div className="mt-4 grid items-end gap-3 xl:grid-cols-[minmax(16rem,1fr)_minmax(19rem,1.15fr)_minmax(25rem,1.5fr)]">
          <div className="grid gap-3 sm:grid-cols-[auto_minmax(12rem,1fr)] sm:items-end xl:grid-cols-1">
            <PermissionGate anyOf={["customization.publish"]}>
              <label
                className={[
                  "inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm text-foreground",
                  isBusy ? "cursor-not-allowed opacity-70" : "cursor-pointer",
                ].join(" ")}
              >
                <input
                  aria-label="Select all visible draft components"
                  checked={allSelected}
                  className="h-4 w-4 rounded border-border"
                  disabled={isBusy || visibleDrafts.length === 0}
                  onChange={(event) => {
                    clearValidationFeedback();
                    setSelectedIds(
                      event.target.checked
                        ? visibleDrafts.map((row) => row.id)
                        : [],
                    );
                  }}
                  type="checkbox"
                />
                Select all visible
              </label>
            </PermissionGate>
            <SelectField
              className="min-w-0"
              disabled={isBusy}
              label="Package filter"
              onChange={(value) => {
                setPackageFilter(value);
                setSelectedIds([]);
                clearValidationFeedback();
              }}
              options={packages.map((item) => ({
                label: item.displayName,
                value: item.id,
              }))}
              placeholder="All draft packages"
              value={packageFilter}
            />
          </div>

          <PermissionGate anyOf={["customization.publish"]}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Button
                disabled={!selectedIds.length || isBusy}
                leftIcon={<ShieldCheck className="h-4 w-4" />}
                loading={isValidating}
                loadingText="Validating..."
                onClick={() =>
                  void validate(
                    selectedIds,
                    `${selectedIds.length} selected component${selectedIds.length === 1 ? "" : "s"}`,
                  )
                }
                size="sm"
                title={
                  selectedIds.length
                    ? "Validate selected draft metadata."
                    : "Select draft components to validate."
                }
                type="button"
              >
                Validate selected
              </Button>
              <Button
                disabled={!selectedIds.length || isBusy}
                loading={isPublishing}
                loadingText="Publishing..."
                onClick={() => void publishSelected()}
                size="sm"
                title={
                  selectedIds.length
                    ? "Publish selected draft metadata."
                    : "Select draft components to publish."
                }
                type="button"
                variant="secondary"
              >
                Publish selected
              </Button>
            </div>

            <div className="grid items-end gap-3 sm:grid-cols-[minmax(13rem,1fr)_auto]">
              <SelectField
                className="min-w-0"
                disabled={isBusy || movablePackages.length === 0}
                label="Move target"
                onChange={setTargetPackageId}
                options={movablePackages.map((item) => ({
                  label: item.displayName,
                  value: item.id,
                }))}
                placeholder={
                  movablePackages.length
                    ? "Select Custom Package"
                    : "No writable Custom Packages"
                }
                value={targetPackageId}
              />
              <Button
                disabled={!selectedIds.length || !targetPackageId || isBusy}
                leftIcon={<MoveRight className="h-4 w-4" />}
                loading={isMoving}
                loadingText="Moving..."
                onClick={() => void moveSelected()}
                size="sm"
                title={
                  !selectedIds.length
                    ? "Select draft components to move."
                    : !targetPackageId
                      ? "Choose a target Custom Package."
                      : "Move selected drafts to the target package."
                }
                type="button"
                variant="ghost"
              >
                Move to Package
              </Button>
            </div>
          </PermissionGate>
        </div>
      </section>

      {error ? (
        <div
          aria-live="assertive"
          className="rounded-lg border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger"
          role="alert"
        >
          {error}
        </div>
      ) : null}
      {success ? (
        <div
          aria-live="polite"
          className="rounded-lg border border-success/20 bg-success/5 px-4 py-3 text-sm text-success"
          role="status"
        >
          {success}
        </div>
      ) : null}
      {validation ? (
        <div
          aria-live="polite"
          className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted"
        >
          <span className="font-semibold text-foreground">
            {validationScope ?? "Selection"}:
          </span>{" "}
          {validation.issues.length} validation issue
          {validation.issues.length === 1 ? "" : "s"} found. Publish is{" "}
          {validation.valid ? "not blocked by foundation checks" : "blocked"}.
        </div>
      ) : null}

      <DataTable
        className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm"
        columns={columns}
        emptyState={
          <EmptyState
            description="No draft package components are pending publish."
            title="No draft metadata"
          />
        }
        getRowKey={(row) => row.id}
        pagination={{ page: 1, pageSize: 10, total: visibleDrafts.length }}
        rows={visibleDrafts}
        searchPlaceholder="Search draft components"
        tableClassName="min-w-[1180px] divide-y divide-border text-xs"
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
  };
  return labels[value] ?? value.charAt(0).toUpperCase() + value.slice(1);
}

function actionLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function stateLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
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
