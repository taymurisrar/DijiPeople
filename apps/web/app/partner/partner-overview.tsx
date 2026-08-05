"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

type Lead = {
  id: string;
  status: string;
  lead: { companyName: string; updatedAt: string };
};
type ReferralLink = {
  id: string;
  name: string;
  code: string;
  isDefault: boolean;
  status: string;
};
type Contract = {
  id: string;
  title: string;
  contractNumber: string;
  status: string;
  updatedAt: string;
};
type Me = {
  user: { firstName: string };
  partner: {
    displayName: string;
    status: string;
    defaultCommissionRate: string;
    currencyCode: string;
  };
};
export function PartnerOverview() {
  const [state, setState] = useState<{
    me: Me;
    leads: Lead[];
    contracts: Contract[];
    links: ReferralLink[];
  } | null>(null);
  useEffect(() => {
    Promise.all([
      fetchJson("me"),
      fetchJson("leads"),
      fetchJson("contracts"),
      fetchJson("referral-links"),
    ])
      .then(([me, leads, contracts, links]) =>
        setState({
          me,
          leads: leads.items,
          contracts: contracts.items,
          links: links.items,
        }),
      )
      .catch(() => null);
  }, []);
  if (!state) return <Loading />;
  const qualified = state.leads.filter(
    (item) => item.status === "QUALIFIED",
  ).length;
  const newLeads = state.leads.filter((item) => item.status === "NEW").length;
  const underReview = state.leads.filter((item) =>
    ["CONTACTED", "IN_PROGRESS"].includes(item.status),
  ).length;
  const converted = state.leads.filter(
    (item) => item.status === "CONVERTED",
  ).length;
  const closed = state.leads.filter((item) =>
    ["UNQUALIFIED", "CLOSED_LOST", "ARCHIVED"].includes(item.status),
  ).length;
  const conversionRate = state.leads.length
    ? Math.round((converted / state.leads.length) * 100)
    : 0;
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Partner workspace"
        title={`Welcome, ${state.me.user.firstName}`}
        description={`Track opportunities and agreements for ${state.me.partner.displayName}.`}
        action={
          <Link
            href="/partner/referral-links"
            className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white"
          >
            Share referral link
          </Link>
        }
      />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total referred" value={state.leads.length} tone="blue" />
        <Metric label="New" value={newLeads} tone="blue" />
        <Metric label="Under review" value={underReview} tone="amber" />
        <Metric label="Qualified" value={qualified} tone="emerald" />
        <Metric label="Converted" value={converted} tone="emerald" />
        <Metric label="Closed / disqualified" value={closed} tone="amber" />
        <Metric
          label="Conversion rate"
          value={conversionRate}
          suffix="%"
          tone="violet"
        />
        <Metric
          label="Active referral links"
          value={state.links.filter((item) => item.status === "ACTIVE").length}
          tone="violet"
        />
      </section>
      <section className="grid gap-5 lg:grid-cols-2">
        <Recent
          title="Recent leads"
          href="/partner/leads"
          items={state.leads
            .slice(0, 5)
            .map((item) => ({
              id: item.id,
              href: "/partner/leads",
              title: item.lead.companyName,
              detail: label(item.status),
            }))}
        />
        <Recent
          title="Agreements"
          href="/partner/contracts"
          items={state.contracts
            .slice(0, 5)
            .map((item) => ({
              id: item.id,
              href: `/partner/contracts/${item.id}`,
              title: item.title,
              detail: `${item.contractNumber} · ${label(item.status)}`,
            }))}
        />
      </section>
    </div>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      {action}
    </section>
  );
}
export function Loading() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
      Loading partner workspace…
    </div>
  );
}
function Metric({
  label: text,
  value,
  suffix,
  tone,
}: {
  label: string;
  value: number;
  suffix?: string;
  tone: string;
}) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    emerald: "bg-emerald-50 text-emerald-700",
    violet: "bg-violet-50 text-violet-700",
  };
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <span
        className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${colors[tone]}`}
      >
        {text}
      </span>
      <p className="mt-4 text-3xl font-semibold text-slate-950">
        {value.toLocaleString()}{suffix}
      </p>
    </article>
  );
}
function Recent({
  title,
  href,
  items,
}: {
  title: string;
  href: string;
  items: Array<{ id: string; href: string; title: string; detail: string }>;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex justify-between">
        <h2 className="font-semibold text-slate-950">{title}</h2>
        <Link href={href} className="text-xs font-semibold text-blue-700">
          View all
        </Link>
      </div>
      <div className="mt-4 divide-y divide-slate-100">
        {items.length ? (
          items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="block py-3"
            >
              <span className="block text-sm font-semibold text-slate-800">
                {item.title}
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">
                {item.detail}
              </span>
            </Link>
          ))
        ) : (
          <p className="py-5 text-sm text-slate-500">No records yet.</p>
        )}
      </div>
    </section>
  );
}
async function fetchJson(path: string) {
  const response = await fetch(`/api/partner/portal/${path}`);
  if (!response.ok) throw new Error("Unable to load partner data.");
  return response.json();
}
function label(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
