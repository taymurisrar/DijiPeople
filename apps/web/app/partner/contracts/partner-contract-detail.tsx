"use client";
import { useEffect, useState } from "react";
import { Loading, PageHeader } from "../partner-overview";
type Contract = {
  contractNumber: string;
  title: string;
  contractType: string;
  status: string;
  counterpartyName: string;
  effectiveDate?: string;
  expiryDate?: string;
  currentVersionNumber: number;
  updatedAt: string;
  signatureRequests: Array<{
    id: string;
    requestNumber: string;
    status: string;
    sentAt?: string;
    expiresAt?: string;
    completedAt?: string;
  }>;
};
export function PartnerContractDetail({ contractId }: { contractId: string }) {
  const [item, setItem] = useState<Contract | null>(null);
  useEffect(() => {
    fetch(`/api/partner/portal/contracts/${contractId}`)
      .then((r) => r.json())
      .then(setItem);
  }, [contractId]);
  if (!item) return <Loading />;
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={item.contractNumber}
        title={item.title}
        description={`${label(item.contractType)} · Version ${item.currentVersionNumber}`}
      />
      <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2 lg:grid-cols-4">
        <Detail label="Status" value={label(item.status)} />
        <Detail label="Counterparty" value={item.counterpartyName} />
        <Detail label="Effective" value={date(item.effectiveDate)} />
        <Detail label="Expires" value={date(item.expiryDate)} />
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-950">Signature requests</h2>
        <div className="mt-4 divide-y divide-slate-100">
          {item.signatureRequests.map((request) => (
            <div
              key={request.id}
              className="flex items-center justify-between py-3 text-sm"
            >
              <span>
                <span className="block font-semibold">
                  {request.requestNumber}
                </span>
                <span className="text-xs text-slate-500">
                  Sent {date(request.sentAt)} · Expires{" "}
                  {date(request.expiresAt)}
                </span>
              </span>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                {label(request.status)}
              </span>
            </div>
          ))}
          {!item.signatureRequests.length ? (
            <p className="py-5 text-sm text-slate-500">
              No signature request has been issued.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
function date(value?: string) {
  return value ? new Date(value).toLocaleDateString() : "Not set";
}
function label(v: string) {
  return v
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
}
