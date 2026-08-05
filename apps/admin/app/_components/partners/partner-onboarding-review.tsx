"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ModuleActionBar } from "@/app/_components/runtime/module-action-bar";
import type { RuntimeActionDefinition } from "@/lib/runtime/platform-runtime.types";
type Item = {
  id: string;
  status: string;
  submittedAt?: string;
  reviewNotes?: string;
  partner: { id: string; displayName: string; email: string; status: string };
  submissions: Array<{
    id: string;
    version: number;
    submittedAt: string;
    data: Record<string, unknown>;
  }>;
};
export function PartnerOnboardingReview({
  applicationId,
}: {
  applicationId: string;
}) {
  const router = useRouter();
  const [item, setItem] = useState<Item | null>(null);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch(`/api/platform-runtime/partner-onboarding/${applicationId}`)
      .then((r) => r.json())
      .then((p) => setItem(p.item));
  }, [applicationId]);
  useEffect(() => {
    load();
  }, [load]);
  async function decide(decision: string) {
    const response = await fetch(
      `/api/partner-experience/onboarding/${applicationId}/${decision}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      },
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(payload?.message ?? "Unable to review onboarding.");
    const nextMessage = `Onboarding ${decision === "approve" ? "approved" : decision === "changes" ? "returned for changes" : "rejected"}.`;
    setMessage(nextMessage);
    load();
    return { success: true, message: nextMessage };
  }
  if (!item)
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
        Loading partner onboarding…
      </div>
    );
  const submission = item.submissions[0];
  return (
    <main className="space-y-5">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <Link
          href="/partner-onboarding"
          className="text-xs font-semibold text-[var(--admin-primary)]"
        >
          ← Partner onboarding
        </Link>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
              Application review
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-950">
              {item.partner.displayName}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {item.partner.email} · Submission version{" "}
              {submission?.version ?? "—"}
            </p>
          </div>
          <span className="w-fit rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
            {label(item.status)}
          </span>
        </div>
      </section>
      <ModuleActionBar
        actions={
          [
            {
              key: "back",
              label: "Back",
              scope: "record",
              selection: "none",
              placement: "secondary",
            },
            {
              key: "changes",
              label: "Request changes",
              scope: "record",
              selection: "none",
              placement: "secondary",
            },
            {
              key: "reject",
              label: "Reject",
              scope: "record",
              selection: "none",
              placement: "secondary",
              destructive: true,
              confirmTitle: "Reject this onboarding application?",
            },
            {
              key: "approve",
              label: "Approve information",
              scope: "record",
              selection: "none",
              placement: "primary",
            },
          ] as RuntimeActionDefinition[]
        }
        context={{
          scope: "record",
          mode: "read",
          record: item as unknown as Record<string, unknown>,
        }}
        onAction={(action) => {
          if (action.key === "back") return router.push("/partner-onboarding");
          if (!submission)
            throw new Error("The partner has not submitted information yet.");
          return decide(action.key);
        }}
      />
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-semibold text-slate-950">
          Submitted partner information
        </h2>
        {submission ? (
          <div className="mt-4 grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 md:grid-cols-2">
            {Object.entries(submission.data).map(([key, value]) => (
              <div key={key} className="bg-white p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {label(key)}
                </p>
                <p className="mt-1 break-words text-sm text-slate-900">
                  {typeof value === "object"
                    ? JSON.stringify(value)
                    : String(value ?? "—")}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
            The partner has not submitted information yet.
          </p>
        )}
      </section>
      <section className="rounded-3xl border border-blue-200 bg-blue-50 p-5">
        <label className="grid gap-2 text-xs font-semibold uppercase tracking-wide text-blue-900">
          Review notes
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
            placeholder="Explain approval, requested changes, or rejection"
          />
        </label>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-600">
            {message ??
              "Decisions are recorded against the onboarding application."}
          </p>
        </div>
      </section>
    </main>
  );
}
function label(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
}
