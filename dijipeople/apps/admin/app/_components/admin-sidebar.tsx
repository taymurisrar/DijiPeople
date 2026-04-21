"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navSections = [
  {
    title: "Workspace",
    items: [
      { href: "/", label: "Dashboard", icon: "DB" },
      { href: "/onboarding", label: "Onboarding", icon: "ON" },
      { href: "/leads", label: "Leads", icon: "LD" },
      { href: "/customers", label: "Customers", icon: "CU" },
      { href: "/tenants", label: "Tenants", icon: "TE" },
    ],
  },
  {
    title: "Revenue",
    items: [
      { href: "/subscriptions", label: "Subscriptions", icon: "SU" },
      { href: "/billing", label: "Billing", icon: "BI" },
      { href: "/payments", label: "Payments", icon: "PA" },
      { href: "/invoices", label: "Invoices", icon: "IN" },
      { href: "/plans", label: "Plans", icon: "PL" },
    ],
  },
  {
    title: "System",
    items: [{ href: "/settings", label: "Settings", icon: "SE" }],
  },
];

type AdminSidebarProps = {
  collapsed: boolean;
  isOpen: boolean;
  onCollapseToggle: () => void;
  onClose: () => void;
};

export function AdminSidebar({
  collapsed,
  isOpen,
  onCollapseToggle,
  onClose,
}: AdminSidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {isOpen ? (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden"
          onClick={onClose}
          type="button"
        />
      ) : null}

      <aside
        className={[
          "fixed inset-y-3 left-3 z-40 flex flex-col rounded-[28px] border border-slate-200 bg-white shadow-xl transition-all duration-200 lg:static lg:inset-auto lg:z-auto lg:shadow-sm",
          collapsed ? "w-24" : "w-72",
          isOpen ? "translate-x-0" : "-translate-x-[120%] lg:translate-x-0",
        ].join(" ")}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
          <div className={collapsed ? "mx-auto" : ""}>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              DijiPeople
            </div>
            {!collapsed ? (
              <div className="mt-1 text-lg font-semibold text-slate-950">
                Platform Admin
              </div>
            ) : null}
          </div>
          <button
            className="hidden rounded-xl border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 lg:inline-flex"
            onClick={onCollapseToggle}
            type="button"
          >
            {collapsed ? ">" : "<"}
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          {navSections.map((section) => (
            <div key={section.title}>
              {!collapsed ? (
                <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  {section.title}
                </div>
              ) : null}
              <div className="space-y-1">
                {section.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/" && pathname.startsWith(`${item.href}/`));

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className={[
                        "flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition",
                        isActive
                          ? "bg-slate-950 text-white"
                          : "text-slate-700 hover:bg-slate-100 hover:text-slate-950",
                        collapsed ? "justify-center" : "",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-[11px] font-semibold uppercase tracking-[0.15em]",
                          isActive
                            ? "border-white/20 bg-white/10 text-white"
                            : "border-slate-200 bg-slate-50 text-slate-600",
                        ].join(" ")}
                      >
                        {item.icon}
                      </span>
                      {!collapsed ? <span>{item.label}</span> : null}
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
