"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import {
  Briefcase,
  Building2,
  CalendarDays,
  ClipboardList,
  Clock3,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Layers,
  Settings,
  ShieldCheck,
  User,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";

import { DEFAULT_BRANDING_VALUES } from "@/app/components/branding/branding-defaults";
import { TenantLogo } from "@/app/components/branding/tenant-logo";
import { BusinessUnitAccessSummary } from "../_lib/business-unit-access";
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
  businessUnitAccess?: BusinessUnitAccessSummary | null;
  tenantId: string;
  tenantName?: string;
};

type SidebarNavIconProps = {
  className?: string;
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
  businessUnitAccess,
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
    businessUnitAccess,
  });

  return (
    <aside
      aria-label="Dashboard navigation"
      className="dp-theme-scope dp-sidebar-scope flex h-full min-h-0 flex-col rounded-[24px] border border-border/70 bg-surface/80 p-2 shadow-[0_10px_30px_rgba(15,23,42,0.05)] backdrop-blur xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)]"
    >
      <div className="hidden px-2 pt-2 xl:block">
        <SidebarBrand
          brandLogoUrl={brandLogoUrl}
          brandName={brandName}
          brandTagline={brandTagline}
        />
      </div>

      <div className="xl:hidden">
        <CompactBrand brandLogoUrl={brandLogoUrl} brandName={brandName} />
      </div>

      <div className="mt-3 min-h-0 flex-1 xl:mt-6">
        <nav className="h-full" aria-label="Main menu">
          {visibleItems.length > 0 ? (
            <div className="flex h-full flex-col gap-1.5 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {visibleItems.map((item) => {
                const isActive = isSidebarItemActive(pathname, item.href);
                const Icon = resolveNavIcon(item.href);

                return (
                  <SidebarNavItem
                    key={item.href}
                    href={item.href}
                    icon={Icon}
                    isActive={isActive}
                    label={item.label}
                  />
                );
              })}
            </div>
          ) : (
            <SidebarEmptyState />
          )}
        </nav>
      </div>

      <div className="mt-3 hidden px-0 xl:block">
        <TenantCard tenantId={tenantId} tenantName={tenantName} />
      </div>
    </aside>
  );
}

function SidebarNavItem({
  href,
  icon: Icon,
  isActive,
  label,
}: {
  href: string;
  icon: ComponentType<SidebarNavIconProps>;
  isActive: boolean;
  label: string;
}) {
  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      href={href}
      title={label}
      className={[
        "group relative flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left outline-none transition-all",
        "focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20",
        isActive
          ? "border-accent/30 bg-[color-mix(in_oklab,var(--dp-accent)_14%,white)] text-foreground shadow-sm"
          : "border-transparent bg-transparent text-foreground hover:border-border/80 hover:bg-muted/30",
      ].join(" ")}
    >
      {isActive ? (
        <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-accent" />
      ) : null}

      <span
        className={[
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition",
          isActive
            ? "bg-accent text-white"
            : "bg-[color-mix(in_oklab,var(--dp-accent)_9%,white)] text-muted-foreground group-hover:bg-white group-hover:text-foreground",
        ].join(" ")}
      >
        <Icon className="h-4 w-4" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{label}</span>
      </span>
    </Link>
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
  const effectiveBrandName = resolveText(
    brandName,
    DEFAULT_BRANDING_VALUES.brandName,
  );

  const effectiveTagline = resolveText(
    brandTagline,
    DEFAULT_BRANDING_VALUES.portalTagline,
  );

  return (
    <div className="rounded-[22px] border border-border/60 bg-white/55 p-3">
      <div className="flex items-center gap-3">
        <TenantLogo
          className="h-11 w-11 shrink-0"
          logoUrl={brandLogoUrl}
          name={effectiveBrandName}
          sizeClassName="h-11 w-11"
        />

        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            {effectiveBrandName}
          </p>
          <h1 className="truncate text-lg font-semibold text-foreground">
            Workspace
          </h1>
        </div>
      </div>

      <p className="mt-4 line-clamp-2 text-sm leading-6 text-muted">
        {effectiveTagline}
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
  const effectiveBrandName = resolveText(
    brandName,
    DEFAULT_BRANDING_VALUES.brandName,
  );

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-white/60 px-3 py-3">
      <TenantLogo
        className="h-10 w-10 shrink-0"
        logoUrl={brandLogoUrl}
        name={effectiveBrandName}
        sizeClassName="h-10 w-10"
      />

      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
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
  const displayName = resolveText(tenantName, "Tenant workspace");

  return (
    <div className="rounded-[22px] border border-border/70 bg-white/55 p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-surface text-foreground shadow-sm">
          <Building2 className="h-4 w-4" />
        </div>

        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            Active tenant
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-foreground">
            {displayName}
          </p>
          <p className="mt-1 truncate text-xs text-muted" title={tenantId}>
            ID: {tenantId}
          </p>
        </div>
      </div>
    </div>
  );
}

function SidebarEmptyState() {
  return (
    <div className="rounded-[22px] border border-dashed border-border bg-white/50 p-4">
      <p className="text-sm font-semibold text-foreground">
        No modules available
      </p>
      <p className="mt-2 text-sm leading-6 text-muted">
        Your current role does not have access to any enabled dashboard modules.
      </p>
    </div>
  );
}

function resolveNavIcon(href: string): ComponentType<SidebarNavIconProps> {
  if (href === "/dashboard") return LayoutDashboard;

  if (href.includes("/employees")) return Users;
  if (href.includes("/profile")) return User;
  if (href.includes("/leave")) return CalendarDays;
  if (href.includes("/attendance")) return Clock3;
  if (href.includes("/timesheets")) return ClipboardList;
  if (href.includes("/projects")) return FolderKanban;
  if (href.includes("/payroll")) return Wallet;
  if (href.includes("/documents")) return FileText;
  if (href.includes("/organization")) return Building2;
  if (href.includes("/roles")) return ShieldCheck;
  if (href.includes("/users")) return UserCog;
  if (href.includes("/settings")) return Settings;
  if (href.includes("/customization")) return Layers;
  if (href.includes("/module-views")) return Layers;

  return Briefcase;
}

function resolveText(value: string | null | undefined, fallback: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.length > 0 ? normalized : fallback;
}

function isSidebarItemActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}