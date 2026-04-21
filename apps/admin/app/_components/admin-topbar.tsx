"use client";

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
  return (
    <header className="flex flex-col gap-4 rounded-[28px] border border-slate-200 bg-white px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <button
          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 text-slate-700 lg:hidden"
          onClick={onMenuToggle}
          type="button"
        >
          =
        </button>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            DijiPeople internal operations
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-950">
            SaaS operations control panel
          </h2>
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        <div className="font-semibold text-slate-950">
          {firstName} {lastName}
        </div>
        <div className="mt-1">{email}</div>
      </div>
    </header>
  );
}
