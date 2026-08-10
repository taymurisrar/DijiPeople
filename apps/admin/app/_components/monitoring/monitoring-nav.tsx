import Link from "next/link";

const items = [
  ["Overview", "/settings/monitoring"],
  ["Incidents / Errors", "/settings/monitoring/error-logs"],
  ["Events", "/settings/monitoring/events"],
  ["Integrations", "/settings/monitoring/integrations"],
] as const;

export function MonitoringNav({ current }: { current: string }) {
  return (
    <nav className="flex min-w-0 gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm" aria-label="Monitoring views">
      {items.map(([label, href]) => (
        <Link
          key={href}
          href={href}
          aria-current={current === href ? "page" : undefined}
          className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${current === href ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50"}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
