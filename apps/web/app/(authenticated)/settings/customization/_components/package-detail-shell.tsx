"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Download,
  FilePlus2,
  FolderTree,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Unlink,
  UploadCloud,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { PermissionGate } from "@/app/(authenticated)/_components/permission-gate";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { ConfirmDialog } from "@/app/components/feedback/confirm-dialog";
import { TopAlert } from "@/app/components/notifications/top-alert";
import { Button } from "@/app/components/ui/button";
import { EmptyState } from "@/app/components/ui/empty-state";
import { SelectField } from "@/app/components/ui/form-control";
import { StatusPill } from "@/app/components/ui/status-pill";
import { useDialogBehavior } from "@/app/components/ui/dialog";
import type {
  CustomizationDependencyIssue,
  CustomizationPackageCandidate,
  CustomizationPackageComponent,
  CustomizationPackageDetail,
  CustomizationTable,
} from "../types";

type PackageDetailShellProps = {
  packageDetail: CustomizationPackageDetail;
  modules: CustomizationTable[];
};

type AddExistingState = {
  moduleKey: string;
  componentType: string;
  selectedIds: string[];
};

type ExplorerSelection =
  | { kind: "package" }
  | { kind: "module"; moduleKey: string }
  | { kind: "type"; moduleKey: string; componentType: string }
  | { kind: "component"; componentId: string };

type ConfirmAction =
  | { kind: "remove"; component: CustomizationPackageComponent }
  | { kind: "delete"; component: CustomizationPackageComponent }
  | null;

const componentTypeOptions = [
  { value: "module", label: "Module", storageBacked: true },
  { value: "field", label: "Fields", storageBacked: true },
  { value: "form", label: "Forms", storageBacked: true },
  { value: "view", label: "Views", storageBacked: true },
  { value: "choiceList", label: "Choice Lists", storageBacked: false },
  { value: "relationship", label: "Relationships", storageBacked: false },
  { value: "actionBar", label: "Action Bars", storageBacked: false },
  { value: "widget", label: "Widgets", storageBacked: true },
] as const;

