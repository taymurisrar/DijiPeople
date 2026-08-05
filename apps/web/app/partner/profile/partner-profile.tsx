"use client";
import { useEffect, useState } from "react";
import { Loading, PageHeader } from "../partner-overview";
type Me = {
  user: { firstName: string; lastName: string; email: string };
  partner: {
    displayName: string;
    code: string;
    type: string;
    status: string;
    companyName?: string;
    email: string;
    phone?: string;
    country?: string;
    website?: string;
    defaultCommissionRate: string;
    currencyCode: string;
  };
};
export function PartnerProfile() {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    fetch("/api/partner/portal/me")
      .then((r) => r.json())
      .then(setMe);
  }, []);
  if (!me) return <Loading />;
  const rows = [
    ["Partner name", me.partner.displayName],
    ["Partner code", me.partner.code],
    ["Type", label(me.partner.type)],
    ["Status", label(me.partner.status)],
    ["Primary email", me.partner.email],
    ["Phone", me.partner.phone ?? "Not set"],
    ["Country", me.partner.country ?? "Not set"],
    ["Website", me.partner.website ?? "Not set"],
    ["Default commission", `${me.partner.defaultCommissionRate}%`],
    ["Commission currency", me.partner.currencyCode],
    ["Portal user", `${me.user.firstName} ${me.user.lastName}`],
    ["Sign-in email", me.user.email],
  ];
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Organization"
        title="Partner profile"
        description="Verified partner identity and commercial defaults maintained by DijiPeople."
      />
      <section className="grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 shadow-sm sm:grid-cols-2">
        {rows.map(([key, value]) => (
          <div key={key} className="bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {key}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
          </div>
        ))}
      </section>
      <p className="text-xs text-slate-500">
        Contact DijiPeople partner operations to update verified legal or payout
        details.
      </p>
    </div>
  );
}
function label(v: string) {
  return v
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
}
