import {
  ArrowLeft,
  Download,
  FileDown,
  FileUp,
  Pencil,
  Plus,
  Share2,
  Trash2,
  UserRoundCheck,
} from "lucide-react";
import { CommandBarItem } from "./types";

type DefaultCommandItemsConfig = {
  backHref?: string;
  newHref?: string;
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canShare?: boolean;
  canAssign?: boolean;
  canImport?: boolean;
  canExport?: boolean;
  onEdit?: () => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  onShare?: () => void | Promise<void>;
  onAssign?: () => void | Promise<void>;
  onExport?: () => void | Promise<void>;
  onExportTemplate?: () => void | Promise<void>;
  onImport?: () => void | Promise<void>;
  customItems?: CommandBarItem[];
};

export function buildDefaultCommandItems({
  backHref,
  newHref,
  canCreate = true,
  canEdit = true,
  canDelete = true,
  canShare = true,
  canAssign = true,
  canImport = true,
  canExport = true,
  onEdit,
  onDelete,
  onShare,
  onAssign,
  onExport,
  onExportTemplate,
  onImport,
  customItems = [],
}: DefaultCommandItemsConfig): CommandBarItem[] {
  return [
    {
      key: "back",
      label: "",
      icon: ArrowLeft,
      href: backHref,
      tooltip: "Back",
      hidden: !backHref,
    },
    {
      key: "new",
      label: "New",
      icon: Plus,
      href: newHref,
      hidden: !canCreate || !newHref,
    },
    {
      key: "edit",
      label: "Edit",
      icon: Pencil,
      hidden: !canEdit,
      requiresSelection: true,
      onClick: onEdit,
    },
    {
      key: "delete",
      label: "Delete",
      icon: Trash2,
      danger: true,
      hidden: !canDelete,
      requiresSelection: true,
      onClick: onDelete,
      confirm: {
        title: "Delete selected record(s)",
        message:
          "The selected record(s) will be deleted. This action cannot be undone.",
        confirmLabel: "Delete",
      },
    },
    {
      key: "share",
      label: "Share",
      icon: Share2,
      hidden: !canShare,
      requiresSelection: true,
      onClick: onShare,
    },
    {
      key: "assign",
      label: "Assign",
      icon: UserRoundCheck,
      hidden: !canAssign,
      requiresSelection: true,
      onClick: onAssign,
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
          onClick: onExport,
        },
        {
          key: "export-template",
          label: "Export template",
          icon: Download,
          hidden: !canExport,
          onClick: onExportTemplate,
        },
        {
          key: "import",
          label: "Import",
          icon: FileUp,
          hidden: !canImport,
          onClick: onImport,
        },
      ],
    },
    ...customItems,
  ];
}