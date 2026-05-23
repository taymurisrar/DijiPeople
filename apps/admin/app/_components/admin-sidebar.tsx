"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  ClipboardList,
  CreditCard,
  FileText,
  LayoutDashboard,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  RefreshCcw,
  Settings2,
  UsersRound,
  UserRoundSearch,
  Webhook,
  X,
} from "lucide-react";

const navSections = [
  {
    title: "Workspace",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/leads", label: "Leads", icon: UserRoundSearch },
      { href: "/customers", label: "Customers", icon: UsersRound },
      { href: "/onboarding", label: "Onboarding", icon: ClipboardList },
      { href: "/tenants", label: "Tenants", icon: Building2 },
    ],
  },
  {
    title: "Revenue",
    items: [
      { href: "/plans", label: "Plans", icon: Package },
      { href: "/billing", label: "Billing", icon: ReceiptText },
      { href: "/subscriptions", label: "Subscriptions", icon: RefreshCcw },
      { href: "/invoices", label: "Invoices", icon: FileText },
      { href: "/payments", label: "Payments", icon: CreditCard },
      {
        href: "/billing/webhooks",
        label: "Billing Webhooks",
        icon: Webhook,
        roleKeys: ["system-admin"],
      },
    ],
  },
  {
    title: "System",
    items: [{ href: "/settings", label: "Settings", icon: Settings2 }],
  },
];

type AdminSidebarProps = {
  collapsed: boolean;
  isOpen: boolean;
  onCollapseToggle: () => void;
  onClose: () => void;
  roleKeys?: string[];
};

export function AdminSidebar({
  collapsed,
  isOpen,
  onCollapseToggle,
  onClose,
  roleKeys = [],
}: AdminSidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {isOpen ? (
        <button
          aria-label="Close navigation overlay"
          className="fixed inset-0 z-30 bg-slate-950/40 backdrop-blur-[1px] lg:hidden"
          onClick={onClose}
          type="button"
        />
      ) : null}

      <aside
        className={[
          "fixed inset-y-3 left-3 z-40 flex max-w-[calc(100vw-1.5rem)] flex-col rounded-[28px] border border-slate-200 bg-white shadow-xl transition-[width,transform] duration-200 ease-out",
          "lg:sticky lg:top-4 lg:inset-auto lg:z-auto lg:h-[calc(100vh-2rem)] lg:shrink-0 lg:shadow-sm",
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
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              DijiPeople
            </div>

            <div className="mt-1 text-lg font-semibold text-slate-950">
              Platform Admin
            </div>
          </div>

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
            "flex-1 space-y-6 overflow-x-hidden px-3 py-4",
            "overflow-y-hidden lg:overflow-y-auto",
            "scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none]",
          ].join(" ")}
        >
          {navSections.map((section) => (
            <div key={section.title}>
              <div
                className={[
                  "px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400",
                  collapsed ? "lg:hidden" : "",
                ].join(" ")}
              >
                {section.title}
              </div>

              <div className="space-y-1">
                {section.items
                  .filter((item) => canShowNavItem(item, roleKeys))
                  .map((item) => {
                    const Icon = item.icon;
                    const isActive =
                      pathname === item.href ||
                      (item.href !== "/" &&
                        pathname.startsWith(`${item.href}/`));

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={collapsed ? item.label : undefined}
                        onClick={onClose}
                        className={[
                          "group flex min-w-0 items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition",
                          isActive
                            ? "bg-slate-950 text-white"
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

type NavItem = (typeof navSections)[number]["items"][number];

function canShowNavItem(item: NavItem, roleKeys: string[]) {
  if (!("roleKeys" in item) || !item.roleKeys?.length) return true;

  return item.roleKeys.some((roleKey) => roleKeys.includes(roleKey));
}
