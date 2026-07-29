"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";
import { SettingsLayout } from "@/app/components/settings";
import { getSettingsRuntimeItemByPath } from "../_lib/settings-runtime";
import { SettingsRuntimeNav } from "./settings-runtime-nav";

type SettingsShellProps = {
  children: ReactNode;
  title: string;
  description: string;
  eyebrow?: string;
  actions?: ReactNode;
  showHeader?: boolean;
  showSidebar?: boolean;
};

export function SettingsShell({
  children,
  title,
  description,
  eyebrow = "Tenant Settings",
  actions,
  showHeader,
  showSidebar = true,
}: SettingsShellProps) {
  const pathname = usePathname();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const currentMatch = getSettingsRuntimeItemByPath(pathname);
  const resolvedEyebrow = currentMatch?.categoryLabel ?? eyebrow;

  const breadcrumb = currentMatch ? (
    <>
      <span>Settings</span>
      <span className="text-muted">/</span>
      <span>{currentMatch.categoryLabel}</span>
      <span className="text-muted">/</span>
      <span>{currentMatch.groupLabel}</span>
      <span className="text-muted">/</span>
      <span className="text-foreground">{currentMatch.label}</span>
    </>
  ) : null;

  return (
    <SettingsLayout
      breadcrumb={breadcrumb}
      description={description}
      eyebrow={resolvedEyebrow}
      showHeader={showHeader ?? pathname.startsWith("/settings/customization")}
      title={title}
      sidebar={
        showSidebar ? (
          <aside
            className={[
              "space-y-6 transition-all duration-200",
              isSidebarCollapsed ? "w-[56px]" : "w-[260px]",
            ].join(" ")}
          >
            {!isSidebarCollapsed ? (
              <div className="relative rounded-[22px] border border-border/60 bg-white/55 p-4">
                <button
                  type="button"
                  onClick={() => setIsSidebarCollapsed(true)}
                  aria-label="Collapse settings sidebar"
                  title="Collapse settings sidebar"
                  className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border border-border/60 bg-white text-muted shadow-sm transition hover:bg-muted/30 hover:text-foreground"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>

                <div className="pr-8">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                    Tenant Settings
                  </p>

                  <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                    Configuration
                  </h2>

                  <p className="mt-3 text-xs leading-6 text-muted">
                    Manage tenant setup, access, policies, payroll,
                    customization, and governance from one structured
                    administration workspace.
                  </p>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed(false)}
                aria-label="Expand settings sidebar"
                title="Expand settings sidebar"
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/70 bg-white/70 text-muted shadow-sm transition hover:bg-muted/30 hover:text-foreground"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            )}

            <SettingsRuntimeNav
              currentPath={pathname}
              isCollapsed={isSidebarCollapsed}
            />
          </aside>
        ) : undefined
      }
    >
      {actions ? (
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          {actions}
        </div>
      ) : null}

      {children}
    </SettingsLayout>
  );
}
