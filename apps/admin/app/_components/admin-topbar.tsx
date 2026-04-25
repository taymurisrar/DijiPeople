"use client";

import { useState } from "react";
import {
  Bell,
  ChevronDown,
  LogOut,
  Menu,
  Search,
} from "lucide-react";

type AdminTopbarProps = {
  firstName: string;
  lastName: string;
  email: string;
  onMenuToggle: () => void;
};

export function AdminTopbar({
  firstName,
  lastName,
  email,
  onMenuToggle,
}: AdminTopbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const initials = `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase();

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
    } finally {
      window.location.href = "/login";
    }
  }

  return (
    <header className="flex flex-col gap-4 rounded-[28px] border border-slate-200 bg-white px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      {/* LEFT */}
      <div className="flex items-center gap-3">
        <button
          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 text-slate-700 transition hover:bg-slate-50 lg:hidden"
          onClick={onMenuToggle}
          type="button"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            DijiPeople • Internal
          </p>

          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
            SaaS Operations Control Panel
          </h2>
        </div>
      </div>

      {/* RIGHT */}
      <div className="flex items-center gap-3">
        {/* SEARCH */}
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            placeholder="Search tenants, customers..."
            className="w-[260px] rounded-2xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-300 focus:bg-white"
          />
        </div>

        {/* NOTIFICATIONS */}
        <button className="relative inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-700 transition hover:bg-slate-50">
          <Bell className="h-4 w-4" />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500" />
        </button>

        {/* USER MENU */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen((prev) => !prev)}
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 transition hover:bg-white"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-xs font-semibold text-white">
              {initials || "A"}
            </div>

            <div className="hidden sm:block text-left">
              <div className="font-semibold text-slate-950 leading-tight">
                {firstName} {lastName}
              </div>
              <div className="text-xs text-slate-500">{email}</div>
            </div>

            <ChevronDown className="h-4 w-4 text-slate-400" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-slate-200 bg-white shadow-lg">
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-950">
                  {firstName} {lastName}
                </p>
                <p className="text-xs text-slate-500">{email}</p>
              </div>

              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-4 py-3 text-sm text-red-600 transition hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}