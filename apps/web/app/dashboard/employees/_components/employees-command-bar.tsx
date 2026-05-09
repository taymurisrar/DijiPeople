"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Download,
  FileDown,
  FileUp,
  Plus,
  RefreshCcw,
  Trash2,
  UserRoundCheck,
} from "lucide-react";
import { CommandBar } from "@/app/components/command-bar/command-bar";
import { CommandBarItem } from "@/app/components/command-bar/types";
import {
  ConfirmationDialog,
  SideToast,
} from "@/app/components/notifications";
import { LookupField, LookupOption } from "@/app/components/ui/form-control";

type EmployeesCommandBarProps = {
  canCreateEmployee: boolean;
  canDeleteEmployee?: boolean;
  canShareEmployee?: boolean;
  canAssignEmployee?: boolean;
  canImportEmployee?: boolean;
  canExportEmployee?: boolean;
  context?: "list" | "detail";
  employeeId?: string;
  employeeCode?: string;
};

type EmployeesSelectionChangedEventDetail = {
  ids?: string[];
  count?: number;
};

type ToastState = {
  title: string;
  description?: string;
  variant: "success" | "error" | "warning" | "info";
};

type OwnerOptionsResponse = {
  items: Array<{
    id: string;
    name: string;
    email: string;
  }>;
};

