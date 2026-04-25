import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type SettingsShellProps = {
  eyebrow?: string;
  title: string;
  description: string;
  children: React.ReactNode;
};

export function SettingsShell({
  eyebrow = "Settings",
  title,
  description,
  children,
}: SettingsShellProps) {
  return (
    <main className="space-y-6">
      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
        <Link
          href="/settings"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-slate-950"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to settings
        </Link>

        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
          {eyebrow}
        </p>

        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
          {title}
        </h1>

        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          {description}
        </p>
      </section>

      {children}
    </main>
  );
}