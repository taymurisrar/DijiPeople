import Link from "next/link";
import type { ComponentType } from "react";
import { ArrowRight } from "lucide-react";

export type SettingsCardBadge = "Core" | "Recommended" | "Advanced";

export type SettingsCardProps = {
  title: string;
  description: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  badge?: SettingsCardBadge;
  groupTitle?: string;
  compact?: boolean;
};

export function SettingsCard({
  title,
  description,
  href,
  icon: Icon,
  badge,
  groupTitle,
  compact = false,
}: SettingsCardProps) {
  return (
    <Link
      href={href}
      className="group block rounded-3xl border border-slate-200 bg-slate-50 p-5 transition hover:border-slate-300 hover:bg-white hover:shadow-sm"
    >
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-700 ring-1 ring-slate-200 transition group-hover:bg-slate-950 group-hover:text-white">
          <Icon className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-slate-950">
              {title}
            </h3>

            {badge ? (
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-500">
                {badge}
              </span>
            ) : null}
          </div>

          {groupTitle ? (
            <p className="mt-1 text-sm font-medium text-slate-500">
              {groupTitle}
            </p>
          ) : null}

          <p
            className={`mt-2 text-sm leading-6 text-slate-600 ${
              compact ? "line-clamp-2" : ""
            }`}
          >
            {description}
          </p>
        </div>

        <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-700" />
      </div>
    </Link>
  );
}