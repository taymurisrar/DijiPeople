import type { Metadata } from "next";
import { MonitoringNav } from "@/app/_components/monitoring/monitoring-nav";
import { PageHeader } from "@/app/_components/ui/page-header";
import { requireSystemAdminUser } from "@/lib/auth";
import { apiRequestJson } from "@/lib/server-api";

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "Events",
};


type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Event = { id: string; eventCode: string; source: string; result: string; severity: string; environment: string; correlationId: string; entityType?: string | null; entityId?: string | null; tenantId?: string | null; customerAccountId?: string | null; occurredAt: string; metadata?: unknown };

export default async function EventsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireSystemAdminUser("/settings/monitoring/events");
  const resolved = await searchParams;
  const query = new URLSearchParams();
  for (const key of ["search", "source", "result", "severity", "environment", "correlationId", "tenantId", "customerAccountId", "eventCode", "from", "to"]) { const raw = resolved[key]; const value = Array.isArray(raw) ? raw[0] : raw; if (value) query.set(key, value); }
  query.set("pageSize", "50");
  const response = await apiRequestJson<{ items: Event[]; total: number }>(`/platform/events?${query}`);
  return <main className="space-y-5">
    <PageHeader eyebrow="Platform monitoring" title="Business and system events" description="Search successful, pending, ignored, and failed lifecycle activity without mixing it into the incident queue." />
    <MonitoringNav current="/settings/monitoring/events" />
    <form className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:grid-cols-2 xl:grid-cols-4">
      <input name="search" defaultValue={single(resolved.search)} placeholder="Search event or entity" className="h-10 rounded-lg border border-slate-200 px-3 text-sm xl:col-span-2" />
      <input name="eventCode" defaultValue={single(resolved.eventCode)} placeholder="Event type" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" />
      <Select name="source" value={single(resolved.source)} options={["LANDING","WEB_APP","ADMIN","API","BACKGROUND","STRIPE","EMAIL","INTEGRATION"]} />
      <Select name="result" value={single(resolved.result)} options={["SUCCEEDED","PENDING","FAILED","IGNORED"]} />
      <Select name="severity" value={single(resolved.severity)} options={["INFO","WARNING","ERROR","CRITICAL"]} />
      <Select name="environment" value={single(resolved.environment)} options={["development","test","production"]} />
      <input name="correlationId" defaultValue={single(resolved.correlationId)} placeholder="Correlation ID" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" />
      <input name="tenantId" defaultValue={single(resolved.tenantId)} placeholder="Tenant ID" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" />
      <input name="customerAccountId" defaultValue={single(resolved.customerAccountId)} placeholder="Customer ID" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" />
      <input type="date" name="from" aria-label="Events from date" defaultValue={single(resolved.from)} className="h-10 rounded-lg border border-slate-200 px-3 text-sm" />
      <input type="date" name="to" aria-label="Events to date" defaultValue={single(resolved.to)} className="h-10 rounded-lg border border-slate-200 px-3 text-sm" />
      <button className="h-10 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white xl:col-start-4">Filter</button>
    </form>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3 text-xs text-slate-500">{response.total.toLocaleString()} recorded events</div>
      {response.items.length ? <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{["Timestamp","Source","Event","Entity","Result","Correlation"].map(label => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{response.items.map(item => <tr key={item.id} className="align-top"><td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{new Date(item.occurredAt).toLocaleString()}</td><td className="px-4 py-3">{friendly(item.source)}</td><td className="px-4 py-3"><details><summary className="cursor-pointer font-semibold text-slate-900">{friendly(item.eventCode)}</summary><pre className="mt-2 max-w-lg overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-[11px] text-slate-100">{JSON.stringify(item.metadata ?? {}, null, 2)}</pre></details></td><td className="px-4 py-3 text-slate-600">{item.entityType ? `${item.entityType} · ${item.entityId ?? "—"}` : "—"}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.result === "FAILED" ? "bg-rose-50 text-rose-700" : item.result === "PENDING" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{friendly(item.result)}</span></td><td className="px-4 py-3 font-mono text-xs text-slate-500">{item.correlationId}</td></tr>)}</tbody></table></div> : <div className="p-10 text-center"><h2 className="font-semibold text-slate-900">No events recorded</h2><p className="mt-2 text-sm text-slate-500">Events will appear after landing, Admin, API, or integration activity occurs.</p></div>}
    </section>
  </main>;
}
function Select({ name, value, options }: { name: string; value: string; options: string[] }) { return <select name={name} defaultValue={value} className="h-10 rounded-lg border border-slate-200 px-2 text-sm"><option value="">All {name}</option>{options.map(option => <option key={option}>{option}</option>)}</select>; }
function single(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
function friendly(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase()); }
