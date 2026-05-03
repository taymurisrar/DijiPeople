"use client";

import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  FileDown,
  FileUp,
  KeyRound,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Trash2,
  UserRoundX,
} from "lucide-react";
import { CommandBar } from "@/app/components/command-bar/command-bar";
import { CommandBarItem } from "@/app/components/command-bar/types";

type UsersCommandBarProps = {
  canCreate: boolean;
  canDelete?: boolean;
  canAssignRoles?: boolean;
  canImport?: boolean;
  canExport?: boolean;
  canDisable?: boolean;
  canResetPassword?: boolean;
};

export function UsersCommandBar({
  canCreate,
  canDelete = false,
  canAssignRoles = false,
  canImport = false,
  canExport = false,
  canDisable = false,
  canResetPassword = false,
}: UsersCommandBarProps) {
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
      href: "/dashboard/users/new",
      hidden: !canCreate,
    },
    {
      key: "delete-selected",
      label: "Delete",
      icon: Trash2,
      danger: true,
      hidden: !canDelete,
      requiresSelection: true,
      confirm: {
        title: "Delete selected users",
        message:
          "Selected user accounts will be deleted. This can affect login access, audit ownership, approvals, and related assignments. This action cannot be undone.",
        confirmLabel: "Delete",
      },
    },
    {
      key: "assign-roles",
      label: "Assign roles",
      icon: ShieldCheck,
      hidden: !canAssignRoles,
      requiresSelection: true,
    },
    {
      key: "disable",
      label: "Disable",
      icon: UserRoundX,
      danger: true,
      hidden: !canDisable,
      requiresSelection: true,
      confirm: {
        title: "Disable selected users",
        message:
          "Selected users will no longer be able to sign in. Existing business records will remain intact.",
        confirmLabel: "Disable",
      },
    },
    {
      key: "reset-password",
      label: "Reset password",
      icon: KeyRound,
      hidden: !canResetPassword,
      requiresSelection: true,
      confirm: {
        title: "Reset password",
        message:
          "A password reset action will be started for the selected user accounts.",
        confirmLabel: "Reset",
      },
    },
    {
      key: "data",
      label: "Data",
      icon: Download,
      hidden: !canExport && !canImport,
      actions: [
        {
          key: "export",
          label: "Export",
          icon: FileDown,
          hidden: !canExport,
        },
        {
          key: "export-template",
          label: "Export template",
          icon: Download,
          hidden: !canExport,
        },
        {
          key: "import",
          label: "Import",
          icon: FileUp,
          href: "/dashboard/users/import",
          hidden: !canImport,
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
      title="Users"
      subtitle="Manage user access, roles, login status, imports, and exports."
      selectedCount={0}
      items={items}
    />
  );
}