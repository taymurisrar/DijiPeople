"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileDown,
  FileUp,
  Plus,
  RefreshCcw,
  Share2,
  Trash2,
  UserRoundCheck,
  XCircle,
} from "lucide-react";
import { CommandBar } from "@/app/components/command-bar/command-bar";
import { CommandBarItem } from "@/app/components/command-bar/types";
import {
  ConfirmationDialog,
  SideToast,
} from "@/app/components/notifications";

type LeavesCommandBarProps = {
  canCreateLeave?: boolean;
  canDeleteLeave?: boolean;
  canShareLeave?: boolean;
  canAssignLeave?: boolean;
  canImportLeave?: boolean;
  canExportLeave?: boolean;
  canApproveLeave?: boolean;
  canRejectLeave?: boolean;
  context?: "list" | "detail";
  leaveRequestId?: string;
  leaveRequestCode?: string;
  pendingApprovals?: number;
};

type LeavesSelectionChangedEventDetail = {
  ids?: string[];
  count?: number;
};

type ToastState = {
  title: string;
  description?: string;
  variant: "success" | "error" | "warning" | "info";
};

export function LeavesCommandBar({
  canCreateLeave = false,
  canDeleteLeave = false,
  canShareLeave = false,
  canAssignLeave = false,
  canImportLeave = false,
  canExportLeave = false,
  canApproveLeave = false,
  canRejectLeave = false,
  context = "list",
  leaveRequestId,
  leaveRequestCode,
  pendingApprovals = 0,
}: LeavesCommandBarProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [toast, setToast] = useState<ToastState | null>(null);

  const actionLeaveIds = useMemo(
    () =>
      context === "detail" && leaveRequestId ? [leaveRequestId] : selectedIds,
    [context, leaveRequestId, selectedIds],
  );

  const selectedCount = actionLeaveIds.length;
  const hasSelection = selectedCount > 0;

  useEffect(() => {
    if (context !== "list") return;

    function handleSelectionChanged(event: Event) {
      const customEvent =
        event as CustomEvent<LeavesSelectionChangedEventDetail>;

      setSelectedIds(customEvent.detail?.ids ?? []);
    }

    window.addEventListener(
      "leaves:selected-ids-changed",
      handleSelectionChanged,
    );

    return () => {
      window.removeEventListener(
        "leaves:selected-ids-changed",
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

  async function postLeaveAction(
    leaveRequestId: string,
    action: "approve" | "reject",
    body: Record<string, unknown>,
  ) {
    return fetch(`/api/leave-requests/${leaveRequestId}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  function clearSelection() {
    if (context === "list") {
      setSelectedIds([]);
      window.dispatchEvent(new CustomEvent("leaves:clear-selection"));
    }
  }

  function confirmApprove() {
    if (!hasSelection || isPending) return;
    setApproveOpen(true);
  }

  function confirmReject() {
    if (!hasSelection || isPending) return;
    setRejectReason("");
    setRejectOpen(true);
  }

  function approveLeaveRequests() {
    if (!hasSelection || isPending) return;

    startTransition(async () => {
      const responses = await Promise.all(
        actionLeaveIds.map((id) => postLeaveAction(id, "approve", {})),
      );
      const response = responses.find((item) => !item.ok) ?? responses[0];

      if (!response?.ok) {
        setToast({
          title: "Approval failed",
          description: await readError(
            response,
            "Unable to approve leave request.",
          ),
          variant: "error",
        });
        return;
      }

      setApproveOpen(false);
      clearSelection();

      setToast({
        title: "Leave approved",
        description:
          selectedCount === 1
            ? "The leave request was approved."
            : `${selectedCount} leave requests were approved.`,
        variant: "success",
      });

      router.refresh();
    });
  }

  function rejectLeaveRequests() {
    if (!hasSelection || isPending) return;

    startTransition(async () => {
      const responses = await Promise.all(
        actionLeaveIds.map((id) =>
          postLeaveAction(id, "reject", { reason: rejectReason }),
        ),
      );
      const response = responses.find((item) => !item.ok) ?? responses[0];

      if (!response?.ok) {
        setToast({
          title: "Rejection failed",
          description: await readError(
            response,
            "Unable to reject leave request.",
          ),
          variant: "error",
        });
        return;
      }

      setRejectOpen(false);
      clearSelection();

      setToast({
        title: "Leave rejected",
        description:
          selectedCount === 1
            ? "The leave request was rejected."
            : `${selectedCount} leave requests were rejected.`,
        variant: "success",
      });

      router.refresh();
    });
  }

const items: CommandBarItem[] = [
  {
    key: "back",
    label: "",
    icon: ArrowLeft,
    href: context === "detail" ? "/leaves" : "",
    tooltip: "Back",
  },

  {
    key: "new",
    label: "New",
    icon: Plus,
    href: "/leaves/new",
    hidden: !canCreateLeave,
  },

  {
    key: "delete-selected",
    label: "Delete",
    icon: Trash2,
    danger: true,
    hidden: !canDeleteLeave,
    disabled: !hasSelection || isPending,
    requiresSelection: context === "list",
  },

  {
    key: "assign",
    label: "Assign",
    icon: UserRoundCheck,
    hidden: !canAssignLeave,
    disabled: !hasSelection || isPending,
    requiresSelection: context === "list",
  },

  {
    key: "approve",
    label: "Approve",
    icon: CheckCircle2,
    hidden: !canApproveLeave,
    disabled: !hasSelection || isPending,
    requiresSelection: context === "list",
    onClick: confirmApprove,
  },

  {
    key: "reject",
    label: "Reject",
    icon: XCircle,
    danger: true,
    hidden: !canRejectLeave,
    disabled: !hasSelection || isPending,
    requiresSelection: context === "list",
    onClick: confirmReject,
  },

  {
    key: "share",
    label: "Share",
    icon: Share2,
    hidden: !canShareLeave,
    disabled: !hasSelection || isPending,
    requiresSelection: context === "list",
  },

  {
    key: "data",
    label: "Data",
    icon: Download,
    hidden: !canExportLeave && !canImportLeave,
    actions: [
      {
        key: "export",
        label: "Export",
        icon: FileDown,
        hidden: !canExportLeave,
        disabled: isPending,
        href: "/api/leave-requests/export",
      },

      {
        key: "export-template",
        label: "Export template",
        icon: Download,
        hidden: !canExportLeave || context === "detail",
        disabled: isPending,
        href: "/api/leave-requests/export-template",
      },

      {
        key: "import",
        label: "Import",
        icon: FileUp,
        href: "/leaves/import",
        hidden: !canImportLeave || context === "detail",
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
        title={
          context === "detail"
            ? leaveRequestCode ?? "Leave Request"
            : "Leave Requests"
        }
        subtitle={
          pendingApprovals > 0
            ? `${pendingApprovals} pending approval${pendingApprovals === 1 ? "" : "s"} require action.`
            : "Manage leave requests, approvals, rejections, and request tracking."
        }
        selectedCount={selectedCount}
        selectedIds={actionLeaveIds}
        items={items}
      />

      <ConfirmationDialog
        cancelLabel="Cancel"
        confirmLabel="Approve"
        description={
          selectedCount === 1
            ? "This will approve the selected leave request and move it to the next workflow state."
            : `This will approve ${selectedCount} selected leave requests and move them to the next workflow state.`
        }
        isLoading={isPending}
        isOpen={approveOpen}
        onCancel={() => setApproveOpen(false)}
        onConfirm={approveLeaveRequests}
        title={
          selectedCount === 1
            ? "Approve this leave request?"
            : `Approve ${selectedCount} leave requests?`
        }
        variant="success"
      />

      {rejectOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
        >
          <div className="w-full max-w-md rounded-[28px] border border-border bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-foreground">
              {selectedCount === 1
                ? "Reject this leave request?"
                : `Reject ${selectedCount} leave requests?`}
            </h3>

            <p className="mt-2 text-sm leading-6 text-muted">
              Add a rejection reason. This should be visible in the request
              audit trail and employee-facing status history.
            </p>

            <div className="mt-4">
              <label className="text-sm font-medium text-foreground">
                Rejection reason
              </label>
              <textarea
                className="mt-2 min-h-28 w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent"
                placeholder="Enter reason"
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
              />
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                className="rounded-2xl border border-border bg-white px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isPending}
                onClick={() => setRejectOpen(false)}
                type="button"
              >
                Cancel
              </button>

              <button
                className="rounded-2xl bg-rose-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isPending || !rejectReason.trim()}
                onClick={rejectLeaveRequests}
                type="button"
              >
                {isPending ? "Please wait..." : "Reject"}
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
