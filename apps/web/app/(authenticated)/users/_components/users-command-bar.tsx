"use client";

import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  FileDown,
  KeyRound,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Trash2,
  UserRoundX,
} from "lucide-react";
import { CommandBar } from "@/app/components/command-bar/command-bar";
import { CommandBarItem } from "@/app/components/command-bar/types";
import { USER_CREATE_ROUTE } from "../_lib/user-routes";

type UsersCommandBarProps = {
  canCreate: boolean;
  canDelete?: boolean;
  canAssignRoles?: boolean;
  canExport?: boolean;
  canDisable?: boolean;
  canResetPassword?: boolean;
};

export function UsersCommandBar({
  canCreate,
  canDelete = false,
  canAssignRoles = false,
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
      href: "/",
      tooltip: "Back",
    },
    {
      key: "new",
      label: "New",
      icon: Plus,
      /* BUG-2014 — "/users/new" has no page; the settings runtime owns the
         only user-create screen in the product. See _lib/user-routes.ts. */
      href: USER_CREATE_ROUTE,
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
      /* BUG-2014 — the Import action linked to "/users/import", which has no
         page anywhere in this app. It was removed, along with the `canImport`
         prop that gated it, rather than pointed at another route that does
         not exist. Rebuild both together if a users import screen is added. */
      hidden: !canExport,
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