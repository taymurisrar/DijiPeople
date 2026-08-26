"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Building2,
  Bug,
  ClipboardList,
  ClipboardCheck,
  CreditCard,
  BadgeDollarSign,
  FileSignature,
  Files,
  Handshake,
  LifeBuoy,
  PenLine,
  FileText,
  LayoutDashboard,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCcw,
  Settings2,
  UsersRound,
  UserRoundSearch,
  X,
} from "lucide-react";
import { listPlatformModuleDefinitions } from "@/lib/runtime/platform-module-registry";

const iconMap = {
  LayoutDashboard,
  UserRoundSearch,
  Handshake,
  UsersRound,
  ClipboardCheck,
  ClipboardList,
  Building2,
  FileSignature,
  Files,
  PenLine,
  LifeBuoy,
  RefreshCcw,
  Package,
  FileText,
  CreditCard,
  BadgeDollarSign,
  Bug,
} as const;

const modules = listPlatformModuleDefinitions();
type SidebarItem = {
  href: string;
  label: string;
  icon: (typeof iconMap)[keyof typeof iconMap] | typeof Settings2;
  roleKeys: string[];
  readPermission?: string;
};
/**
 * `href` overrides the module's own `routeBase`.
 *
 * Needed where a module's list page is not the right landing page for its area.
 * Monitoring is the case: `routeBase` is `/settings/monitoring/error-logs`
 * because that is where its records live, so the sidebar sent every operator
 * straight into a queue of twelve thousand incidents, skipping the Overview
 * that exists to say which of them matter. Changing `routeBase` instead would
 * break the runtime record routes built from it.
 */
function moduleItem(
  key: string,
  label?: string,
  href?: string,
): SidebarItem | null {
  const definition = modules.find((item) => item.key === key);
  if (!definition) return null;
  return {
    href: href ?? definition.routeBase,
    label: label ?? definition.pluralDisplayName,
    icon: iconMap[definition.icon as keyof typeof iconMap] ?? LayoutDashboard,
    roleKeys: [
      ...new Set(definition.views.flatMap((view) => view.roles ?? [])),
    ],
    readPermission: definition.permissions.read,
  };
}
function section(title: string, entries: Array<SidebarItem | null>) {
  return {
    title,
    items: entries.filter((item): item is SidebarItem => Boolean(item)),
  };
}
const navSections = [
  section("Workspace", [moduleItem("dashboard", "Dashboard")]),
  section("Growth", [
    moduleItem("leads"),
    moduleItem("customers"),
    moduleItem("customer-onboarding", "Onboarding"),
  ]),
  section("Partners", [
    moduleItem("partners"),
    moduleItem("partner-inquiries"),
    // BUG-0019 — the onboarding compliance review had no entry here, and its
    // list route redirected to a Partner list, so the step was unperformable
    // through the product however you navigated to it.
    moduleItem("partner-onboarding", "Onboarding reviews"),
  ]),
  section("Agreements", [
    moduleItem("contracts"),
    moduleItem("contract-templates", "Templates"),
  ]),
  section("Customer Operations", [
    moduleItem("tenants"),
    moduleItem("subscriptions"),
  ]),
  section("Revenue", [
    moduleItem("plans"),
    {
      href: "/promotions",
      label: "Promotions",
      icon: BadgeDollarSign,
      roleKeys: [],
      readPermission: "billing.read",
    },
    moduleItem("invoices"),
    moduleItem("payments"),
    moduleItem("commissions"),
  ]),
  section("Support", [moduleItem("support-cases", "Support cases")]),
  section("Operations", [
    moduleItem("monitoring-incidents", "Monitoring", "/settings/monitoring"),
    {
      href: "/app-releases",
      label: "App releases",
      icon: Package,
      roleKeys: [],
      readPermission: "appDownloads.manage",
    },
  ]),
  section("System", [
    {
      href: "/settings",
      label: "Settings",
      icon: Settings2,
      roleKeys: [],
      readPermission: "settings.read",
    },
  ]),
];

type AdminSidebarProps = {
  collapsed: boolean;
  isOpen: boolean;
  onCollapseToggle: () => void;
  onClose: () => void;
  roleKeys?: string[];
  permissionKeys?: string[];
};

