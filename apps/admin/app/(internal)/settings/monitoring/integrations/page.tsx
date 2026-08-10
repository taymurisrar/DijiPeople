import Link from "next/link";
import { MonitoringNav } from "@/app/_components/monitoring/monitoring-nav";
import { PageHeader } from "@/app/_components/ui/page-header";
import { requireSystemAdminUser } from "@/lib/auth";
import { apiRequestJson } from "@/lib/server-api";

export default async function MonitoringIntegrationsPage() {
  await requireSystemAdminUser("/settings/monitoring/integrations");
  const diagnostics = await apiRequestJson<Record<string, unknown>>("/super-admin/billing/diagnostics");
  const configured = Boolean(diagnostics.secretKeyConfigured);
  return <main className="space-y-5"><PageHeader eyebrow="Platform monitoring" title="Integration health" description="Connection and delivery readiness for external platform services." /><MonitoringNav current="/settings/monitoring/integrations" /><section className="grid gap-4 lg:grid-cols-2"><Integration title="Stripe" state={configured ? "Configured" : "Action required"} description="API connection, price synchronization, and webhook delivery." href="/settings/integrations/stripe" /><Integration title="Platform email" state="Review provider" description="SMTP/provider configuration and recent platform sends." href="/settings/email" /></section></main>;
}
function Integration({ title, state, description, href }: { title: string; state: string; description: string; href: string }) { return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-slate-950">{title}</h2><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{state}</span></div><p className="mt-2 text-sm text-slate-500">{description}</p><Link href={href} className="mt-4 inline-flex text-sm font-semibold text-[var(--admin-primary)]">Open integration settings</Link></section>; }
