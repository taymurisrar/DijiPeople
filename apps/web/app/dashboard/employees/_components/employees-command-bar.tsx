"use client";

import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  FileDown,
  FileUp,
  Plus,
  RefreshCcw,
  Share2,
  Trash2,
  UserRoundCheck,
} from "lucide-react";
import { CommandBar } from "@/app/components/command-bar/command-bar";
import { CommandBarItem } from "@/app/components/command-bar/types";

type EmployeesCommandBarProps = {
  canCreateEmployee: boolean;
  canDeleteEmployee?: boolean;
  canShareEmployee?: boolean;
  canAssignEmployee?: boolean;
  canImportEmployee?: boolean;
  canExportEmployee?: boolean;
};

export function EmployeesCommandBar({
  canCreateEmployee,
  canDeleteEmployee = false,
  canShareEmployee = false,
  canAssignEmployee = false,
  canImportEmployee = false,
  canExportEmployee = false,
}: EmployeesCommandBarProps) {
  const router = useRouter();

  const items: CommandBarItem[] = [
    {
      key: "back",
      label: "",
      icon: ArrowLeft,
      href: "/dashboard",
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
      requiresSelection: true,
      confirm: {
        title: "Delete selected employees",
        message:
          "Selected employee records will be deleted. This action cannot be undone.",
        confirmLabel: "Delete",
      },
    },
    {
      key: "share",
      label: "Share",
      icon: Share2,
      hidden: !canShareEmployee,
      requiresSelection: true,
    },
    {
      key: "assign",
      label: "Assign",
      icon: UserRoundCheck,
      hidden: !canAssignEmployee,
      requiresSelection: true,
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
        },
        {
          key: "export-template",
          label: "Export template",
          icon: Download,
          hidden: !canExportEmployee,
        },
        {
          key: "import",
          label: "Import",
          icon: FileUp,
          href: "/dashboard/employees/import",
          hidden: !canImportEmployee,
        },
      ],
    },
    {
      key: "refresh",
      label: "Refresh",
      icon: RefreshCcw,
      onClick: () => router.refresh(),
    },
  ];

  return (
    <CommandBar
      variant="list"
      title="Employees"
      subtitle="Manage employee records, assignments, imports, and exports."
      selectedCount={0}
      items={items}
    />
  );
}