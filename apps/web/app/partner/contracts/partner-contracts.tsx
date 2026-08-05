"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Loading, PageHeader } from "../partner-overview";
type Contract = {
  id: string;
  contractNumber: string;
  title: string;
  contractType: string;
  status: string;
  effectiveDate?: string;
  expiryDate?: string;
  updatedAt: string;
  signatureRequests: Array<{ status: string; expiresAt?: string }>;
};
export function PartnerContracts() {
  const [items, setItems] = useState<Contract[] | null>(null);
  useEffect(() => {
    fetch("/api/partner/portal/contracts")
      .then((r) => r.json())
      .then((p) => setItems(p.items ?? []));
  }, []);
  if (!items) return <Loading />;
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Agreements"
        title="Contracts"
        description="Review agreement status, effective dates, and signature progress."
      />
      <section className="grid gap-3">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/partner/contracts/${item.id}`}
            className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <span className="text-xs font-semibold text-blue-700">
                {item.contractNumber}
              </span>
              <h2 className="mt-1 font-semibold text-slate-950">
                {item.title}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {label(item.contractType)} · Updated{" "}
                {new Date(item.updatedAt).toLocaleDateString()}
              </p>
            </div>
            <span className="w-fit rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
              {label(item.status)}
            </span>
          </Link>
        ))}
        {!items.length ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            No agreements are available yet.
          </p>
        ) : null}
      </section>
    </div>
  );
}
function label(v: string) {
  return v
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
}