export function PackageDetailShell({
  packageDetail,
  modules,
}: PackageDetailShellProps) {
  const router = useRouter();
  const [selection, setSelection] = useState<ExplorerSelection>({
    kind: "package",
  });
  const [addExisting, setAddExisting] = useState<AddExistingState | null>(null);
  const [candidates, setCandidates] = useState<CustomizationPackageCandidate[]>(
    [],
  );
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [message, setMessage] = useState<{
    title: string;
    description?: string;
    variant: "success" | "error" | "warning" | "info";
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletePackageOpen, setDeletePackageOpen] = useState(false);
  const [validationOverride, setValidation] = useState(
    packageDetail.diagnostics,
  );
  const validation = validationOverride ?? packageDetail.diagnostics;

  const explorerModules = useMemo(
    () => buildExplorerModules(packageDetail.components),
    [packageDetail.components],
  );
  const selectedComponent =
    selection.kind === "component"
      ? (packageDetail.components.find(
          (component) => component.id === selection.componentId,
        ) ?? null)
      : null;
  const visibleComponents = useMemo(
    () =>
      packageDetail.components.filter((component) => {
        if (selection.kind === "module") {
          return componentModuleKey(component) === selection.moduleKey;
        }
        if (selection.kind === "type") {
          return (
            componentModuleKey(component) === selection.moduleKey &&
            normalizeComponentType(component.componentType) ===
              selection.componentType
          );
        }
        return true;
      }),
    [packageDetail.components, selection],
  );

  const componentColumns = useMemo<
    DataTableColumn<CustomizationPackageComponent>[]
  >(
    () => [
      {
        key: "name",
        header: "Component",
        searchable: true,
        sortable: true,
        sortAccessor: (row) => row.displayName,
        searchAccessor: (row) =>
          `${row.displayName} ${row.logicalName} ${row.objectKey ?? ""}`,
        render: (row) => (
          <button
            className="text-left"
            onClick={() =>
              setSelection({ kind: "component", componentId: row.id })
            }
            type="button"
          >
            <span className="block font-semibold text-accent">
              {row.displayName}
            </span>
            <span className="mt-1 block text-xs text-muted">
              {row.objectKey ?? row.logicalName}
            </span>
          </button>
        ),
      },
      {
        key: "type",
        header: "Type",
        render: (row) => componentTypeLabel(row.componentType),
      },
      {
        key: "source",
        header: "Source",
        render: (row) => (
          <StatusPill tone={row.isSystem ? "muted" : "neutral"}>
            {row.source ?? (row.isSystem ? "System" : "Custom")}
          </StatusPill>
        ),
      },
      {
        key: "layer",
        header: "Ownership / layer",
        render: (row) =>
          `${row.isManaged ? "Managed" : "Unmanaged"} / ${
            row.layerAction ?? (row.isSystem ? "Modify" : "Reference")
          }`,
      },
      {
        key: "state",
        header: "Status",
        render: (row) => (
          <StatusPill tone={row.state === "Published" ? "good" : "muted"}>
            {row.state ?? "Draft"}
          </StatusPill>
        ),
      },
      {
        key: "updatedAt",
        header: "Modified on",
        sortable: true,
        sortAccessor: (row) => row.updatedAt ?? "",
        render: (row) => formatDate(row.updatedAt),
      },
    ],
    [],
  );

  const candidateColumns = useMemo<
    DataTableColumn<CustomizationPackageCandidate>[]
  >(
    () => [
      {
        key: "select",
        header: "Select",
        render: (row) => (
          <input
            checked={addExisting?.selectedIds.includes(row.objectId) ?? false}
            disabled={row.alreadyInPackage}
            onChange={(event) =>
              setAddExisting((current) =>
                current
                  ? {
                      ...current,
                      selectedIds: event.target.checked
                        ? [...current.selectedIds, row.objectId]
                        : current.selectedIds.filter(
                            (id) => id !== row.objectId,
                          ),
                    }
                  : current,
              )
            }
            title={
              row.alreadyInPackage
                ? "Component already exists in this Package."
                : "Select component"
            }
            type="checkbox"
          />
        ),
      },
      {
        key: "name",
        header: "Component",
        searchable: true,
        render: (row) => (
          <div>
            <p className="font-semibold text-foreground">{row.displayName}</p>
            <p className="mt-1 text-xs text-muted">{row.objectKey}</p>
            {row.alreadyInPackage ? (
              <p className="mt-1 text-xs text-warning">
                Already exists in this Package.
              </p>
            ) : null}
          </div>
        ),
      },
      {
        key: "source",
        header: "Source",
        render: (row) => (row.isSystem ? "System" : "Custom"),
      },
      {
        key: "dependencies",
        header: "Dependencies",
        render: (row) =>
          row.dependencies.length ? row.dependencies.join(", ") : "None",
      },
    ],
    [addExisting?.selectedIds],
  );

  function setOperationDiagnostic(messageText: string) {
    setValidation((current) => ({
      ...(current ?? emptyDiagnostics()),
      valid: false,
      issues: [
        {
          severity: "error",
          componentId: null,
          componentType: null,
          message: messageText,
          blocking: true,
        },
      ],
    }));
  }

  useEffect(() => {
    if (!addExisting?.componentType || !addExisting.moduleKey) return;
    if (!isStorageBackedType(addExisting.componentType)) {
      const timer = window.setTimeout(() => setCandidates([]), 0);
      return () => window.clearTimeout(timer);
    }
    const controller = new AbortController();
    const params = new URLSearchParams({
      moduleKey: addExisting.moduleKey,
      componentType: addExisting.componentType,
    });
    fetch(
      `/api/customization/packages/${packageDetail.id}/candidates?${params}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        const data = (await response.json()) as
          | CustomizationPackageCandidate[]
          | { message?: string };
        if (!response.ok || !Array.isArray(data)) {
          throw new Error(
            !Array.isArray(data) && data.message
              ? data.message
              : "Unable to load package candidates.",
          );
        }
        setCandidates(data);
      })
      .catch((error: Error) => {
        if (error.name === "AbortError") return;
        setCandidates([]);
        setOperationDiagnostic(error.message);
        setMessage({
          title: "Action unavailable",
          description: error.message,
          variant: "error",
        });
      });
    return () => controller.abort();
  }, [addExisting?.componentType, addExisting?.moduleKey, packageDetail.id]);

  async function refreshPackageDiagnostics() {
    const response = await fetch(
      `/api/customization/packages/${packageDetail.id}`,
      { cache: "no-store" },
    );
    const data = (await response.json().catch(() => ({}))) as
      | CustomizationPackageDetail
      | { message?: string };

    if (!response.ok || !("diagnostics" in data)) {
      const reason =
        "message" in data && data.message
          ? data.message
          : "Package diagnostics could not be refreshed.";
      setOperationDiagnostic(reason);
      return false;
    }

    setValidation(data.diagnostics);
    return true;
  }

  async function runPackageAction(
    path: string,
    successTitle: string,
    successDescription?: string,
  ) {
    setIsSaving(true);
    const response = await fetch(path, { method: "POST" });
    const data = (await response.json().catch(() => ({}))) as {
      message?: string;
      issues?: CustomizationDependencyIssue[];
      diagnostics?: { validation?: typeof validation };
      valid?: boolean;
    };
    setIsSaving(false);
    if (!response.ok) {
      const reason = data.message ?? "Package action failed.";
      if (data.issues?.length) {
        setValidation((current) => ({
          ...(current ?? emptyDiagnostics()),
          valid: false,
          issues: data.issues ?? [],
        }));
      } else {
        setOperationDiagnostic(reason);
      }
      showError(reason);
      return;
    }
    if ("valid" in data) {
      setValidation(data as typeof validation);
    }
    setMessage({
      title: successTitle,
      description: successDescription,
      variant: "success",
    });
    await refreshPackageDiagnostics();
    router.refresh();
  }

  async function addExistingComponents(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!addExisting?.selectedIds.length) {
      showError("Select at least one component.");
      return;
    }
    setIsSaving(true);
    const response = await fetch(
      `/api/customization/packages/${packageDetail.id}/components`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          componentType: addExisting.componentType,
          objectIds: addExisting.selectedIds,
        }),
      },
    );
    const data = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    setIsSaving(false);
    if (!response.ok) {
      const reason = data.message ?? "Unable to add components.";
      setOperationDiagnostic(reason);
      showError(reason);
      return;
    }
    setAddExisting(null);
    setMessage({
      title: "Components added",
      description:
        "Parent Module membership was added automatically where required.",
      variant: "success",
    });
    await refreshPackageDiagnostics();
    router.refresh();
  }

  async function executeConfirmedAction() {
    if (!confirmAction) return;
    setIsSaving(true);
    const suffix = confirmAction.kind === "delete" ? "/metadata" : "";
    const response = await fetch(
      `/api/customization/packages/${packageDetail.id}/components/${confirmAction.component.id}${suffix}`,
      { method: "DELETE" },
    );
    const data = (await response.json().catch(() => ({}))) as {
      message?: string;
      issues?: CustomizationDependencyIssue[];
    };
    setIsSaving(false);
    if (!response.ok) {
      if (data.issues?.length) {
        setValidation((current) => ({
          ...(current ?? emptyDiagnostics()),
          valid: false,
          issues: data.issues ?? [],
        }));
      }
      const reason = data.message ?? "Component action failed.";
      if (!data.issues?.length) setOperationDiagnostic(reason);
      showError(reason);
      return;
    }
    setConfirmAction(null);
    setSelection({ kind: "package" });
    setMessage({
      title:
        confirmAction.kind === "delete"
          ? "Component deleted"
          : "Component removed from Package",
      variant: "success",
    });
    await refreshPackageDiagnostics();
    router.refresh();
  }

  async function deletePackage() {
    setIsSaving(true);
    const response = await fetch(
      `/api/customization/packages/${packageDetail.id}`,
      { method: "DELETE" },
    );
    const data = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    setIsSaving(false);

    if (!response.ok) {
      const reason = data.message ?? "Unable to delete Package.";
      setOperationDiagnostic(reason);
      showError(reason);
      setDeletePackageOpen(false);
      return;
    }

    setDeletePackageOpen(false);
    router.push(
      `/settings/customization/packages?message=${encodeURIComponent(
        data.message ?? "Package was deleted from customization workspace.",
      )}`,
    );
    router.refresh();
  }

  async function exportPackage() {
    const response = await fetch(
      `/api/customization/packages/${packageDetail.id}/export`,
    );
    const data = await response.json();
    if (!response.ok) {
      showError(data.message ?? "Unable to export Package.");
      return;
    }
    downloadJson(data, `${packageDetail.packageKey}.package.json`);
  }

  function showError(description: string) {
    setMessage({ title: "Action unavailable", description, variant: "error" });
  }

  const publishDisabledReason = packageDetail.isReadOnly
    ? "Default Package is read-only."
    : validation && !validation.valid
      ? "Package has validation errors."
      : (validation?.draftComponentsCount ??
            packageDetail.draftComponentsCount ??
            0) === 0
        ? "No draft components are pending publish."
        : null;
  const selectedType =
    selection.kind === "type"
      ? componentTypeOptions.find(
          (option) => option.value === selection.componentType,
        )
      : null;
  const newComponentHref =
    selection.kind === "type"
      ? newComponentRoute(selection.moduleKey, selection.componentType)
      : null;

  // BUG-0043: this modal kept its own layout and gained the guarantees
  // it never had - focus containment, Escape, focus restore and dialog
  // semantics. See useDialogBehavior.
  const addExistingDialog = useDialogBehavior({
    open: Boolean(addExisting),
    onClose: () => setAddExisting(null),
  });

  return (
    <div className="grid gap-4">
      {message ? (
        <TopAlert
          description={message.description}
          onDismiss={() => setMessage(null)}
          title={message.title}
          variant={message.variant}
        />
      ) : null}

      <section className="grid gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm md:grid-cols-5">
        <Metric label="Version" value={packageDetail.version} />
        <Metric label="Publisher" value={packageDetail.publisherName} />
        <Metric label="State" value={stateLabel(packageDetail.state)} />
        <Metric label="Components" value={packageDetail.componentsCount} />
        <Metric
          label="Validation"
          value={validation?.valid === false ? "Blocked" : "Ready"}
        />
      </section>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-3 shadow-sm">
        <Button
          href="/settings/customization/packages"
          leftIcon={<ArrowLeft className="h-4 w-4" />}
          size="xs"
          variant="ghost"
        >
          Back
        </Button>
        <PermissionGate anyOf={["customization.publish"]}>
          <Button
            disabled={packageDetail.isReadOnly}
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() =>
              setAddExisting({
                moduleKey:
                  selection.kind === "module" || selection.kind === "type"
                    ? selection.moduleKey
                    : (modules[0]?.tableKey ?? ""),
                componentType:
                  selection.kind === "type" && selectedType?.storageBacked
                    ? selection.componentType
                    : "module",
                selectedIds: [],
              })
            }
            size="xs"
            title={
              packageDetail.isReadOnly
                ? "Default Package is read-only."
                : "Add existing components"
            }
            variant="ghost"
          >
            Add Existing
          </Button>
          {newComponentHref ? (
            <Button
              href={newComponentHref}
              leftIcon={<FilePlus2 className="h-4 w-4" />}
              size="xs"
              title="Create a component for the selected Module."
              variant="ghost"
            >
              New Component
            </Button>
          ) : null}
          <Button
            disabled={Boolean(publishDisabledReason)}
            leftIcon={<UploadCloud className="h-4 w-4" />}
            loading={isSaving}
            onClick={() =>
              runPackageAction(
                `/api/customization/packages/${packageDetail.id}/publish`,
                "Package published",
                "Published metadata is now available to runtime selectors.",
              )
            }
            size="xs"
            title={publishDisabledReason ?? "Validate and publish this Package"}
            variant="ghost"
          >
            Publish
          </Button>
        </PermissionGate>
        <Button
          leftIcon={<ShieldAlert className="h-4 w-4" />}
          onClick={() =>
            runPackageAction(
              `/api/customization/packages/${packageDetail.id}/validate`,
              "Validation complete",
            )
          }
          size="xs"
          variant="ghost"
        >
          Validate
        </Button>
        <Button
          leftIcon={<Download className="h-4 w-4" />}
          onClick={exportPackage}
          size="xs"
          variant="ghost"
        >
          Export
        </Button>
        <Button
          leftIcon={<RefreshCw className="h-4 w-4" />}
          onClick={async () => {
            await refreshPackageDiagnostics();
            router.refresh();
          }}
          size="xs"
          variant="ghost"
        >
          Refresh
        </Button>
        <PermissionGate anyOf={["customization.publish"]}>
          <Button
            disabled={!packageDetail.canDelete}
            leftIcon={<Trash2 className="h-4 w-4" />}
            onClick={() => setDeletePackageOpen(true)}
            size="xs"
            title={packageDetail.deleteDisabledReason ?? "Delete Package"}
            variant="danger"
          >
            Delete Package
          </Button>
        </PermissionGate>
      </div>

      <DiagnosticsPanel
        diagnostics={validation}
        isReadOnly={packageDetail.isReadOnly}
      />

      <div className="grid min-h-[620px] gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <PackageExplorer
          modules={explorerModules}
          onSelect={setSelection}
          packageName={packageDetail.displayName}
          selected={selection}
        />

        <section className="min-w-0 rounded-lg border border-border bg-surface p-4 shadow-sm">
          {selection.kind === "package" ? (
            <PackageOverview
              components={packageDetail.components}
              packageDetail={packageDetail}
            />
          ) : selection.kind === "component" && selectedComponent ? (
            <ComponentDetail
              component={selectedComponent}
              deleteReason={deleteComponentReason(selectedComponent)}
              isReadOnly={packageDetail.isReadOnly}
              onDelete={() =>
                setConfirmAction({
                  kind: "delete",
                  component: selectedComponent,
                })
              }
              onRemove={() =>
                setConfirmAction({
                  kind: "remove",
                  component: selectedComponent,
                })
              }
            />
          ) : (
            <div className="grid gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                  {selection.kind === "module"
                    ? "Module summary"
                    : "Component type"}
                </p>
                <h3 className="mt-1 text-lg font-semibold text-foreground">
                  {selectionTitle(selection, explorerModules)}
                </h3>
              </div>
              <DataTable
                columns={componentColumns}
                emptyState={
                  <EmptyState
                    description="No components are available for this explorer node."
                    title="No components"
                  />
                }
                getRowKey={(row) => row.id}
                pagination={{
                  page: 1,
                  pageSize: 10,
                  total: visibleComponents.length,
                }}
                rows={visibleComponents}
                searchPlaceholder="Search components"
                tableClassName="min-w-[880px] divide-y divide-border text-xs"
              />
            </div>
          )}
        </section>
      </div>

      {addExisting ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"
          {...addExistingDialog.backdropProps}
        >
          <form
            {...addExistingDialog.panelProps}
            className="grid max-h-[92vh] w-full max-w-5xl gap-5 overflow-y-auto rounded-[20px] border border-border bg-white p-6 shadow-xl"
            onSubmit={addExistingComponents}
          >
            <div>
              <h3 className="text-lg font-semibold text-foreground" id={addExistingDialog.titleId}>
                Add Existing
              </h3>
              <p className="mt-1 text-sm text-muted">
                Select a Module, component type, and existing components. Parent
                Module membership is added automatically.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <SelectField
                label="Module"
                onChange={(moduleKey) =>
                  setAddExisting((current) =>
                    current
                      ? { ...current, moduleKey, selectedIds: [] }
                      : current,
                  )
                }
                options={modules.map((module) => ({
                  value: module.tableKey,
                  label: module.displayName,
                }))}
                value={addExisting.moduleKey}
              />
              <SelectField
                label="Component type"
                onChange={(componentType) =>
                  setAddExisting((current) =>
                    current
                      ? { ...current, componentType, selectedIds: [] }
                      : current,
                  )
                }
                options={componentTypeOptions
                  .filter((option) => option.storageBacked)
                  .map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                value={addExisting.componentType}
              />
            </div>
            <DataTable
              columns={candidateColumns}
              emptyState={
                <EmptyState
                  description="No eligible components are available for this selection."
                  title="No candidates"
                />
              }
              getRowKey={(row) => row.objectId}
              pagination={{ page: 1, pageSize: 10, total: candidates.length }}
              rows={candidates}
              searchPlaceholder="Search existing components"
              tableClassName="min-w-[760px] divide-y divide-border text-xs"
            />
            <div className="flex justify-end gap-3">
              <Button
                onClick={() => setAddExisting(null)}
                type="button"
                variant="secondary"
              >
                Cancel
              </Button>
              <Button loading={isSaving} loadingText="Adding..." type="submit">
                Add to Package
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      <ConfirmDialog
        confirmAction={{
          label:
            confirmAction?.kind === "delete"
              ? "Delete Component"
              : "Remove from Package",
          onClick: executeConfirmedAction,
          variant: "danger",
        }}
        description={
          confirmAction
            ? confirmAction.kind === "delete"
              ? `Delete the actual custom metadata for "${confirmAction.component.displayName}"? This is blocked for system, managed, published, default, or referenced components.`
              : `Remove "${confirmAction.component.displayName}" from this Package only? The underlying metadata will remain.`
            : undefined
        }
        isLoading={isSaving}
        onClose={() => setConfirmAction(null)}
        open={Boolean(confirmAction)}
        title={
          confirmAction?.kind === "delete"
            ? "Delete Component"
            : "Remove from Package"
        }
      />
      <ConfirmDialog
        confirmAction={{
          label: "Delete Package",
          onClick: deletePackage,
          variant: "danger",
        }}
        description={`Delete "${packageDetail.displayName}" from the customization workspace? Draft package memberships will be removed. Module metadata and business records will not be deleted.`}
        isLoading={isSaving}
        onClose={() => setDeletePackageOpen(false)}
        open={deletePackageOpen}
        title="Delete Package"
      />
    </div>
  );
}

function PackageExplorer({
  modules,
  onSelect,
  packageName,
  selected,
}: {
  modules: ReturnType<typeof buildExplorerModules>;
  onSelect: (selection: ExplorerSelection) => void;
  packageName: string;
  selected: ExplorerSelection;
}) {
  return (
    <aside className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
      <button
        className={`flex w-full items-center gap-2 border-b border-border px-4 py-3 text-left font-semibold ${
          selected.kind === "package" ? "bg-accent/10 text-accent" : ""
        }`}
        onClick={() => onSelect({ kind: "package" })}
        type="button"
      >
        <FolderTree className="h-4 w-4" />
        <span className="truncate">{packageName}</span>
      </button>
      <div className="max-h-[720px] overflow-y-auto p-2">
        {modules.map((module) => (
          <div className="mb-1" key={module.moduleKey}>
            <button
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-semibold ${
                selected.kind === "module" &&
                selected.moduleKey === module.moduleKey
                  ? "bg-accent/10 text-accent"
                  : "hover:bg-muted/20"
              }`}
              onClick={() =>
                onSelect({ kind: "module", moduleKey: module.moduleKey })
              }
              type="button"
            >
              <span className="truncate">{module.moduleName}</span>
              <span className="text-xs text-muted">{module.total}</span>
            </button>
            <div className="ml-3 border-l border-border pl-2">
              {componentTypeOptions
                .filter((type) => type.value !== "module")
                .map((type) => {
                  const count = module.counts[type.value] ?? 0;
                  const active =
                    selected.kind === "type" &&
                    selected.moduleKey === module.moduleKey &&
                    selected.componentType === type.value;
                  return (
                    <button
                      className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-xs ${
                        active
                          ? "bg-accent/10 font-semibold text-accent"
                          : "text-muted hover:bg-muted/20 hover:text-foreground"
                      }`}
                      key={type.value}
                      onClick={() =>
                        onSelect({
                          kind: "type",
                          moduleKey: module.moduleKey,
                          componentType: type.value,
                        })
                      }
                      type="button"
                    >
                      <span className="truncate">{type.label}</span>
                      <span>{count}</span>
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

function PackageOverview({
  components,
  packageDetail,
}: {
  components: readonly CustomizationPackageComponent[];
  packageDetail: CustomizationPackageDetail;
}) {
  const counts = componentTypeOptions.map((type) => ({
    label: type.label,
    count: components.filter(
      (component) =>
        normalizeComponentType(component.componentType) === type.value,
    ).length,
  }));
  return (
    <div className="grid gap-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
          Package overview
        </p>
        <h3 className="mt-1 text-xl font-semibold text-foreground">
          {packageDetail.displayName}
        </h3>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          {packageDetail.description || "No Package description is set."}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {counts.map((item) => (
          <div
            className="rounded-lg border border-border bg-muted/5 p-3"
            key={item.label}
          >
            <p className="text-xs text-muted">{item.label}</p>
            <p className="mt-1 text-xl font-semibold">{item.count}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ComponentDetail({
  component,
  deleteReason,
  isReadOnly,
  onDelete,
  onRemove,
}: {
  component: CustomizationPackageComponent;
  deleteReason: string | null;
  isReadOnly: boolean;
  onDelete: () => void;
  onRemove: () => void;
}) {
  const removeReason = isReadOnly ? "Default Package is read-only." : null;
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
            {componentTypeLabel(component.componentType)}
          </p>
          <h3 className="mt-1 text-xl font-semibold text-foreground">
            {component.displayName}
          </h3>
          <p className="mt-1 text-sm text-muted">
            {component.objectKey ?? component.logicalName}
          </p>
        </div>
        <PermissionGate anyOf={["customization.publish"]}>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={Boolean(removeReason)}
              leftIcon={<Unlink className="h-4 w-4" />}
              onClick={onRemove}
              size="xs"
              title={removeReason ?? "Unlink membership only"}
              variant="secondary"
            >
              Remove from Package
            </Button>
            <Button
              disabled={Boolean(deleteReason)}
              leftIcon={<Trash2 className="h-4 w-4" />}
              onClick={onDelete}
              size="xs"
              title={deleteReason ?? "Delete actual custom metadata"}
              variant="danger"
            >
              Delete Component
            </Button>
          </div>
        </PermissionGate>
      </div>
      <dl className="grid gap-4 rounded-lg border border-border bg-muted/5 p-4 sm:grid-cols-2">
        <Detail label="Module" value={componentModuleName(component)} />
        <Detail
          label="Ownership"
          value={component.isSystem ? "System-owned" : "Custom-owned"}
        />
        <Detail label="Source" value={component.source ?? "Custom"} />
        <Detail
          label="Layer action"
          value={component.layerAction ?? "Reference"}
        />
        <Detail label="Status" value={component.state ?? "Draft"} />
        <Detail label="Version" value={component.version ?? "1.0.0"} />
        <Detail
          label="Dependencies"
          value={
            component.dependencies?.length
              ? component.dependencies.join(", ")
              : "No recorded dependencies"
          }
        />
        <Detail label="Modified on" value={formatDate(component.updatedAt)} />
      </dl>
      {deleteReason ? (
        <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning">
          {deleteReason}
        </div>
      ) : null}
    </div>
  );
}

function DiagnosticsPanel({
  diagnostics,
  isReadOnly,
}: {
  diagnostics: CustomizationPackageDetail["diagnostics"];
  isReadOnly: boolean;
}) {
  const issues = diagnostics?.issues ?? [];
  const blocking = issues.filter((issue) => issue.blocking);
  const warnings = issues.filter(
    (issue) => !issue.blocking && issue.severity === "warning",
  );
  const information = issues.filter(
    (issue) => !issue.blocking && issue.severity === "info",
  );
  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-warning" />
        <h3 className="font-semibold text-foreground">Package diagnostics</h3>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <DiagnosticBucket
          items={[
            ...(isReadOnly
              ? ["Default/System Package cannot be deleted."]
              : []),
            ...blocking.map((issue) => issue.message),
          ]}
          label="Blocking errors"
        />
        <DiagnosticBucket
          items={warnings.map((issue) => issue.message)}
          label="Warnings"
        />
        <DiagnosticBucket
          items={[
            ...(diagnostics?.missingHandlers ?? []),
            ...(diagnostics?.unsupportedComponentTypes ?? []).map(
              (type) => `${type}: component type is not storage-backed yet.`,
            ),
            ...(diagnostics?.permissionIssues ?? []),
            ...information.map((issue) => issue.message),
          ]}
          label="Gaps and permissions"
        />
      </div>
    </section>
  );
}

function DiagnosticBucket({
  items,
  label,
}: {
  items: readonly string[];
  label: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/5 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      {items.length ? (
        <ul className="mt-2 grid gap-1 text-sm text-foreground">
          {items.slice(0, 8).map((item) => (
            <li key={item}>- {item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">None</p>
      )}
    </div>
  );
}

function buildExplorerModules(
  components: readonly CustomizationPackageComponent[],
) {
  const map = new Map<
    string,
    {
      moduleKey: string;
      moduleName: string;
      total: number;
      counts: Record<string, number>;
    }
  >();
  for (const component of components) {
    const moduleKey = componentModuleKey(component);
    const current = map.get(moduleKey) ?? {
      moduleKey,
      moduleName: componentModuleName(component),
      total: 0,
      counts: {},
    };
    current.total += 1;
    const type = normalizeComponentType(component.componentType);
    current.counts[type] = (current.counts[type] ?? 0) + 1;
    map.set(moduleKey, current);
  }
  return Array.from(map.values()).sort((left, right) =>
    left.moduleName.localeCompare(right.moduleName),
  );
}

function selectionTitle(
  selection: ExplorerSelection,
  modules: ReturnType<typeof buildExplorerModules>,
) {
  if (selection.kind === "module") {
    return modules.find((module) => module.moduleKey === selection.moduleKey)
      ?.moduleName;
  }
  if (selection.kind === "type") {
    return componentTypeOptions.find(
      (type) => type.value === selection.componentType,
    )?.label;
  }
  return "Components";
}

function componentModuleKey(component: CustomizationPackageComponent) {
  return component.tableKey ?? component.moduleKey ?? "global";
}

function componentModuleName(component: CustomizationPackageComponent) {
  return (
    component.tableDisplayName ??
    component.moduleDisplayName ??
    component.moduleLogicalName ??
    "Global"
  );
}

function normalizeComponentType(value: string) {
  const map: Record<string, string> = {
    table: "module",
    column: "field",
    optionSet: "choiceList",
    lookup: "relationship",
  };
  return map[value] ?? value;
}

function componentTypeLabel(value: string) {
  return (
    componentTypeOptions.find(
      (option) => option.value === normalizeComponentType(value),
    )?.label ?? value
  );
}

function deleteComponentReason(component: CustomizationPackageComponent) {
  if (component.isSystem) {
    return "Component is system-owned and cannot be deleted.";
  }
  if (component.isManaged) {
    return "Managed components cannot be deleted.";
  }
  if (!component.isCustom) {
    return "Only custom metadata can be deleted.";
  }
  if (component.state === "Published") {
    return "Published runtime metadata must be replaced or retired before deletion.";
  }
  if (
    !["field", "form", "view"].includes(
      normalizeComponentType(component.componentType),
    )
  ) {
    return "Component type is not storage-backed for deletion yet.";
  }
  if (component.dependencies?.length) {
    return "Component has dependencies and cannot be deleted.";
  }
  return null;
}

function isStorageBackedType(value: string) {
  return ["module", "field", "form", "view"].includes(value);
}

function newComponentRoute(moduleKey: string, componentType: string) {
  if (componentType === "field") {
    return `/settings/customization/tables/${moduleKey}/columns`;
  }
  if (componentType === "form") {
    return `/settings/customization/tables/${moduleKey}/forms`;
  }
  if (componentType === "view") {
    return `/settings/customization/tables/${moduleKey}/views`;
  }
  if (componentType === "choiceList") {
    return `/settings/customization/tables/${moduleKey}?tab=choiceLists`;
  }
  if (componentType === "relationship") {
    return `/settings/customization/tables/${moduleKey}?tab=relationships`;
  }
  if (componentType === "actionBar") {
    return `/settings/customization/tables/${moduleKey}?tab=actionBars`;
  }
  return null;
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

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

function emptyDiagnostics() {
  return {
    valid: true,
    issues: [] as CustomizationDependencyIssue[],
    draftComponentsCount: 0,
    publishedComponentsCount: 0,
    unsupportedComponentTypes: [] as string[],
    missingHandlers: [] as string[],
    permissionIssues: [] as string[],
  };
}

function downloadJson(value: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
