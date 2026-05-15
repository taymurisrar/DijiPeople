"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  FileDown,
  FileUp,
  LogIn,
  LogOut,
  Plus,
  RefreshCcw,
  Share2,
  Trash2,
  UserRoundCheck,
} from "lucide-react";
import { CommandBar } from "@/app/components/command-bar/command-bar";
import { CommandBarItem } from "@/app/components/command-bar/types";

type AttendanceCommandBarProps = {
  canCreateAttendance?: boolean;
  canDeleteAttendance?: boolean;
  canShareAttendance?: boolean;
  canAssignAttendance?: boolean;
  canImportAttendance?: boolean;
  canExportAttendance?: boolean;
  canCheckIn?: boolean;
  canCheckOut?: boolean;
  checkInDisabled?: boolean;
  checkOutDisabled?: boolean;
  onCheckIn?: () => void;
  onCheckOut?: () => void;
  context?: "list" | "detail" | "new";
};

export function AttendanceCommandBar({
  canCreateAttendance = false,
  canDeleteAttendance = false,
  canShareAttendance = false,
  canAssignAttendance = false,
  canImportAttendance = false,
  canExportAttendance = false,
  canCheckIn = false,
  canCheckOut = false,
  checkInDisabled = false,
  checkOutDisabled = false,
  onCheckIn,
  onCheckOut,
  context = "list",
}: AttendanceCommandBarProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const items: CommandBarItem[] = [
    {
      key: "back",
      label: "",
      icon: ArrowLeft,
      href: context === "detail" ? "/attendance" : "",
      tooltip: "Back",
    },
    {
      key: "new",
      label: "New",
      icon: Plus,
      href: "/attendance/new",
      hidden: !canCreateAttendance || context === "new",
    },
    {
      key: "check-in",
      label: "Check In",
      icon: LogIn,
      hidden: !canCheckIn,
      disabled: checkInDisabled || isPending,
      onClick: onCheckIn,
    },
    {
      key: "check-out",
      label: "Check Out",
      icon: LogOut,
      hidden: !canCheckOut,
      disabled: checkOutDisabled || isPending,
      onClick: onCheckOut,
    },
    {
      key: "delete-selected",
      label: "Delete",
      icon: Trash2,
      danger: true,
      hidden: !canDeleteAttendance,
      disabled: true,
      requiresSelection: context === "list",
    },
    {
      key: "assign",
      label: "Assign",
      icon: UserRoundCheck,
      hidden: !canAssignAttendance,
      disabled: true,
      requiresSelection: context === "list",
    },
    {
      key: "share",
      label: "Share",
      icon: Share2,
      hidden: !canShareAttendance,
      disabled: true,
      requiresSelection: context === "list",
    },
    {
      key: "data",
      label: "Data",
      icon: Download,
      hidden: !canExportAttendance && !canImportAttendance,
      actions: [
        {
          key: "export",
          label: "Export",
          icon: FileDown,
          hidden: !canExportAttendance,
          disabled: isPending,
          href: "/api/attendance/export",
        },
        {
          key: "import",
          label: "Import",
          icon: FileUp,
          href: "/attendance/import",
          hidden: !canImportAttendance || context === "detail",
        },
      ],
    },
    {
      key: "refresh",
      label: "Refresh",
      icon: RefreshCcw,
      disabled: isPending,
      onClick: () => startTransition(() => router.refresh()),
    },
  ];

  return (
    <CommandBar
      variant="list"
      title="Attendance"
      subtitle={
        context === "new"
          ? "Record an attendance check-in or close an active session."
          : "Manage attendance records, assignments, imports, and exports."
      }
      selectedCount={0}
      selectedIds={[]}
      items={items}
    />
  );
}
