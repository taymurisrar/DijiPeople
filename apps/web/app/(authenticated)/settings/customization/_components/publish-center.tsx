"use client";

import { MoveRight, RefreshCw, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
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
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [publishedIds, setPublishedIds] = useState<string[]>([]);
  const [packageFilter, setPackageFilter] = useState("");
  const [targetPackageId, setTargetPackageId] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
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

  const columns = useMemo<
    DataTableColumn<CustomizationPublishDraftComponent>[]
  >(
    () => [
      {
        key: "select",
        header: "",
        render: (row) => (
          <input
            aria-label={`Select ${row.componentName}`}
            checked={selectedIdSet.has(row.id)}
            className="h-4 w-4 rounded border-border"
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
        render: () => (
          <Button
            disabled
            size="sm"
            title="Component publish actions are not enabled yet."
            variant="ghost"
          >
            Review
          </Button>
        ),
      },
    ],
    [selectedIdSet],
  );

  async function validate() {
    setIsValidating(true);
    setError(null);
    setSuccess(null);
    const response = await fetch("/api/customization/publish/validate", {
      method: "POST",
      body: JSON.stringify({ componentIds: selectedIds }),
      headers: { "Content-Type": "application/json" },
    });
    const data = (await response.json().catch(() => ({}))) as
      | CustomizationPublishValidationResult
      | { message?: string };
    setIsValidating(false);
    if (!response.ok || !("issues" in data)) {
      setError(
        "message" in data && data.message
          ? data.message
          : "Unable to validate draft metadata.",
      );
      return;
    }
    setValidation(data);
  }

  async function publishSelected() {
    if (!selectedIds.length) {
      setError("Select at least one draft component to publish.");
      return;
    }
    setIsPublishing(true);
    setError(null);
    setSuccess(null);
    const response = await fetch("/api/customization/publish/components", {
      method: "POST",
      body: JSON.stringify({ componentIds: selectedIds }),
      headers: { "Content-Type": "application/json" },
    });
    const data = (await response.json().catch(() => ({}))) as {
      count?: number;
      message?: string;
      issues?: Array<{ message?: string }>;
      packages?: Array<{
        afterState?: string;
        draftComponentsCount?: number;
        packageName?: string;
        publishedComponentsCount?: number;
      }>;
    };
    setIsPublishing(false);
    if (!response.ok) {
      setError(
        data.message ??
          data.issues?.[0]?.message ??
          "Unable to publish selected draft metadata.",
      );
      return;
    }
    setPublishedIds((current) => [...new Set([...current, ...selectedIds])]);
    setSelectedIds([]);
    setValidation(null);
    const packageSummary = data.packages?.length
      ? ` ${data.packages
          .map(
            (item) =>
              `${item.packageName ?? "Package"} is ${item.afterState ?? "updated"} (${item.draftComponentsCount ?? 0} draft, ${item.publishedComponentsCount ?? 0} published).`,
          )
          .join(" ")}`
      : "";
    setSuccess(
      `${data.count ?? selectedIds.length} component(s) published.${packageSummary}`,
    );
    router.refresh();
  }

  async function moveSelected() {
    if (!selectedIds.length || !targetPackageId) {
      setError("Select draft components and a target Custom Package.");
      return;
    }
    setIsMoving(true);
    setError(null);
    setSuccess(null);
    const response = await fetch("/api/customization/components/move", {
      method: "POST",
      body: JSON.stringify({
        componentIds: selectedIds,
        targetPackageId,
      }),
      headers: { "Content-Type": "application/json" },
    });
    const data = (await response.json().catch(() => ({}))) as {
      count?: number;
      message?: string;
    };
    setIsMoving(false);
    if (!response.ok) {
      setError(data.message ?? "Unable to move draft components.");
      return;
    }
    setSelectedIds([]);
    setSuccess(`${data.count ?? selectedIds.length} component(s) moved.`);
    router.refresh();
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-surface p-3 shadow-sm">
        <label className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted">
          <input
            aria-label="Select all draft components"
            checked={allSelected}
            className="h-4 w-4 rounded border-border"
            onChange={(event) => {
              setValidation(null);
              setSuccess(null);
              setSelectedIds(
                event.target.checked ? visibleDrafts.map((row) => row.id) : [],
              );
            }}
            type="checkbox"
          />
          Select all
        </label>
        <div className="min-w-56">
          <SelectField
            label="Package filter"
            onChange={(value) => {
              setPackageFilter(value);
              setSelectedIds([]);
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
          <Button
            leftIcon={<ShieldCheck className="h-4 w-4" />}
            loading={isValidating}
            loadingText="Validating..."
            onClick={validate}
            type="button"
          >
            Validate
          </Button>
          <Button
            disabled={!selectedIds.length || isPublishing}
            loading={isPublishing}
            loadingText="Publishing..."
            onClick={publishSelected}
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
          <div className="min-w-56">
            <SelectField
              label="Move target"
              onChange={setTargetPackageId}
              options={movablePackages.map((item) => ({
                label: item.displayName,
                value: item.id,
              }))}
              placeholder="Select Custom Package"
              value={targetPackageId}
            />
          </div>
          <Button
            disabled={!selectedIds.length || !targetPackageId || isMoving}
            leftIcon={<MoveRight className="h-4 w-4" />}
            loading={isMoving}
            loadingText="Moving..."
            onClick={moveSelected}
            type="button"
            variant="ghost"
          >
            Move to Package
          </Button>
        </PermissionGate>
        <Button
          leftIcon={<RefreshCw className="h-4 w-4" />}
          onClick={() => router.refresh()}
          type="button"
          variant="ghost"
        >
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-lg border border-success/20 bg-success/5 px-4 py-3 text-sm text-success">
          {success}
        </div>
      ) : null}
      {validation ? (
        <div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">
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