export function EmployeesCommandBar({
  canCreateEmployee,
  canDeleteEmployee = false,
  canShareEmployee = false,
  canAssignEmployee = false,
  canImportEmployee = false,
  canExportEmployee = false,
  context = "list",
  employeeId,
  employeeCode,
}: EmployeesCommandBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [ownerUserId, setOwnerUserId] = useState("");
  const [ownerOptions, setOwnerOptions] = useState<LookupOption[]>([]);
  const [toast, setToast] = useState<ToastState | null>(null);

  const actionEmployeeIds = useMemo(
    () => (context === "detail" && employeeId ? [employeeId] : selectedIds),
    [context, employeeId, selectedIds],
  );
  const selectedCount = actionEmployeeIds.length;
  const hasSelection = selectedCount > 0;

  useEffect(() => {
    if (context !== "list") return;

    function handleSelectionChanged(event: Event) {
      const customEvent =
        event as CustomEvent<EmployeesSelectionChangedEventDetail>;

      setSelectedIds(customEvent.detail?.ids ?? []);
    }

    window.addEventListener(
      "employees:selected-ids-changed",
      handleSelectionChanged,
    );

    return () => {
      window.removeEventListener(
        "employees:selected-ids-changed",
        handleSelectionChanged,
      );
    };
  }, [context]);

  async function readError(response: Response, fallback: string) {
    const text = await response.text().catch(() => "");
    if (!text) return fallback;

    try {
      const data = JSON.parse(text) as { message?: unknown };
      return typeof data.message === "string" ? data.message : fallback;
    } catch {
      return text;
    }
  }

  async function downloadFile(url: string, fallbackFilename: string) {
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(await readError(response, "Unable to download file."));
    }

    const blob = await response.blob();
    const disposition = response.headers.get("content-disposition") ?? "";
    const filename =
      disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? fallbackFilename;
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }

  function clearSelection() {
    if (context === "list") {
      setSelectedIds([]);
      window.dispatchEvent(new CustomEvent("employees:clear-selection"));
    }
  }

  function confirmDelete() {
    if (!hasSelection || isPending) return;
    setDeleteOpen(true);
  }

  function confirmAssign() {
    if (!hasSelection || isPending) return;
    setAssignOpen(true);
    setOwnerUserId("");
    void loadOwnerOptions();
  }

  async function loadOwnerOptions() {
    const response = await fetch("/api/employees/owner-options", {
      cache: "no-store",
    });

    if (!response.ok) {
      setToast({
        title: "Owner lookup failed",
        description: await readError(response, "Unable to load tenant users."),
        variant: "error",
      });
      return;
    }

    const data = (await response.json()) as OwnerOptionsResponse;
    setOwnerOptions(
      data.items.map((user) => ({
        id: user.id,
        name: user.name,
        subtitle: user.email,
      })),
    );
  }

  function deleteEmployees() {
    startTransition(async () => {
      const response =
        context === "detail" && employeeId
          ? await fetch(`/api/employees/${employeeId}`, { method: "DELETE" })
          : await fetch("/api/employees/bulk-delete", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ids: actionEmployeeIds }),
            });

      if (!response.ok) {
        setToast({
          title: "Delete failed",
          description: await readError(response, "Unable to delete employee."),
          variant: "error",
        });
        return;
      }

      setDeleteOpen(false);
      clearSelection();
      setToast({
        title: "Employee archived",
        description:
          selectedCount === 1
            ? "The employee record was archived."
            : `${selectedCount} employee records were archived.`,
        variant: "success",
      });

      if (context === "detail") {
        router.push("/dashboard/employees");
      } else {
        router.refresh();
      }
    });
  }

  function assignOwner() {
    if (!ownerUserId) return;

    startTransition(async () => {
      const response =
        context === "detail" && employeeId
          ? await fetch(`/api/employees/${employeeId}/assign-owner`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ownerUserId }),
            })
          : await fetch("/api/employees/assign-owner", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                employeeIds: actionEmployeeIds,
                ownerUserId,
              }),
            });

      if (!response.ok) {
        setToast({
          title: "Assign failed",
          description: await readError(response, "Unable to assign owner."),
          variant: "error",
        });
        return;
      }

      setAssignOpen(false);
      clearSelection();
      setToast({
        title: "Owner assigned",
        description:
          selectedCount === 1
            ? "The employee owner was updated."
            : `${selectedCount} employee owners were updated.`,
        variant: "success",
      });
      router.refresh();
    });
  }

  function exportList() {
    startTransition(async () => {
      const query = searchParams.toString();

      try {
        await downloadFile(
          `/api/employees/export${query ? `?${query}` : ""}`,
          "employees-export.csv",
        );
        setToast({
          title: "Export started",
          description: "The filtered employees export was downloaded.",
          variant: "success",
        });
      } catch (error) {
        setToast({
          title: "Export failed",
          description:
            error instanceof Error
              ? error.message
              : "Unable to export employees.",
          variant: "error",
        });
      }
    });
  }

  function exportTemplate() {
    startTransition(async () => {
      try {
        await downloadFile(
          "/api/employees/export-template",
          "employees-import-template.csv",
        );
        setToast({
          title: "Template downloaded",
          description: "The employee import template was downloaded.",
          variant: "success",
        });
      } catch (error) {
        setToast({
          title: "Template download failed",
          description:
            error instanceof Error
              ? error.message
              : "Unable to download the employee template.",
          variant: "error",
        });
      }
    });
  }

  function exportCurrentEmployee() {
    if (!employeeId) return;

    startTransition(async () => {
      try {
        await downloadFile(
          `/api/employees/${employeeId}/export`,
          `employee-${employeeCode || employeeId}-export.csv`,
        );
        setToast({
          title: "Export started",
          description: "The employee profile export was downloaded.",
          variant: "success",
        });
      } catch (error) {
        setToast({
          title: "Export failed",
          description:
            error instanceof Error
              ? error.message
              : "Unable to export this employee.",
          variant: "error",
        });
      }
    });
  }

  const items: CommandBarItem[] = [
    {
      key: "back",
      label: "",
      icon: ArrowLeft,
      href: context === "detail" ? "/dashboard/employees" : "/dashboard",
      tooltip: "Back",
    },
    {
      key: "new",
      label: "New",
      icon: Plus,
      href: "/dashboard/employees/new",
      hidden: !canCreateEmployee,
    },
    {
      key: "delete-selected",
      label: "Delete",
      icon: Trash2,
      danger: true,
      hidden: !canDeleteEmployee,
      disabled: !hasSelection || isPending,
      requiresSelection: context === "list",
      onClick: confirmDelete,
    },
    {
      key: "assign",
      label: "Assign",
      icon: UserRoundCheck,
      hidden: !canAssignEmployee,
      disabled: !hasSelection || isPending,
      requiresSelection: context === "list",
      onClick: confirmAssign,
    },
    {
      key: "data",
      label: "Data",
      icon: Download,
      hidden: !canExportEmployee && !canImportEmployee,
      actions: [
        {
          key: "export",
          label: "Export",
          icon: FileDown,
          hidden: !canExportEmployee,
          disabled: isPending,
          onClick:
            context === "detail" ? exportCurrentEmployee : exportList,
        },
        {
          key: "export-template",
          label: "Export template",
          icon: Download,
          hidden: !canExportEmployee || context === "detail",
          disabled: isPending,
          onClick: exportTemplate,
        },
        {
          key: "import",
          label: "Import",
          icon: FileUp,
          href: "/dashboard/employees/import",
          hidden: !canImportEmployee || context === "detail",
        },
      ],
    },
    {
      key: "refresh",
      label: "Refresh",
      icon: RefreshCcw,
      disabled: isPending,
      onClick: () => router.refresh(),
    },
  ];

  return (
    <>
      <CommandBar
        variant="list"
        title={context === "detail" ? (employeeCode ?? "Employee") : "Employees"}
        subtitle="Manage employee records, assignments, imports, and exports."
        selectedCount={selectedCount}
        selectedIds={actionEmployeeIds}
        items={items}
      />

      <ConfirmationDialog
        cancelLabel="Cancel"
        confirmLabel="Delete"
        description="This is a soft delete/archive action. The record will be removed from active employee lists and exports."
        isLoading={isPending}
        isOpen={deleteOpen}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={deleteEmployees}
        title={
          selectedCount === 1
            ? "Delete this employee?"
            : `Delete ${selectedCount} employees?`
        }
        variant="danger"
      />

      {assignOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
        >
          <div className="w-full max-w-md rounded-[28px] border border-border bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-foreground">
              Assign owner
            </h3>
            <p className="mt-2 text-sm leading-6 text-muted">
              Select a tenant user to own {selectedCount === 1 ? "this employee" : `${selectedCount} employees`}.
            </p>
            <div className="mt-4">
            <LookupField
              label="Owner"
              options={ownerOptions}
              placeholder="Search tenant users"
              value={ownerUserId}
              onChange={setOwnerUserId}
              noResultsText="No tenant users found."
            />
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                className="rounded-2xl border border-border bg-white px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isPending}
                onClick={() => setAssignOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-2xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isPending || !ownerUserId}
                onClick={assignOwner}
                type="button"
              >
                {isPending ? "Please wait..." : "Assign"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <SideToast
          isOpen
          title={toast.title}
          description={toast.description}
          variant={toast.variant}
          onClose={() => setToast(null)}
        />
      ) : null}
    </>
  );
}
