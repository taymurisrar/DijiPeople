"use client";
/* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount sets state after awaits; the one-shot load is intended */

import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";

/**
 * The rates the Control Hub converts money with.
 *
 * Live rates come from open.er-api.com and are refreshed daily; an operator can
 * override any one of them and that override survives every subsequent refresh
 * until it is explicitly cleared. Both facts are on the screen, because a
 * converted revenue figure is only as trustworthy as the rate behind it and
 * "where did this number come from?" should be answerable here.
 *
 * A currency appears in this table when the platform holds money in it —
 * payments, invoices or partner commissions — so every row is something the
 * operator could be asked about. A currency with no row is money the dashboard
 * reports separately as unconvertible rather than counting at par.
 */

type Rate = {
  currency: string;
  rate: number;
  source: string;
  provider: string | null;
  fetchedAt: string | null;
  manualOverride: boolean;
  overrideReason: string | null;
};

type Payload = { base: string; rates: Rate[]; ratesAsOf: string | null };

const ENDPOINT = "/api/super-admin/platform-settings/exchange-rates";

export function ExchangeRatesManager({ base }: { base: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftRate, setDraftRate] = useState("");
  const [draftReason, setDraftReason] = useState("");
  const [busyCurrency, setBusyCurrency] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(ENDPOINT, { cache: "no-store" });
    if (response.status === 403) {
      setDenied(true);
      return;
    }
    const payload = (await response.json().catch(() => null)) as Payload | null;
    if (!payload) {
      setError("Rates could not be read. Reload the page to try again.");
      return;
    }
    setData(payload);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    const response = await fetch(`${ENDPOINT}/refresh`, { method: "POST" });
    setRefreshing(false);
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setError(
        payload?.message ??
          "The rate provider could not be reached. The rates already stored are unchanged.",
      );
      return;
    }
    await load();
  }, [load]);

  const saveOverride = useCallback(
    async (currency: string) => {
      const rate = Number(draftRate);
      if (!Number.isFinite(rate) || rate <= 0) {
        setError("An exchange rate must be a positive number.");
        return;
      }
      if (draftReason.trim().length < 3) {
        setError("Say why this rate is being set — the audit entry carries it.");
        return;
      }
      setBusyCurrency(currency);
      setError(null);
      const response = await fetch(
        `${ENDPOINT}/${encodeURIComponent(currency)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rate, reason: draftReason.trim() }),
        },
      );
      setBusyCurrency(null);
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(payload?.message ?? "The rate could not be saved.");
        return;
      }
      setEditing(null);
      setDraftRate("");
      setDraftReason("");
      await load();
    },
    [draftRate, draftReason, load],
  );

  const clearOverride = useCallback(
    async (currency: string) => {
      setBusyCurrency(currency);
      setError(null);
      const response = await fetch(
        `${ENDPOINT}/${encodeURIComponent(currency)}`,
        { method: "DELETE" },
      );
      setBusyCurrency(null);
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(payload?.message ?? "The override could not be cleared.");
        return;
      }
      await load();
    },
    [load],
  );

  if (denied)
    return (
      <p className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
        You need the <code>settings.read</code> permission to view exchange
        rates.
      </p>
    );

  if (data === null)
    return (
      <p className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-6 text-sm text-slate-500 shadow-sm">
        <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" />
        Loading rates against {base}…
      </p>
    );

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            Rates against {data.base}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
            {data.ratesAsOf
              ? `Live rates last fetched ${new Date(data.ratesAsOf).toLocaleString()}. They refresh automatically once a day.`
              : "No rates have been fetched yet. Refresh to fetch them, or set one by hand."}
          </p>
        </div>
        <button
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
          disabled={refreshing}
          onClick={refresh}
          type="button"
        >
          {refreshing ? (
            <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw aria-hidden className="h-4 w-4" />
          )}
          Refresh rates now
        </button>
      </div>

      {error ? (
        <p
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {data.rates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-600">
          No rates yet. Refresh to fetch the currencies the platform holds money
          in — until then, money in any other currency is reported separately on
          the dashboard rather than converted.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">
              Exchange rates against {data.base}
            </caption>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 font-medium" scope="col">
                  Currency
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  Rate
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  Source
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  Updated
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {data.rates.map((rate) => {
                const busy = busyCurrency === rate.currency;
                const isEditing = editing === rate.currency;
                return (
                  <tr className="border-t border-slate-100" key={rate.currency}>
                    <th
                      className="px-3 py-3 text-left font-semibold text-slate-900"
                      scope="row"
                    >
                      {rate.currency}
                    </th>
                    <td className="px-3 py-3 text-slate-700">
                      {isEditing ? (
                        <div className="grid gap-2 sm:max-w-md">
                          <label className="grid gap-1 text-xs font-medium text-slate-600">
                            1 {rate.currency} in {data.base}
                            <input
                              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
                              inputMode="decimal"
                              onChange={(event) =>
                                setDraftRate(event.target.value)
                              }
                              value={draftRate}
                            />
                          </label>
                          <label className="grid gap-1 text-xs font-medium text-slate-600">
                            Why
                            <input
                              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
                              onChange={(event) =>
                                setDraftReason(event.target.value)
                              }
                              placeholder="Contracted rate for August"
                              value={draftReason}
                            />
                          </label>
                        </div>
                      ) : (
                        <>
                          1 {rate.currency} ={" "}
                          <span className="font-semibold text-slate-950">
                            {rate.rate}
                          </span>{" "}
                          {data.base}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {/* The badge carries text, not colour alone. */}
                      {rate.manualOverride ? (
                        <span
                          className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900"
                          title={rate.overrideReason ?? undefined}
                        >
                          Manual
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                          Live
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {rate.fetchedAt
                        ? new Date(rate.fetchedAt).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        {isEditing ? (
                          <>
                            <button
                              className="rounded-lg bg-slate-950 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40"
                              disabled={busy}
                              onClick={() => saveOverride(rate.currency)}
                              type="button"
                            >
                              {busy ? "Saving…" : "Save rate"}
                            </button>
                            <button
                              className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                              onClick={() => setEditing(null)}
                              type="button"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                              onClick={() => {
                                setEditing(rate.currency);
                                setDraftRate(String(rate.rate));
                                setDraftReason(rate.overrideReason ?? "");
                                setError(null);
                              }}
                              type="button"
                            >
                              Set by hand
                            </button>
                            {rate.manualOverride ? (
                              <button
                                className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40"
                                disabled={busy}
                                onClick={() => clearOverride(rate.currency)}
                                type="button"
                              >
                                {busy ? "Working…" : "Use live rate"}
                              </button>
                            ) : null}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
