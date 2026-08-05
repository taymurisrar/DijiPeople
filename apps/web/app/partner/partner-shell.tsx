"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Me = {
  user: { firstName: string; lastName: string; email: string };
  partner: { displayName: string; code: string; status: string };
};
const nav = [
  ["Overview", "/partner"],
  ["Referral links", "/partner/referral-links"],
  ["Referred leads", "/partner/leads"],
  ["Contracts", "/partner/contracts"],
  ["Profile", "/partner/profile"],
];
export function PartnerShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    fetch("/api/partner/portal/me")
      .then(async (response) => {
        if (response.status === 401) {
          router.replace(`/partner-login?returnTo=${encodeURIComponent(path)}`);
          return null;
        }
        return response.ok ? response.json() : null;
      })
      .then(setMe);
  }, [path, router]);
  async function logout() {
    await fetch("/api/partner/auth/logout", { method: "POST" });
    router.replace("/partner-login");
    router.refresh();
  }
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-4 py-3 lg:px-8">
          <Link href="/partner" className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-700">
              DijiPeople Partner
            </span>
            <span className="block truncate text-base font-semibold text-slate-950">
              {me?.partner.displayName ?? "Partner workspace"}
            </span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {nav.map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${path === href || (href !== "/partner" && path.startsWith(href)) ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}
              >
                {label}
              </Link>
            ))}
          </nav>
          <button
            onClick={logout}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600"
          >
            Sign out
          </button>
        </div>
        <nav className="flex overflow-x-auto border-t border-slate-100 px-3 md:hidden">
          {nav.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className={`shrink-0 px-3 py-2.5 text-xs font-semibold ${path === href || (href !== "/partner" && path.startsWith(href)) ? "text-blue-700" : "text-slate-500"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl p-4 lg:p-8">{children}</main>
    </div>
  );
}
