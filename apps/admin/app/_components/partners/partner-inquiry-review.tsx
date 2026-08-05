"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ModuleActionBar } from "@/app/_components/runtime/module-action-bar";
import type { RuntimeActionDefinition } from "@/lib/runtime/platform-runtime.types";

type Inquiry = {
  id: string;
  referenceNumber: string;
  status: string;
  type: string;
  companyName?: string | null;
  contactFirstName: string;
  contactLastName: string;
  email: string;
  phone?: string | null;
  country?: string | null;
  website?: string | null;
  message?: string | null;
  source?: string | null;
  qualificationNotes?: string | null;
  assignedToUserId?: string | null;
  createdAt: string;
  partner?: { id: string; displayName: string } | null;
};
type Owner = { id: string; fullName: string; email: string; role: string };

const ACTIONS: RuntimeActionDefinition[] = [
  {
    key: "back",
    label: "Back",
    scope: "record",
    selection: "none",
    placement: "secondary",
  },
  {
    key: "approve",
    label: "Qualify and invite",
    scope: "record",
    selection: "none",
    placement: "primary",
  },
  {
    key: "reject",
    label: "Reject inquiry",
    scope: "record",
    selection: "none",
    placement: "secondary",
    destructive: true,
    confirmTitle: "Reject this partner inquiry?",
  },
];

export function PartnerInquiryReview({
  initialItem,
  owners,
}: {
  initialItem: Inquiry;
  owners: Owner[];
}) {
  const router = useRouter();
  const [item, setItem] = useState(initialItem);
  const [notes, setNotes] = useState(initialItem.qualificationNotes ?? "");
  const [assignedToUserId, setAssignedToUserId] = useState(
    initialItem.assignedToUserId ?? "",
  );

  async function act(action: RuntimeActionDefinition) {
    if (action.key === "back") {
      router.push("/partner-inquiries");
      return;
    }
    const decision = action.key === "approve" ? "qualify" : "reject";
    const response = await fetch(
      `/api/partner-experience/inquiries/${item.id}/${decision}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes,
          assignedToUserId: assignedToUserId || undefined,
        }),
      },
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(payload?.message ?? "Unable to review partner inquiry.");
    if (decision === "qualify" && payload.partner) {
      setItem((current) => ({
        ...current,
        status: "CONVERTED",
        partner: payload.partner,
      }));
      return {
        success: true,
        message: "Partner created and onboarding invitation emailed.",
      };
    }
    setItem((current) => ({ ...current, status: "REJECTED" }));
    return { success: true, message: "Partner inquiry rejected." };
  }

  const fields = [
    ["Contact", `${item.contactFirstName} ${item.contactLastName}`],
    ["Business email", item.email],
    ["Phone", item.phone],
    ["Country", item.country],
    ["Website", item.website],
    ["Partner type", item.type],
    ["Source", item.source],
    ["Received", new Date(item.createdAt).toLocaleString()],
  ];
  const closed = ["CONVERTED", "REJECTED"].includes(item.status);
  return (
    <main className="space-y-5">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <Link
          href="/partner-inquiries"
          className="text-xs font-semibold text-[var(--admin-primary)]"
        >
          Partner inquiries
        </Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
              {item.referenceNumber}
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-950">
              {item.companyName ||
                `${item.contactFirstName} ${item.contactLastName}`}
            </h1>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
            {label(item.status)}
          </span>
        </div>
      </section>
      <ModuleActionBar
        actions={closed ? ACTIONS.slice(0, 1) : ACTIONS}
        context={{
          scope: "record",
          mode: "read",
          record: item as unknown as Record<string, unknown>,
        }}
        onAction={act}
      />
      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-slate-950">Inquiry details</h2>
          <dl className="mt-4 grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:grid-cols-2">
            {fields.map(([name, value]) => (
              <div key={String(name)} className="bg-white p-4">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {name}
                </dt>
                <dd className="mt-1 break-words text-sm text-slate-900">
                  {value || "—"}
                </dd>
              </div>
            ))}
          </dl>
          {item.message ? (
            <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
              {item.message}
            </div>
          ) : null}
        </div>
        <div className="rounded-3xl border border-blue-200 bg-blue-50/60 p-6">
          <h2 className="font-semibold text-blue-950">Qualification</h2>
          <label className="mt-4 grid gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
            Assigned owner
            <select
              value={assignedToUserId}
              onChange={(event) => setAssignedToUserId(event.target.value)}
              disabled={closed}
              className="h-11 rounded-xl border border-blue-200 bg-white px-3 text-sm font-normal normal-case tracking-normal text-slate-900"
            >
              <option value="">Unassigned</option>
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.fullName} · {owner.role}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-4 grid gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
            Decision notes
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              disabled={closed}
              rows={7}
              className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
            />
          </label>
          {item.partner ? (
            <Link
              href={`/partners/${item.partner.id}`}
              className="mt-4 inline-flex rounded-xl bg-white px-3 py-2 text-sm font-semibold text-blue-700"
            >
              Open {item.partner.displayName}
            </Link>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function label(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
