"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { ComponentType } from "react";
import {
  Briefcase,
  Building2,
  CalendarDays,
  ClipboardList,
  Clock3,
  Bell,
  ChevronLeft,
  ChevronRight,
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
import {
  resolveVisibleDashboardNavItems,
  type DashboardNavOverride,
} from "./navigation";
import type { VisibilityPlacement } from "@/lib/runtime/visibility-placement";
import { Button } from "@/app/components/ui/button";

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
  navOverrides?: readonly DashboardNavOverride[] | null;
  placement?: VisibilityPlacement | null;
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
  navOverrides,
  placement,
}: DashboardSidebarProps) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const visibleItems = resolveVisibleDashboardNavItems({
    enabledFeatureKeys,
    isReportingManager,
    isSelfService,
    permissionKeys,
    roleKeys,
    businessUnitAccess,
    overrides: navOverrides,
    placement,
  });

  return (
    <aside
      aria-label="Dashboard navigation"
      className={[
        /*
         * BUG-1668 — below `xl` this carried no width class at all, so the
         * flex item's width came from its content: full nav-item labels that
         * do not wrap, which measured 217px at every width under `xl` on a
         * populated tenant — 56% of a 390px screen, with the collapse
         * control unreachable there (see below) so nothing could shrink it.
         * `w-16` below `xl` fixes the same icon-only rail width the
         * collapsed desktop state already uses, rather than a new size.
         * `shrink-0` stops the flex item from being asked to shrink below
         * that regardless of sibling content width.
         */
        "dp-theme-scope dp-sidebar-scope flex h-[calc(100vh-2rem)] w-16 min-h-0 shrink-0 flex-col overflow-hidden rounded-[24px] border border-border/70 bg-surface/80 p-2 shadow-[0_10px_30px_rgba(15,23,42,0.05)] backdrop-blur transition-all xl:sticky xl:top-4",
        isCollapsed ? "xl:w-[76px]" : "xl:w-[280px]",
      ].join(" ")}
    >
      <div className="hidden px-2 pt-2 xl:block">
        {!isCollapsed ? (
          <SidebarBrand
            brandLogoUrl={brandLogoUrl}
            brandName={brandName}
            brandTagline={brandTagline}
            onToggleCollapse={() => setIsCollapsed(true)}
          />
        ) : (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setIsCollapsed(false)}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            leftIcon={<ChevronRight className="h-4 w-4" />}
          />
        )}
      </div>

      <div className="xl:hidden">
        <CompactBrand brandLogoUrl={brandLogoUrl} brandName={brandName} />
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-hidden xl:mt-6">
        <nav className="h-full" aria-label="Main menu">
          {visibleItems.length > 0 ? (
            <div className="flex max-h-full flex-col gap-1.5 overflow-y-auto pr-1 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                    isCollapsed={isCollapsed}
                  />
                );
              })}
            </div>
          ) : (
            <SidebarEmptyState />
          )}
        </nav>
      </div>

      {!isCollapsed ? (
        <div className="mt-3 hidden px-0 xl:block">
          <TenantCard tenantId={tenantId} tenantName={tenantName} />
        </div>
      ) : null}
    </aside>
  );
}

function SidebarNavItem({
  href,
  icon: Icon,
  isActive,
  label,
  isCollapsed,
}: {
  href: string;
  icon: ComponentType<SidebarNavIconProps>;
  isActive: boolean;
  label: string;
  isCollapsed: boolean;
}) {
  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      href={href}
      title={label}
      className={[
        "group relative flex w-full items-center rounded-2xl border px-2 py-1 text-left outline-none transition-all",
        "focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20",
        /*
         * BUG-1668 — the label span is `sr-only` (zero visual width) below
         * `xl` whenever `isCollapsed` is false, since `isCollapsed` cannot
         * become true there (its only toggle is `hidden ... xl:block`). Icon
         * stays centred with no reserved gap for invisible text until `xl`,
         * where a real label appears and the original spacing returns.
         */
        isCollapsed
          ? "justify-center gap-0"
          : "justify-center gap-0 xl:justify-normal xl:gap-3",
        isActive
          ? "border-accent/30 bg-[color-mix(in_oklab,var(--dp-accent)_14%,var(--dp-mix-base))] text-foreground shadow-sm"
          : "border-transparent bg-transparent text-foreground hover:border-border/80 hover:bg-muted/30",
      ].join(" ")}
    >
      {isActive ? (
        <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-accent" />
      ) : null}

      <span
        className={[
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition",
          isActive
            ? "bg-accent text-white"
            : "bg-[color-mix(in_oklab,var(--dp-accent)_9%,var(--dp-mix-base))] text-muted-foreground group-hover:bg-surface-strong group-hover:text-foreground",
        ].join(" ")}
      >
        <Icon className="h-3 w-3" />
      </span>

      {!isCollapsed ? (
        /*
         * BUG-1668 — visually hidden rather than unrendered below `xl`: the
         * label text is what forced this row past the icon-only rail width
         * fixed on the `<aside>` above (`w-16` cannot contain unwrapped
         * label text), and the collapse control that would otherwise let a
         * user choose this is `hidden ... xl:block` and unreachable below
         * `xl` regardless. `sr-only` keeps the label in the link's
         * accessible name rather than depending on `title`, which is not
         * reliably exposed by every screen reader.
         */
        <span className="sr-only min-w-0 flex-1 xl:not-sr-only">
          <span className="block truncate text-xs font-semibold">{label}</span>
        </span>
      ) : null}
    </Link>
  );
}

