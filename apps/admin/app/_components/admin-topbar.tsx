"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  ChevronDown,
  CircleHelp,
  Command,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";

type AdminTopbarProps = {
  firstName: string;
  lastName: string;
  email: string;
  onMenuToggle: () => void;
};

type TopbarAction = {
  label: string;
  description?: string;
  href?: string;
  icon: React.ElementType;
  danger?: boolean;
  onClick?: () => void | Promise<void>;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function AdminTopbar({
  firstName,
  lastName,
  email,
  onMenuToggle,
}: AdminTopbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const displayName = useMemo(() => {
    const name = `${firstName ?? ""} ${lastName ?? ""}`.trim();
    return name || "Administrator";
  }, [firstName, lastName]);

  const initials = useMemo(() => {
    const first = firstName?.trim()?.[0] ?? "";
    const last = lastName?.trim()?.[0] ?? "";
    const fallback = email?.trim()?.[0] ?? "A";

    return `${first}${last}`.trim().toUpperCase() || fallback.toUpperCase();
  }, [firstName, lastName, email]);

  const currentDate = useMemo(() => {
    return new Intl.DateTimeFormat("en-QA", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date());
  }, []);

  const profileActions: TopbarAction[] = [
    {
      label: "My Profile",
      description: "View account and identity details",
      href: "/dashboard/profile",
      icon: UserRound,
    },
    {
      label: "Security",
      description: "Password, sessions and access",
      href: "/dashboard/security",
      icon: ShieldCheck,
    },
    {
      label: "Settings",
      description: "Preferences and admin configuration",
      href: "/dashboard/settings",
      icon: Settings,
    },
    {
      label: "Help & Support",
      description: "Documentation and support center",
      href: "/dashboard/support",
      icon: CircleHelp,
    },
  ];

  async function handleLogout() {
    if (isLoggingOut) return;

    setIsLoggingOut(true);

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Logout should still clear the client session route even if API fails.
    } finally {
      window.location.assign("/login");
    }
  }

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setSearchOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
    }
  }, [searchOpen]);

  return (
    <header className="top-4 z-30 rounded-[28px] border border-slate-200/80 bg-white/95 px-4 py-4 shadow-sm backdrop-blur-xl sm:px-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <button
            type="button"
            aria-label="Open sidebar navigation"
            onClick={onMenuToggle}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900/10 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                DijiPeople Admin
              </p>

              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                Internal Operations
              </span>
            </div>

            <div className="mt-1 flex flex-col gap-1 sm:flex-row sm:items-end sm:gap-3">
              <h1 className="truncate text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
                Control Hub              </h1>

              <p className="text-xs font-medium text-slate-500 sm:pb-1">
                {currentDate}
              </p>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          <div className="relative hidden min-w-[280px] md:block xl:w-[360px]">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

            <input
              type="search"
              placeholder="Search tenants, customers, invoices..."
              className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-24 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-900/5"
            />

            <div className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-400 lg:flex">
              <Command className="h-3 w-3" />
              K
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <button
              type="button"
              aria-label="Open search"
              onClick={() => setSearchOpen(true)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900/10 md:hidden"
            >
              <Search className="h-4 w-4" />
            </button>

            <button
              type="button"
              aria-label="View notifications"
              className="relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-red-500" />
            </button>

            <div ref={profileMenuRef} className="relative">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((prev) => !prev)}
                className="flex max-w-full items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm text-slate-700 transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 sm:px-3"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-xs font-bold text-white shadow-sm">
                  {initials}
                </div>

                <div className="hidden min-w-0 text-left sm:block">
                  <p className="truncate font-semibold leading-tight text-slate-950">
                    {displayName}
                  </p>
                  <p className="max-w-[180px] truncate text-xs text-slate-500">
                    {email || "No email available"}
                  </p>
                </div>

                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-slate-400 transition",
                    menuOpen && "rotate-180",
                  )}
                />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10"
                >
                  <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-sm font-bold text-white">
                        {initials}
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">
                          {displayName}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {email || "No email available"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-2">
                    {profileActions.map((action) => {
                      const Icon = action.icon;

                      return (
                        <a
                          key={action.label}
                          href={action.href}
                          role="menuitem"
                          onClick={() => setMenuOpen(false)}
                          className="flex items-start gap-3 rounded-2xl px-3 py-2.5 text-slate-700 transition hover:bg-slate-50"
                        >
                          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />

                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-slate-800">
                              {action.label}
                            </span>

                            {action.description && (
                              <span className="block truncate text-xs text-slate-500">
                                {action.description}
                              </span>
                            )}
                          </span>
                        </a>
                      );
                    })}
                  </div>

                  <div className="border-t border-slate-100 p-2">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleLogout}
                      disabled={isLoggingOut}
                      className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <LogOut className="h-4 w-4" />
                      {isLoggingOut ? "Signing out..." : "Sign out"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {searchOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 p-4 backdrop-blur-sm md:hidden">
          <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-2xl">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                <input
                  ref={searchInputRef}
                  type="search"
                  placeholder="Search tenants, customers, invoices..."
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-900/5"
                />
              </div>

              <button
                type="button"
                aria-label="Close search"
                onClick={() => setSearchOpen(false)}
                className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 text-slate-700 transition hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="px-2 pt-3 text-xs text-slate-500">
              Search across tenants, customers, subscriptions, invoices, and
              operational records.
            </p>
          </div>
        </div>
      )}
    </header>
  );
}