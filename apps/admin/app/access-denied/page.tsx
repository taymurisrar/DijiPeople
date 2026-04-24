import Link from "next/link";

export default function AccessDeniedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6 py-16">
      <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-10 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
          DijiPeople Admin
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">
          Access denied
        </h1>
        <p className="mt-4 text-base leading-7 text-slate-600">
          This internal control panel is reserved for system admin accounts. Sign in with an authorized admin account to continue.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/login"
            className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Open admin login
          </Link>
          <Link
            href="/tenants"
            className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Retry admin access
          </Link>
        </div>
      </div>
    </main>
  );
}