export function AdminSidebar({
  collapsed,
  isOpen,
  onCollapseToggle,
  onClose,
  roleKeys = [],
  permissionKeys = [],
}: AdminSidebarProps) {
  const pathname = usePathname();
  const activeHref = navSections
    .flatMap((section) => section.items)
    .filter(
      (item) =>
        canShowNavItem(item, roleKeys, permissionKeys) &&
        matchesRoute(pathname, item.href),
    )
    .sort((left, right) => right.href.length - left.href.length)[0]?.href;

  return (
    <>
      {isOpen ? (
        <button
          aria-label="Close navigation overlay"
          /*
           * Above the topbar (z-30), which is now genuinely positioned. At the
           * same z-index the topbar would win on DOM order and stay bright
           * above the dimmed page while the drawer was open.
           */
          className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-[1px] lg:hidden"
          onClick={onClose}
          type="button"
        />
      ) : null}

      <aside
        className={[
          "fixed inset-y-3 left-3 z-50 flex max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl transition-[width,transform] duration-200 ease-out",
          "lg:sticky lg:top-4 lg:inset-auto lg:z-auto lg:h-[calc(100dvh-2rem)] lg:shrink-0 lg:self-start lg:shadow-sm",
          "w-[calc(100vw-1.5rem)] sm:w-80",
          collapsed ? "lg:w-24" : "lg:w-72",
          isOpen ? "translate-x-0" : "-translate-x-[120%] lg:translate-x-0",
        ].join(" ")}
      >
        <div
          className={[
            "flex items-center border-b border-slate-100 px-4 py-4",
            collapsed ? "lg:justify-center" : "justify-between gap-3",
          ].join(" ")}
        >
          <div className={collapsed ? "lg:hidden" : ""}>
            <Image
              src="/logo-primary-horizontal.svg"
              alt="DijiPeople"
              width={370}
              height={100}
              priority
              className="h-8 w-auto"
            />
            <div className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Platform Admin
            </div>
          </div>

          {collapsed ? (
            <Image
              src="/logo-stacked.svg"
              alt="DijiPeople"
              width={40}
              height={40}
              className="hidden h-10 w-10 object-contain lg:block"
            />
          ) : null}

          <button
            aria-label="Close navigation"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 lg:hidden"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>

          <button
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            className="hidden h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50 hover:text-slate-950 lg:inline-flex"
            onClick={onCollapseToggle}
            type="button"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>

        <div
          className={[
            "min-h-0 flex-1 space-y-6 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-4",
            "scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none]",
          ].join(" ")}
        >
          {navSections.map((section) => (
            <div key={section.title}>
              <div
                className={[
                  // slate-400 on white is ~2.8:1 and fails WCAG AA for normal text; slate-500 clears it at ~4.8:1.
                  "px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500",
                  collapsed ? "lg:hidden" : "",
                ].join(" ")}
              >
                {section.title}
              </div>

              <div className="space-y-1">
                {section.items
                  .filter((item) =>
                    canShowNavItem(item, roleKeys, permissionKeys),
                  )
                  .map((item) => {
                    const Icon = item.icon;
                    const isActive = item.href === activeHref;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={collapsed ? item.label : undefined}
                        onClick={onClose}
                        className={[
                          "group flex min-w-0 items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition",
                          isActive
                            ? "bg-[var(--admin-navigation)] text-white shadow-sm"
                            : "text-slate-700 hover:bg-slate-100 hover:text-slate-950",
                          collapsed ? "lg:justify-center" : "",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
                            isActive
                              ? "border-white/20 bg-white/10 text-white"
                              : "border-slate-200 bg-slate-50 text-slate-600 group-hover:border-slate-300",
                          ].join(" ")}
                        >
                          <Icon className="h-4 w-4" />
                        </span>

                        <span
                          className={[
                            "min-w-0 truncate",
                            collapsed ? "lg:hidden" : "",
                          ].join(" ")}
                        >
                          {item.label}
                        </span>
                      </Link>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}

type NavItem = SidebarItem;

function canShowNavItem(
  item: NavItem,
  roleKeys: string[],
  permissionKeys: string[],
) {
  /*
   * PLATFORM_OWNER is the current name for owner-level access; SUPER_ADMIN is
   * its legacy alias. Listing only the legacy one hid navigation from the very
   * role that is meant to see everything.
   */
  if (
    roleKeys.includes("PLATFORM_OWNER") ||
    roleKeys.includes("SUPER_ADMIN") ||
    roleKeys.includes("system-admin")
  ) {
    return true;
  }
  const readPermission = item.readPermission;
  if (
    readPermission &&
    !permissionKeys.some((permission) =>
      permissionMatches(permission, readPermission),
    )
  )
    return false;
  if (!("roleKeys" in item) || !item.roleKeys?.length) return true;

  return item.roleKeys.some((roleKey) => roleKeys.includes(roleKey));
}

function permissionMatches(granted: string, requested: string) {
  if (granted === "platform.*" || granted === requested) return true;
  return granted.endsWith(".*") && requested.startsWith(granted.slice(0, -1));
}

function matchesRoute(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}
