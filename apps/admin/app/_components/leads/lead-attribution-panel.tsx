"use client";

import { useEffect, useRef, useState } from "react";
import { Handshake, LoaderCircle } from "lucide-react";
import {
  SearchableSelect,
} from "@/app/_components/runtime/runtime-form";
import { useRuntimeLookupOptions } from "@/lib/runtime/use-runtime-lookup-options";
import {
  createDebouncedCallback,
  LOOKUP_SEARCH_DEBOUNCE_MS,
} from "@/lib/runtime/lookup-search";

/*
 * TASK-0032 WP-04, item 4.
 *
 * `updateLead()` refuses a `partnerId` change through the generic PATCH this
 * record page otherwise submits — "Use the audited attribution-correction
 * action to change a lead partner" — so the field itself is read-only
 * (`platform-module-registry.ts`) and this panel is the only way to change
 * it, through `PATCH /super-admin/leads/:leadId/attribution`
 * (`LeadsService.correctAttribution`), which is audited and refuses an
 * inactive partner server-side.
 *
 * The lookup is filtered to `status=ACTIVE` for the same reason the field's
 * own `lookupPath` is: an operator should not be offered a partner the server
 * will refuse anyway.
 */

const LOOKUP_PATH = "/partners?pageSize=100&status=ACTIVE";

type LeadRecord = {
  id: string;
  partnerId?: string | null;
  partnerReferralLinkId?: string | null;
};

export function LeadAttributionPanel({
  record,
  onComplete,
}: {
  record: LeadRecord;
  onComplete?: () => void | Promise<void>;
}) {
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const [reason, setReason] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const debouncedRef = useRef<ReturnType<
    typeof createDebouncedCallback<[string]>
  > | null>(null);
  useEffect(() => {
    debouncedRef.current = createDebouncedCallback<[string]>(
      setQuery,
      LOOKUP_SEARCH_DEBOUNCE_MS,
    );
    return () => debouncedRef.current?.cancel();
  }, []);

  const lookup = useRuntimeLookupOptions(LOOKUP_PATH, query);
  const hasCurrentPartner = Boolean(record.partnerId);

  async function submit(nextPartnerId: string | null) {
    if (!reason.trim()) {
      setError("A reason is required.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/super-admin/leads/${encodeURIComponent(record.id)}/attribution`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(nextPartnerId ? { partnerId: nextPartnerId } : {}),
            reason: reason.trim(),
          }),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(payload?.message ?? "Unable to correct attribution.");
      setMessage(
        payload?.attributionUnchanged
          ? "No change — that partner is already attributed."
          : nextPartnerId
            ? "Partner attribution updated."
            : "Attribution removed.",
      );
      setReason("");
      setSelectedPartnerId("");
      await onComplete?.();
    } catch (reason_) {
      setError(
        reason_ instanceof Error
          ? reason_.message
          : "Unable to correct attribution.",
      );
    } finally {
      setBusy(false);
    }
  }

  function reassign() {
    if (!selectedPartnerId) {
      setError("Select a partner first.");
      return;
    }
    if (selectedPartnerId === record.partnerId) {
      setError("That partner is already attributed to this lead.");
      return;
    }
    if (
      !window.confirm(
        "Reassign this lead to the selected partner? This is recorded in the audit trail.",
      )
    )
      return;
    void submit(selectedPartnerId);
  }

  function remove() {
    if (
      !window.confirm(
        "Remove the partner attribution from this lead? This is recorded in the audit trail.",
      )
    )
      return;
    void submit(null);
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Handshake className="h-5 w-5 text-slate-500" aria-hidden />
        <h2 className="text-lg font-semibold text-slate-950">
          Partner attribution
        </h2>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <SearchableSelect
          ariaLabel="Partner"
          options={lookup.options}
          value={selectedPartnerId}
          placeholder={
            lookup.loading ? "Loading partners…" : "Select a partner"
          }
          onChange={(next) =>
            setSelectedPartnerId(Array.isArray(next) ? "" : next)
          }
          onQueryChange={(next) => debouncedRef.current?.run(next)}
          serverFiltered
          loading={lookup.loading}
        />
        <button
          type="button"
          onClick={reassign}
          disabled={busy || !selectedPartnerId}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Reassign
        </button>
      </div>
      <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-600">
        Reason
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={2}
          maxLength={500}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
        />
      </label>
      {hasCurrentPartner ? (
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="mt-3 inline-flex h-9 items-center rounded-xl border border-rose-200 px-3 text-sm font-semibold text-rose-700 transition disabled:cursor-not-allowed disabled:opacity-40"
        >
          Remove attribution
        </button>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {message}
        </p>
      ) : null}
    </section>
  );
}