function SidebarBrand({
  brandLogoUrl,
  brandName,
  brandTagline,
  onToggleCollapse,
}: {
  brandLogoUrl?: string | null;
  brandName?: string | null;
  brandTagline?: string | null;
  onToggleCollapse: () => void;
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
    <div className="relative rounded-[22px] border border-border/60 bg-white/55 p-3">
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onToggleCollapse}
        aria-label="Collapse sidebar"
        title="Collapse sidebar"
        className="absolute right-3 top-3"
        leftIcon={<ChevronLeft className="h-3.5 w-3.5" />}
      />

      <div className="flex items-center gap-3 pr-8">
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
          {/*
            Identity, not document structure (BUG-1673).

            This was an `<h1>`, and so was its compact twin below, and so was the
            page's own heading — three on every screen, so somebody navigating
            by headings heard "Workspace, Workspace, Dashboard" on the payroll
            screen, the settings screen and an employee's record alike. The word
            is a brand label; the page owns the only h1.
          */}
          <p className="truncate text-lg font-semibold text-foreground">
            Workspace
          </p>
        </div>
      </div>

      <p className="mt-2 line-clamp-2 pr-8 text-xs leading-5 text-muted">
        {effectiveTagline}
      </p>
    </div>
  );
}

/*
 * BUG-1668 — this used to render the full brand card (logo, name, and the
 * "Workspace" label) at every width below `xl`, on the assumption that the
 * sidebar itself was full width there. Now that the same width is a `w-16`
 * icon-only rail below `xl` (see the `<aside>` above), that card is wider
 * than its container on its own — the logo alone (`h-10 w-10` plus padding)
 * does not fit inside 64px, before any text. Reduced to the logo, centred,
 * matching the rail rather than reintroducing the overflow this fix removes.
 * Brand identity is not lost: `DashboardTopbar` (rendered alongside this
 * sidebar on every authenticated route) carries the tenant name separately.
 */
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
    <div className="flex items-center justify-center rounded-2xl border border-border/70 bg-white/60 p-2">
      <TenantLogo
        className="h-8 w-8 shrink-0"
        logoUrl={brandLogoUrl}
        name={effectiveBrandName}
        sizeClassName="h-8 w-8"
      />
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
  const [copiedTenantId, setCopiedTenantId] = useState(false);

  async function handleCopyTenantId() {
    if (!tenantId) return;

    await navigator.clipboard.writeText(tenantId);
    setCopiedTenantId(true);

    window.setTimeout(() => {
      setCopiedTenantId(false);
    }, 1500);
  }

  return (
    <div className="rounded-[22px] border border-border/70 bg-white/55 p-2">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface text-foreground shadow-sm">
          <Building2 className="h-3 w-3" />
        </div>

        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            Active tenant
          </p>

          <p className="mt-1 truncate text-sm font-semibold text-foreground">
            {displayName}
          </p>

          <Button
            variant="link"
            size="xs"
            onClick={handleCopyTenantId}
            title={`Copy tenant ID: ${tenantId}`}
            className="mt-1 max-w-full justify-start truncate text-[10px]"
          >
            {copiedTenantId ? "Copied!" : `ID: ${tenantId}`}
          </Button>
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
  if (href === "/") return LayoutDashboard;

  if (href.includes("/employees")) return Users;
  if (href.includes("/inbox")) return Bell;
  if (href.includes("/approvals")) return ShieldCheck;
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
  if (href.includes("/customers")) return Building2;
  if (href.includes("/reports")) return FileText;
  if (href.includes("/recruitment")) return Users;
  if (href.includes("/onboarding")) return ClipboardList;
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
  if (href === "/") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}