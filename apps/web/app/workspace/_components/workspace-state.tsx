import Link from "next/link";
import type { ReactNode } from "react";

/**
 * One presentation for every workspace state page.
 *
 * The wording is the part that matters. A visitor who reaches an unknown
 * hostname must not be told whether that name was ever associated with a
 * customer, and a customer whose workspace is suspended must not be told their
 * company does not exist. Each page supplies its own copy; this only lays it out.
 */
export function WorkspaceState({
  eyebrow,
  title,
  description,
  detail,
  action,
  tone = "neutral",
}: {
  eyebrow: string;
  title: string;
  description: string;
  detail?: ReactNode;
  action?: { label: string; href: string } | null;
  tone?: "neutral" | "warning" | "danger";
}) {
  const tones: Record<string, string> = {
    neutral: "text-slate-500",
    warning: "text-amber-700",
    danger: "text-rose-700",
  };

  return (
    <div>
      <p
        className={`text-xs font-semibold uppercase tracking-[0.24em] ${tones[tone]}`}
      >
        {eyebrow}
      </p>
      <h1 className="mt-3 text-2xl font-semibold text-slate-950">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
      {detail ? <div className="mt-4">{detail}</div> : null}
      {action ? (
        <div className="mt-6">
          <Link
            href={action.href}
            className="inline-flex h-10 items-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"
          >
            {action.label}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
