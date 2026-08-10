import { MonitoringNav } from "@/app/_components/monitoring/monitoring-nav";
import { PageHeader } from "@/app/_components/ui/page-header";
import { requireSystemAdminUser } from "@/lib/auth";
import { apiRequestJson } from "@/lib/server-api";

type Overview = {
  window: string;
  bySource: Record<string, number>;
  byResult: Record<string, number>;
  recent: Array<{ id: string; eventCode: string; source: string; occurredAt: string }>;
};

export default async function MonitoringSettingsPage() {
  await requireSystemAdminUser("/settings/monitoring");
  const overview = await apiRequestJson<Overview>("/platform/events/overview");
  const total = Object.values(overview.byResult).reduce((sum, count) => sum + count, 0);
  return (
    <main className="space-y-5">
      <PageHeader eyebrow="Operations" title="Monitoring" description="Health, incidents, business events, and integration signals are intentionally separated." />
      <MonitoringNav current="/settings/monitoring" />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Events (24h)" value={total} />
        <Metric label="Succeeded" value={overview.byResult.SUCCEEDED ?? 0} />
        <Metric label="Pending" value={overview.byResult.PENDING ?? 0} />
        <Metric label="Failed events" value={overview.byResult.FAILED ?? 0} tone="danger" />
      </section>
      <section className="grid gap-5 lg:grid-cols-2">
        <Panel title="Events by source" values={overview.bySource} empty="No events recorded in the last 24 hours." />
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-slate-950">Recent activity</h2>
          {overview.recent.length ? <ol className="mt-3 divide-y divide-slate-100">{overview.recent.map(item => <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm"><span><span className="font-medium text-slate-800">{friendly(item.eventCode)}</span><span className="ml-2 text-xs text-slate-500">{friendly(item.source)}</span></span><time className="shrink-0 text-xs text-slate-500">{new Date(item.occurredAt).toLocaleString()}</time></li>)}</ol> : <p className="mt-3 text-sm text-slate-500">Events will appear after platform activity occurs.</p>}
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value, tone = "normal" }: { label: string; value: number; tone?: "normal" | "danger" }) { return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className={`mt-2 text-2xl font-semibold ${tone === "danger" && value ? "text-rose-700" : "text-slate-950"}`}>{value.toLocaleString()}</p></section>; }
function Panel({ title, values, empty }: { title: string; values: Record<string, number>; empty: string }) { const entries = Object.entries(values); return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="font-semibold text-slate-950">{title}</h2>{entries.length ? <dl className="mt-3 space-y-2">{entries.map(([key, value]) => <div key={key} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"><dt>{friendly(key)}</dt><dd className="font-semibold">{value}</dd></div>)}</dl> : <p className="mt-3 text-sm text-slate-500">{empty}</p>}</section>; }
function friendly(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase()); }
