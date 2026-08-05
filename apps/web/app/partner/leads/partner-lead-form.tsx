"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Loading, PageHeader } from "../partner-overview";
import { Status } from "./partner-leads";

type Values = Record<string, string | number>;
type PartnerLeadReview = {
  id: string;
  status: string;
  reviewerNotes?: string | null;
  rejectionReason?: string | null;
  lead: Values;
};
const fields = [
  ["contactFirstName", "Contact first name"],
  ["contactLastName", "Contact last name"],
  ["companyName", "Company name"],
  ["workEmail", "Work email"],
  ["phoneNumber", "Phone"],
  ["companyWebsite", "Website"],
  ["industry", "Industry"],
  ["companySize", "Company size"],
  ["country", "Country"],
  ["estimatedEmployeeCount", "Estimated employees"],
  ["expectedGoLiveDate", "Expected go-live"],
  ["budgetExpectation", "Budget expectation"],
  ["requirementsSummary", "Requirements summary"],
  ["notes", "Notes"],
] as const;
export function PartnerLeadForm({ reviewId }: { reviewId?: string }) {
  const router = useRouter();
  const [record, setRecord] = useState<PartnerLeadReview | null | false>(
    reviewId ? null : { id: "", status: "DRAFT", lead: {} },
  );
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    if (!reviewId) return;
    fetch("/api/partner/portal/leads")
      .then((r) => r.json())
      .then((payload: { items?: PartnerLeadReview[] }) =>
        setRecord(payload.items?.find((item) => item.id === reviewId) ?? false),
      );
  }, [reviewId]);
  if (record === null) return <Loading />;
  if (record === false)
    return (
      <PageHeader
        eyebrow="Partner lead"
        title="Lead not found"
        description="This record is not available to your partner organization."
      />
    );
  const editable =
    !reviewId || ["DRAFT", "CHANGES_REQUESTED"].includes(record.status);
  const values = record.lead ?? {};
  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const data = new FormData(event.currentTarget);
    const body = Object.fromEntries(
      fields.map(([key]) => [key, data.get(key) || undefined]),
    ) as Record<string, string | number | undefined>;
    body.estimatedEmployeeCount =
      Number(body.estimatedEmployeeCount) || undefined;
    startTransition(async () => {
      const response = await fetch(
        `/api/partner/portal/leads${reviewId ? `/${reviewId}` : ""}`,
        {
          method: reviewId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | (PartnerLeadReview & { message?: string | string[] })
        | null;
      if (!response.ok) {
        setMessage(
          Array.isArray(payload?.message)
            ? payload.message.join(", ")
            : (payload?.message ?? "Unable to save lead."),
        );
        return;
      }
      setMessage("Lead saved.");
      if (!reviewId && payload) router.replace(`/partner/leads/${payload.id}`);
      router.refresh();
    });
  }
  function submit() {
    startTransition(async () => {
      const response = await fetch(
        `/api/partner/portal/leads/${reviewId}/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | (PartnerLeadReview & { message?: string })
        | null;
      if (!response.ok) {
        setMessage(payload?.message ?? "Unable to submit lead.");
        return;
      }
      if (payload) setRecord(payload);
      setMessage("Lead submitted for internal review and is now locked.");
    });
  }
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Partner lead"
        title={reviewId ? String(values.companyName ?? "Partner lead") : "Create lead"}
        description={
          reviewId
            ? "Review the opportunity and internal decision status."
            : "Capture a qualified referral before submitting it for review."
        }
        action={record.status ? <Status value={record.status} /> : undefined}
      />
      {record.reviewerNotes || record.rejectionReason ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Reviewer feedback: {record.reviewerNotes ?? record.rejectionReason}
        </p>
      ) : null}
      <form
        onSubmit={save}
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <fieldset
          disabled={!editable || pending}
          className="grid gap-4 md:grid-cols-2"
        >
          {fields.map(([key, label]) => (
            <label
              key={key}
              className={`grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 ${["requirementsSummary", "notes"].includes(key) ? "md:col-span-2" : ""}`}
            >
              {label}
              {["requirementsSummary", "notes"].includes(key) ? (
                <textarea
                  name={key}
                  defaultValue={values[key] ?? ""}
                  rows={4}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
                />
              ) : (
                <input
                  name={key}
                  required={[
                    "contactFirstName",
                    "contactLastName",
                    "companyName",
                    "workEmail",
                    "industry",
                    "companySize",
                  ].includes(key)}
                  type={
                    key === "workEmail"
                      ? "email"
                      : key === "estimatedEmployeeCount"
                        ? "number"
                        : key === "expectedGoLiveDate"
                          ? "date"
                          : "text"
                  }
                  defaultValue={
                    key === "expectedGoLiveDate" && values[key]
                      ? String(values[key]).slice(0, 10)
                      : (values[key] ?? "")
                  }
                  className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-normal normal-case tracking-normal text-slate-900"
                />
              )}
            </label>
          ))}
        </fieldset>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            {message ??
              (!editable
                ? "Submitted records are read-only until changes are requested."
                : "Save your draft before submitting.")}
          </p>
          <div className="flex gap-2">
            {editable ? (
              <button
                disabled={pending}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold"
              >
                Save draft
              </button>
            ) : null}
            {reviewId && editable ? (
              <button
                type="button"
                onClick={submit}
                disabled={pending}
                className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white"
              >
                Submit for review
              </button>
            ) : null}
          </div>
        </div>
      </form>
    </div>
  );
}
