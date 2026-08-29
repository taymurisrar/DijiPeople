"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Building2, Bug, CreditCard, DatabaseBackup, FileSignature, Handshake, Headphones, Mail, MonitorSmartphone, Palette, Scale, Search, Settings, ShieldCheck, SlidersHorizontal, Tags, Users, Workflow } from "lucide-react";
import { PageHeader } from "@/app/_components/ui/page-header";
import type { SettingsCardProps } from "@/app/_components/settings/settings-card";

type Group = { title: string; description: string; items: SettingsCardProps[] };
const groups: Group[] = [
  { title: "Platform", description: "Global identity and behavior.", items: [
    { title: "General", description: "Country, currency, timezone, locale, and platform defaults.", href: "/settings/platform-defaults", icon: Settings },
    { title: "Company profile", description: "Legal and public company identity.", href: "/settings/company-profile", icon: Building2 },
    { title: "Appearance", description: "Admin colors and supported design tokens.", href: "/settings/appearance", icon: Palette },
    { title: "Feature catalog", description: "Platform capabilities available to plans and tenants.", href: "/settings/features", icon: SlidersHorizontal },
  ]},
  { title: "Customers & Lifecycle", description: "Lead-to-customer and provisioning rules.", items: [
    { title: "Lead definitions", description: "Sources, qualification, statuses, and pipeline rules.", href: "/settings/lead-definitions", icon: Workflow },
    { title: "Customer definitions", description: "Lifecycle stages and account readiness.", href: "/settings/customer-definitions", icon: Users },
    { title: "Onboarding", description: "Readiness and conversion requirements.", href: "/settings/onboarding-definitions", icon: SlidersHorizontal },
    { title: "Tenant provisioning & domains", description: "Slug, base domain, protocol, wildcard DNS, and proxy readiness.", href: "/settings/tenant-provisioning", icon: Building2 },
  ]},
  { title: "Partners", description: "Partner lifecycle and commercial policy.", items: [
    { title: "Partner policies", description: "Review, activation, agreement, and referral requirements.", href: "/settings/partners", icon: Handshake },
  ]},
  { title: "Commercial", description: "Pricing, promotions, billing, and invoices.", items: [
    { title: "Plans & pricing", description: "Plan visibility and commercial defaults.", href: "/settings/plans", icon: Tags },
    { title: "Promotions", description: "Versioned discounts and eligibility scopes.", href: "/promotions", icon: Tags },
    { title: "Billing defaults", description: "Billing cycles, taxes, and payment terms.", href: "/settings/billing", icon: CreditCard },
    { title: "Exchange rates", description: "Rates used to report money collected in other currencies, live or set by hand.", href: "/settings/exchange-rates", icon: Tags },
    { title: "Invoice defaults", description: "Numbering, due dates, and invoice notes.", href: "/settings/invoices", icon: CreditCard },
  ]},
  { title: "Agreements", description: "Agreement, template, approval, and signing rules.", items: [
    { title: "Legal documents", description: "Draft and publish the terms, privacy policy and billing terms the platform sells under.", href: "/settings/legal", icon: Scale },
    { title: "Agreement rules", description: "Approvals, expiry, consent, and signature methods.", href: "/settings/contracts", icon: FileSignature },
    { title: "Templates", description: "Reusable versioned agreement documents.", href: "/templates", icon: FileSignature },
    { title: "Signature requests", description: "Active and completed signing work.", href: "/signature-requests", icon: FileSignature },
  ]},
  { title: "Communications", description: "Outbound delivery and notification behavior.", items: [
    { title: "Email", description: "SMTP/provider configuration, sender identity, and templates.", href: "/settings/email", icon: Mail },
  ]},
  { title: "Security", description: "Platform users, roles, and policies.", items: [
    { title: "Users & access", description: "Platform administrators, roles, and account state.", href: "/settings/users", icon: Users },
    { title: "Security policies", description: "Authentication and administrative access rules.", href: "/settings/security", icon: ShieldCheck },
  ]},
  { title: "Integrations", description: "External service connectivity.", items: [
    { title: "Stripe", description: "Connection, synchronization, and webhooks.", href: "/settings/integrations/stripe", icon: CreditCard },
  ]},
  { title: "Operations", description: "Monitoring, support, and controlled test data.", items: [
    { title: "Monitoring", description: "Overview, incidents, events, and integrations.", href: "/settings/monitoring", icon: Bug },
    { title: "Support policy", description: "Case numbering, severity targets, and SLA.", href: "/settings/support", icon: Headphones },
    { title: "Desktop agent", description: "Published agent versions by channel, and which tenants receive them.", href: "/settings/desktop-agent", icon: MonitorSmartphone },
    { title: "Demo/test data", description: "Manage explicitly tagged local demonstration data.", href: "/settings/demo-data", icon: DatabaseBackup },
  ]},
];

export default function SettingsPage() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(groups[0]!.title);
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return groups;
    return groups.map(group => ({ ...group, items: group.items.filter(item => `${group.title} ${group.description} ${item.title} ${item.description}`.toLowerCase().includes(term)) })).filter(group => group.items.length);
  }, [query]);
  const active = visible.find(group => group.title === selected) ?? visible[0];
  return <main className="space-y-5">
    <PageHeader eyebrow="System" title="Settings" description="Configure platform behavior through a compact category workspace." />
    <section className="grid min-h-[560px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="border-b border-slate-200 bg-slate-50 p-3 lg:border-b-0 lg:border-r">
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search settings" className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm" /></div>
        <nav className="mt-3 flex gap-1 overflow-x-auto lg:block lg:space-y-1" aria-label="Settings categories">{visible.map(group => <button type="button" key={group.title} onClick={() => setSelected(group.title)} className={`shrink-0 rounded-lg px-3 py-2 text-left text-sm font-semibold lg:block lg:w-full ${active?.title === group.title ? "bg-slate-950 text-white" : "text-slate-700 hover:bg-white"}`}>{group.title}</button>)}</nav>
      </aside>
      <div className="p-4 sm:p-6">
        {active ? <><h2 className="text-xl font-semibold text-slate-950">{active.title}</h2><p className="mt-1 text-sm text-slate-500">{active.description}</p><div className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-200">{active.items.map(item => { const Icon = item.icon; return <Link key={item.href} href={item.href} className="flex items-center gap-4 p-4 transition hover:bg-slate-50"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700"><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block font-semibold text-slate-900">{item.title}</span><span className="mt-0.5 block text-sm text-slate-500">{item.description}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-slate-400" /></Link>; })}</div></> : <div className="grid min-h-72 place-items-center text-center"><div><h2 className="font-semibold text-slate-900">No settings found</h2><button type="button" onClick={() => setQuery("")} className="mt-3 text-sm font-semibold text-[var(--admin-primary)]">Clear search</button></div></div>}
      </div>
    </section>
  </main>;
}
