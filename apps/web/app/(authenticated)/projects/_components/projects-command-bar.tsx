"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  FileDown,
  FileUp,
  Pencil,
  Plus,
  RefreshCcw,
  Share2,
  Trash2,
  UserRoundCheck,
} from "lucide-react";
import { CommandBar } from "@/app/components/command-bar/command-bar";
import { CommandBarItem } from "@/app/components/command-bar/types";

type ProjectsCommandBarProps = {
  canCreateProject?: boolean;
  canEditProject?: boolean;
  canDeleteProject?: boolean;
  canShareProject?: boolean;
  canAssignProject?: boolean;
  canImportProject?: boolean;
  canExportProject?: boolean;
  context?: "list" | "detail";
  projectId?: string;
  projectCode?: string;
};

type ProjectsSelectionChangedEventDetail = {
  ids?: string[];
  count?: number;
};

export function ProjectsCommandBar({
  canCreateProject = false,
  canEditProject = false,
  canDeleteProject = false,
  canShareProject = false,
  canAssignProject = false,
  canImportProject = false,
  canExportProject = false,
  context = "list",
  projectId,
  projectCode,
}: ProjectsCommandBarProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const actionProjectIds = useMemo(
    () => (context === "detail" && projectId ? [projectId] : selectedIds),
    [context, projectId, selectedIds],
  );

  const selectedCount = actionProjectIds.length;
  const hasSelection = selectedCount > 0;

  useEffect(() => {
    if (context !== "list") return;

    function handleSelectionChanged(event: Event) {
      const customEvent =
        event as CustomEvent<ProjectsSelectionChangedEventDetail>;

      setSelectedIds(customEvent.detail?.ids ?? []);
    }

    window.addEventListener(
      "projects:selected-ids-changed",
      handleSelectionChanged,
    );

    return () => {
      window.removeEventListener(
        "projects:selected-ids-changed",
        handleSelectionChanged,
      );
    };
  }, [context]);

  const selectedProjectId = actionProjectIds[0];

  const items: CommandBarItem[] = [
    {
      key: "back",
      label: "",
      icon: ArrowLeft,
      href: context === "detail" ? "/projects" : "",
      tooltip: "Back",
      hidden: context !== "detail",
    },

    {
      key: "new",
      label: "New",
      icon: Plus,
      href: "/projects/new",
      hidden: !canCreateProject,
    },

    {
      key: "edit",
      label: "Edit",
      icon: Pencil,
      href:
        selectedProjectId && (context === "detail" || selectedCount === 1)
          ? `/projects/${selectedProjectId}/edit`
          : "",
      hidden: !canEditProject,
      disabled: !selectedProjectId || selectedCount !== 1,
      requiresSelection: context === "list",
    },

    {
      key: "delete",
      label: "Delete",
      icon: Trash2,
      danger: true,
      hidden: !canDeleteProject,
      disabled: !hasSelection,
      requiresSelection: context === "list",
    },

    {
      key: "assign",
      label: "Assign",
      icon: UserRoundCheck,
      hidden: !canAssignProject,
      disabled: !hasSelection,
      requiresSelection: context === "list",
    },

    {
      key: "share",
      label: "Share",
      icon: Share2,
      hidden: !canShareProject,
      disabled: !hasSelection,
      requiresSelection: context === "list",
    },

    {
      key: "data",
      label: "Data",
      icon: Download,
      hidden: !canExportProject && !canImportProject,
      actions: [
        {
          key: "export",
          label: "Export",
          icon: FileDown,
          hidden: !canExportProject,
          href: "/api/projects/export",
        },
        {
          key: "export-template",
          label: "Export template",
          icon: Download,
          hidden: !canExportProject || context === "detail",
          href: "/api/projects/export-template",
        },
        {
          key: "import",
          label: "Import",
          icon: FileUp,
          href: "/projects/import",
          hidden: !canImportProject || context === "detail",
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
      title={context === "detail" ? projectCode ?? "Project" : "Projects"}
      subtitle={
        context === "detail"
          ? "Manage project details, assignments, and delivery information."
          : "Manage project catalog, assignments, and delivery tracking."
      }
      selectedCount={selectedCount}
      selectedIds={actionProjectIds}
      items={items}
    />
  );
}