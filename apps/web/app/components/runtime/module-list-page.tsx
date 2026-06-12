"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  groupCommands,
  resolveCommandsForSurface,
} from "@/lib/runtime/command-runtime.resolver";
import type { ModuleRuntimeContext } from "@/lib/runtime/module-runtime.types";
import type { ModuleDataAdapter } from "@/lib/runtime/module-data-adapter.types";
import type { ViewMetadata } from "@/lib/runtime/metadata-runtime.types";
import { ModuleListShell } from "./module-list-shell";
import { ModuleRefreshOverlay } from "./module-refresh-overlay";
import { ModuleRuntimeCommandHandler } from "./module-runtime-command-handler";
import { ModuleRuntimeProvider } from "./module-runtime-provider";
import { TenantRuntimeStyleProvider } from "./tenant-runtime-style-provider";

export function ModuleListPage({
  activeView,
  dataAdapter,
  listRecords = [],
  moduleKey,
  onActiveViewChange,
  onSelectionReset,
  selectedRecordIds: controlledSelectedRecordIds,
  tableSlot,
  title,
  runtime,
  commandRecord,
}: {
  readonly activeView?: ViewMetadata | null;
  readonly dataAdapter?: ModuleDataAdapter;
  readonly listRecords?: readonly Readonly<Record<string, unknown>>[];
  readonly moduleKey: string;
  readonly onActiveViewChange?: (view: ViewMetadata) => void;
  readonly onSelectionReset?: () => void;
  readonly selectedRecordIds?: readonly string[];
  readonly tableSlot?: ReactNode;
  readonly title?: string;
  readonly runtime: ModuleRuntimeContext;
  readonly commandRecord?: Readonly<Record<string, unknown>>;
}) {
  void moduleKey;
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [internalSelectedRecordIds, setInternalSelectedRecordIds] = useState<
    string[]
  >([]);
  const selectedRecordIds =
    controlledSelectedRecordIds ?? internalSelectedRecordIds;
  const [activeViewId, setActiveViewId] = useState(
    activeView?.viewId ?? activeView?.id ?? "",
  );
  const publishedViews = useMemo(
    () =>
      runtime.metadata.views.filter(
        (view) =>
          view.isPublished !== false &&
          (view.lifecycleState === "published" ||
            view.lifecycleState === "deprecated"),
      ),
    [runtime.metadata.views],
  );
  const resolvedActiveView = useMemo(
    () =>
      publishedViews.find(
        (view) => (view.viewId ?? view.id) === activeViewId,
      ) ??
      activeView ??
      publishedViews.find((view) => view.isDefault) ??
      publishedViews[0] ??
      null,
    [activeView, activeViewId, publishedViews],
  );
  const requestedViewId = searchParams.get("viewId");

  useEffect(() => {
    if (
      requestedViewId &&
      publishedViews.some(
        (view) => (view.viewId ?? view.id) === requestedViewId,
      ) &&
      !searchParams.has("view")
    ) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    const fallbackView =
      publishedViews.find((view) => view.isDefault) ??
      publishedViews[0] ??
      null;
    const fallbackViewId = fallbackView?.viewId ?? fallbackView?.id;

    params.delete("view");
    if (fallbackViewId) {
      params.set("viewId", fallbackViewId);
    } else {
      params.delete("viewId");
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }, [pathname, publishedViews, requestedViewId, router, searchParams]);
  const listCommands = resolveCommandsForSurface(
    runtime.metadata.commands,
    "list",
    {
      principal: runtime.security.principal,
      record: commandRecord,
      selectedRecordIds,
    },
  );
  const commandGroups = groupCommands(listCommands, {
    primaryCommandKeys: [
      "system.new",
      "system.refresh",
      "selection.assignOwner",
    ],
  });

  function handleViewChange(viewId: string) {
    const nextView = publishedViews.find(
      (view) => (view.viewId ?? view.id) === viewId,
    );

    if (!nextView) return;

    setActiveViewId(nextView.viewId ?? nextView.id);
    setInternalSelectedRecordIds([]);
    onActiveViewChange?.(nextView);
    onSelectionReset?.();
    updateViewUrl(nextView);
  }

  function updateViewUrl(view: ViewMetadata) {
    const params = new URLSearchParams(searchParams.toString());
    const viewId = view.viewId ?? view.id;

    params.delete("view");

    if (viewId) {
      params.set("viewId", viewId);
    } else {
      params.delete("viewId");
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  return (
    <TenantRuntimeStyleProvider tenant={runtime.tenant}>
      <ModuleRuntimeProvider activeView={resolvedActiveView} runtime={runtime}>
        <ModuleRuntimeCommandHandler
          activeView={resolvedActiveView}
          dataAdapter={dataAdapter}
          listRecords={listRecords}
          runtime={runtime}
        >
          {({ isRefreshing, lastResult, onCommand }) => (
            <>
              <ModuleRefreshOverlay active={isRefreshing} />
              <ModuleListShell
                activeViewId={
                  resolvedActiveView?.viewId ?? resolvedActiveView?.id
                }
                commands={commandGroups}
                error={
                  lastResult?.status === "failure" ? lastResult.message : null
                }
                loading={isRefreshing}
                onCommand={onCommand}
                onViewChange={handleViewChange}
                record={commandRecord}
                runtime={runtime}
                selectedRecordIds={selectedRecordIds}
                tableSlot={tableSlot}
                title={title ?? runtime.module.label}
              />
            </>
          )}
        </ModuleRuntimeCommandHandler>
      </ModuleRuntimeProvider>
    </TenantRuntimeStyleProvider>
  );
}
