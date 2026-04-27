"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import {
  Briefcase,
  Building2,
  ChevronRight,
  FileText,
  LayoutDashboard,
  ShieldCheck,
  Users,
} from "lucide-react";
import { TenantLogo } from "@/app/components/branding/tenant-logo";
import { resolveVisibleDashboardNavItems } from "./navigation";

type DashboardSidebarProps = {
  brandLogoUrl?: string | null;
  brandName?: string | null;
  brandTagline?: string | null;
  enabledFeatureKeys: string[] | null;
  isReportingManager: boolean;
  isSelfService: boolean;
  permissionKeys: string[];
  roleKeys?: string[];
  tenantId: string;
  tenantName?: string;
};

const navIcons: Record<string, ComponentType<{ className?: string }>> = {
  "/dashboard": LayoutDashboard,
  "/dashboard/employees": Users,
  "/dashboard/leave": FileText,
  "/dashboard/attendance": Briefcase,
  "/dashboard/timesheets": Briefcase,
  "/dashboard/settings": ShieldCheck,
};

export function DashboardSidebar({
  brandLogoUrl,
  brandName,
  brandTagline,
  enabledFeatureKeys,
  isReportingManager,
  isSelfService,
  permissionKeys,
  roleKeys,
  tenantId,
  tenantName,
}: DashboardSidebarProps) {
  const pathname = usePathname();

  const visibleItems = resolveVisibleDashboardNavItems({
    enabledFeatureKeys,
    isReportingManager,
    isSelfService,
    permissionKeys,
    roleKeys,
  });

  return (
    <aside className="flex h-full min-h-0 flex-col rounded-[24px] border border-border/70 bg-white/95 p-3 shadow-[0_10px_30px_rgba(15,23,42,0.05)] backdrop-blur md:p-4 xl:rounded-[28px] xl:p-5">
      <div className="hidden xl:block">
        <SidebarBrand
          brandLogoUrl={brandLogoUrl}
          brandName={brandName}
          brandTagline={brandTagline}
        />
      </div>

      <div className="xl:hidden">
        <CompactBrand brandLogoUrl={brandLogoUrl} brandName={brandName} />
      </div>

      <nav className="mt-4 xl:mt-8">
        <div className="flex gap-2 overflow-x-auto pb-1 xl:grid xl:grid-cols-1 xl:gap-2 xl:overflow-visible xl:pb-0">
          {visibleItems.map((item) => {
            const isActive = isSidebarItemActive(pathname, item.href);
            const Icon = navIcons[item.href] ?? Briefcase;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group relative min-w-[180px] shrink-0 rounded-2xl border px-3 py-3 transition-all sm:min-w-[200px] xl:min-w-0 ${
                  isActive
                    ? "border-accent/20 bg-accent/10 text-foreground shadow-sm"
                    : "border-transparent bg-transparent text-foreground hover:border-border/80 hover:bg-muted/20"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition ${
                      isActive
                        ? "bg-accent text-white"
                        : "bg-accent/5 text-muted-foreground group-hover:bg-white group-hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold">
                        {item.label}
                      </p>
                      <ChevronRight
                        className={`h-4 w-4 shrink-0 transition xl:opacity-100 ${
                          isActive
                            ? "text-accent"
                            : "text-muted group-hover:translate-x-0.5"
                        }`}
                      />
                    </div>
                  </div>
                </div>

                {isActive ? (
                  <span className="absolute inset-y-3 left-0 hidden w-1 rounded-r-full bg-accent xl:block" />
                ) : null}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="mt-4 xl:mt-auto xl:pt-6">
        <TenantCard tenantId={tenantId} tenantName={tenantName} />
      </div>
    </aside>
  );
}

function SidebarBrand({
  brandLogoUrl,
  brandName,
  brandTagline,
}: {
  brandLogoUrl?: string | null;
  brandName?: string | null;
  brandTagline?: string | null;
}) {
  const effectiveBrandName =
    typeof brandName === "string" && brandName.trim().length > 0
      ? brandName.trim()
      : "DijiPeople";

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <TenantLogo
          className="h-11 w-11"
          logoUrl={brandLogoUrl}
          name={effectiveBrandName}
          sizeClassName="h-11 w-11"
        />

        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            {effectiveBrandName}
          </p>
          <h1 className="truncate text-lg font-semibold text-foreground">
            Workspace
          </h1>
        </div>
      </div>

      <p className="text-sm leading-6 text-muted">
        {brandTagline?.trim()
          ? brandTagline
          : "Manage your people operations from one place."}
      </p>
    </div>
  );
}

function CompactBrand({
  brandLogoUrl,
  brandName,
}: {
  brandLogoUrl?: string | null;
  brandName?: string | null;
}) {
  const effectiveBrandName =
    typeof brandName === "string" && brandName.trim().length > 0
      ? brandName.trim()
      : "DijiPeople";

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-muted/20 px-3 py-3">
      <TenantLogo
        className="h-10 w-10 shrink-0"
        logoUrl={brandLogoUrl}
        name={effectiveBrandName}
        sizeClassName="h-10 w-10"
      />

      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
          {effectiveBrandName}
        </p>
        <h1 className="truncate text-base font-semibold text-foreground">
          Workspace
        </h1>
      </div>
    </div>
  );
}

function TenantCard({
  tenantId,
  tenantName,
}: {
  tenantId: string;
  tenantName?: string;
}) {
  return (
    <div className="rounded-[22px] border border-border/70 bg-surface/25 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-foreground shadow-sm">
          <Building2 className="h-4 w-4" />
        </div>

        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            Active Tenant
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-foreground">
            {tenantName?.trim() ? tenantName : "Tenant workspace"}
          </p>
          <p className="mt-1 truncate text-xs text-muted">
            ID: {tenantId}
          </p>
        </div>
      </div>
    </div>
  );
}

function isSidebarItemActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
