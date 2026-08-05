"use client";
import { useEffect, useState } from "react";
import { Loading, PageHeader } from "../partner-overview";

type Review = {
  id: string;
  status: string;
  submittedAt?: string;
  reviewerNotes?: string;
  rejectionReason?: string;
  lead: {
    companyName: string;
    fullName: string;
    workEmail: string;
    industry: string;
    updatedAt: string;
  };
};
export function PartnerLeads() {
  const [items, setItems] = useState<Review[] | null>(null);
  useEffect(() => {
    fetch("/api/partner/portal/leads")
      .then((r) => r.json())
      .then((p) => setItems(p.items ?? []));
  }, []);
  if (!items) return <Loading />;
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Attribution"
        title="My referred leads"
        description="Track leads captured through your DijiPeople referral links. Lead details are read-only."
      />
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Company</th>
                <th className="px-5 py-3">Contact</th>
                <th className="px-5 py-3">Industry</th>
                <th className="px-5 py-3">Review status</th>
                <th className="px-5 py-3">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-5 py-4">
                    <span className="font-semibold text-slate-900">
                      {item.lead.companyName}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="block font-medium">
                      {item.lead.fullName}
                    </span>
                    <span className="text-xs text-slate-500">
                      {item.lead.workEmail}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-slate-600">
                    {item.lead.industry}
                  </td>
                  <td className="px-5 py-4">
                    <Status value={item.status} />
                  </td>
                  <td className="px-5 py-4 text-slate-500">
                    {new Date(item.lead.updatedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!items.length ? (
          <p className="p-8 text-center text-sm text-slate-500">
            No attributed leads yet. Share an active referral link to the public
            request-demo form.
          </p>
        ) : null}
      </section>
    </div>
  );
}
export function Status({ value }: { value: string }) {
  const color = ["APPROVED", "CONVERTED"].includes(value)
    ? "bg-emerald-50 text-emerald-700"
    : ["REJECTED"].includes(value)
      ? "bg-rose-50 text-rose-700"
      : ["SUBMITTED", "UNDER_REVIEW"].includes(value)
        ? "bg-amber-50 text-amber-700"
        : "bg-blue-50 text-blue-700";
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${color}`}>
      {value.toLowerCase().replaceAll("_", " ")}
    </span>
  );
}
