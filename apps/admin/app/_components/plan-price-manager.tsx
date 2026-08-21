"use client";

import { useMemo, useState, useTransition } from "react";
import {
  CheckCircle2,
  Loader2,
  Plus,
  Power,
  Save,
  XCircle,
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { SUPPORTED_CURRENCIES } from "@/lib/form-options";

type BillingCycle = "MONTHLY" | "ANNUAL";

export type PlanPriceRecord = {
  id: string;
  planId: string;
  billingCycle: BillingCycle;
  currency: string;
  unitAmount: number;
  billingModel: "PER_SEAT" | "FLAT";
  billingInterval: "MONTH" | "YEAR";
  minimumSeats: number;
  maximumSeats: number | null;
  includedSeats: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
  version?: number;
  supersedesPriceId?: string | null;
  stripeProductId: string | null;
  stripePriceId: string | null;
  stripeEnvironment: "TEST" | "LIVE" | null;
  stripeSyncStatus: string;
  stripeVerifiedAt: string | null;
  checkoutReadinessReasons?: string[];
  isActive: boolean;
  subscriptionCount: number;
  isCheckoutReady: boolean;
  canDelete: boolean;
};

type PlanPriceManagerProps = {
  planId: string;
  initialPrices: PlanPriceRecord[];
  defaultCurrency: string;
};

type DraftPrice = {
  billingCycle: BillingCycle;
  billingModel: "PER_SEAT" | "FLAT";
  currency: string;
  unitAmount: string;
  minimumSeats: string;
  maximumSeats: string;
  includedSeats: string;
  stripePriceId: string;
  isActive: boolean;
};

const emptyDraft = (currency: string): DraftPrice => ({
  billingCycle: "MONTHLY",
  billingModel: "PER_SEAT",
  currency: normalizeCurrencyOption(currency),
  unitAmount: "0",
  minimumSeats: "1",
  maximumSeats: "",
  includedSeats: "0",
  stripePriceId: "",
  isActive: true,
});

export function PlanPriceManager({
  planId,
  initialPrices,
  defaultCurrency,
}: PlanPriceManagerProps) {
  const [prices, setPrices] = useState(initialPrices);
  const [draft, setDraft] = useState<DraftPrice>(() =>
    emptyDraft(defaultCurrency),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<DraftPrice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const groupedPrices = useMemo(() => {
    return prices.reduce<Record<string, PlanPriceRecord[]>>((groups, price) => {
      groups[price.currency] = [...(groups[price.currency] ?? []), price];
      return groups;
    }, {});
  }, [prices]);

  function beginEdit(price: PlanPriceRecord) {
    setEditingId(price.id);
    setEditingDraft({
      billingCycle: price.billingCycle,
      billingModel: price.billingModel,
      currency: price.currency,
      unitAmount: String(price.unitAmount),
      minimumSeats: String(price.minimumSeats),
      maximumSeats:
        price.maximumSeats === null ? "" : String(price.maximumSeats),
      includedSeats: String(price.includedSeats),
      stripePriceId: price.stripePriceId ?? "",
      isActive: price.isActive,
    });
    setError(null);
  }

  function saveDraft() {
    setError(null);
    const validationError = validateDraft(draft);
    if (validationError) {
      setError(validationError);
      return;
    }

    setActionId("create");
    startTransition(async () => {
      try {
        const created = await requestJson<PlanPriceRecord>(
          `/api/super-admin/plans/${planId}/prices`,
          {
            method: "POST",
            body: JSON.stringify(toPayload(draft)),
          },
        );
        setPrices((current) =>
          applyActivePriceChange([...current, created], created),
        );
        setDraft(emptyDraft(defaultCurrency));
      } catch (requestError) {
        setError(getErrorMessage(requestError, "Unable to create price."));
      } finally {
        setActionId(null);
      }
    });
  }

  function saveEdit(priceId: string) {
    if (!editingDraft) return;
    setError(null);
    const validationError = validateDraft(editingDraft);
    if (validationError) {
      setError(validationError);
      return;
    }

    setActionId(priceId);
    startTransition(async () => {
      try {
        const updated = await requestJson<PlanPriceRecord>(
          `/api/super-admin/plans/${planId}/prices/${priceId}`,
          {
            method: "PATCH",
            body: JSON.stringify(toPayload(editingDraft)),
          },
        );
        setPrices((current) =>
          applyActivePriceChange(
            current.map((price) => (price.id === priceId ? updated : price)),
            updated,
          ),
        );
        setEditingId(null);
        setEditingDraft(null);
      } catch (requestError) {
        setError(getErrorMessage(requestError, "Unable to update price."));
      } finally {
        setActionId(null);
      }
    });
  }

  function deactivatePrice(priceId: string) {
    setError(null);
    setActionId(priceId);
    startTransition(async () => {
      try {
        const updated = await requestJson<PlanPriceRecord>(
          `/api/super-admin/plans/${planId}/prices/${priceId}`,
          { method: "DELETE" },
        );
        setPrices((current) =>
          current.map((price) => (price.id === priceId ? updated : price)),
        );
      } catch (requestError) {
        setError(getErrorMessage(requestError, "Unable to deactivate price."));
      } finally {
        setActionId(null);
      }
    });
  }

  return (
    <div className="space-y-5">
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <section className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 xl:items-end">
          <PriceFields
            draft={draft}
            onChange={setDraft}
            disabled={isPending}
            note={
              draft.isActive &&
              hasOtherActivePrice(prices, draft.billingCycle, draft.currency)
                ? "This will become the current checkout price. Existing active price will be deactivated."
                : undefined
            }
          />
          <button
            type="button"
            onClick={saveDraft}
            disabled={isPending}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {actionId === "create" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add price
          </button>
        </div>
      </section>

      {prices.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-slate-200 bg-white px-6 py-10 text-center">
          <p className="text-base font-semibold text-slate-950">
            No PlanPrice rows configured
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Add a currency and billing-cycle price to enable Stripe Checkout.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedPrices).map(([currency, rows]) => (
            <section
              key={currency}
              className="overflow-hidden rounded-[24px] border border-slate-200 bg-white"
            >
              <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
                <p className="text-sm font-semibold text-slate-950">
                  {currency}
                </p>
              </div>

              <div className="overflow-x-auto">
                <div className="min-w-[860px] divide-y divide-slate-100">
                  {rows.map((price) => {
                    const isEditing = editingId === price.id;
                    const draftValue = isEditing ? editingDraft : null;

                    return (
                      <article key={price.id} className="p-5">
                        {isEditing && draftValue ? (
                          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 xl:items-end">
                            <PriceFields
                              draft={draftValue}
                              onChange={setEditingDraft}
                              disabled={isPending}
                              note={
                                draftValue.isActive &&
                                hasOtherActivePrice(
                                  prices,
                                  draftValue.billingCycle,
                                  draftValue.currency,
                                  price.id,
                                )
                                  ? "This will become the current checkout price. Existing active price will be deactivated."
                                  : undefined
                              }
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => saveEdit(price.id)}
                                disabled={isPending}
                                className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                              >
                                {actionId === price.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Save className="h-4 w-4" />
                                )}
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(null);
                                  setEditingDraft(null);
                                }}
                                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="grid gap-4 xl:grid-cols-[130px_180px_minmax(260px,1fr)_160px_150px_180px] xl:items-center">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                Cycle
                              </p>
                              <p className="mt-1 font-semibold text-slate-950">
                                {formatEnum(price.billingCycle)}
                              </p>
                              <p className="mt-0.5 text-xs text-slate-400">
                                Version {price.version ?? 1}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {price.billingModel === "PER_SEAT"
                                  ? `Per seat · minimum ${price.minimumSeats}`
                                  : "Flat recurring price"}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                Amount
                              </p>
                              <p className="mt-1 font-semibold text-slate-950">
                                {formatCurrency(
                                  price.unitAmount,
                                  price.currency,
                                )}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                Stripe Price ID
                              </p>
                              <p className="mt-1 break-all font-mono text-xs text-slate-700">
                                {price.stripePriceId ?? "Missing"}
                              </p>
                            </div>
                            <div>
                              <CheckoutReadyBadge price={price} />
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                Subscriptions
                              </p>
                              <p className="mt-1 text-sm font-semibold text-slate-950">
                                {price.subscriptionCount}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2 xl:justify-end">
                              <button
                                type="button"
                                onClick={() => beginEdit(price)}
                                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                              >
                                Edit
                              </button>
                              {price.isActive ? (
                                <button
                                  type="button"
                                  onClick={() => deactivatePrice(price.id)}
                                  disabled={isPending}
                                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {actionId === price.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Power className="h-3.5 w-3.5" />
                                  )}
                                  Deactivate
                                </button>
                              ) : null}
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function PriceFields({
  draft,
  onChange,
  disabled,
  note,
}: {
  draft: DraftPrice;
  onChange: (draft: DraftPrice) => void;
  disabled?: boolean;
  note?: string;
}) {
  return (
    <>
      <label className="block text-sm font-medium text-slate-700">
        Pricing model
        <select
          value={draft.billingModel}
          disabled={disabled}
          onChange={(event) => {
            const billingModel = event.target
              .value as DraftPrice["billingModel"];
            onChange({
              ...draft,
              billingModel,
              minimumSeats: billingModel === "FLAT" ? "1" : draft.minimumSeats,
              maximumSeats: billingModel === "FLAT" ? "" : draft.maximumSeats,
              includedSeats:
                billingModel === "FLAT" ? "0" : draft.includedSeats,
            });
          }}
          className="mt-1.5 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[var(--admin-primary)]"
        >
          <option value="FLAT">Flat recurring</option>
          <option value="PER_SEAT">Per seat</option>
        </select>
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Billing interval
        <select
          value={draft.billingCycle}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...draft,
              billingCycle: event.target.value as BillingCycle,
            })
          }
          className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900"
        >
          <option value="MONTHLY">Monthly</option>
          <option value="ANNUAL">Annual</option>
        </select>
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Currency
        <select
          value={draft.currency}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...draft, currency: event.target.value.toUpperCase() })
          }
          className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm uppercase text-slate-900 outline-none transition focus:border-slate-900"
        >
          {SUPPORTED_CURRENCIES.map((currency) => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium text-slate-700">
        {draft.billingModel === "PER_SEAT"
          ? "Price per seat"
          : "Recurring amount"}
        <input
          min="0.01"
          step="0.01"
          type="number"
          value={draft.unitAmount}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...draft, unitAmount: event.target.value })
          }
          className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900"
        />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Minimum seats
        <input
          min="1"
          step="1"
          type="number"
          value={draft.minimumSeats}
          disabled={disabled || draft.billingModel === "FLAT"}
          onChange={(event) =>
            onChange({ ...draft, minimumSeats: event.target.value })
          }
          className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
        />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Maximum seats (optional)
        <input
          min={draft.minimumSeats || "1"}
          step="1"
          type="number"
          value={draft.maximumSeats}
          disabled={disabled || draft.billingModel === "FLAT"}
          onChange={(event) =>
            onChange({ ...draft, maximumSeats: event.target.value })
          }
          className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
        />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Included seats
        <input
          min="0"
          step="1"
          type="number"
          value={draft.includedSeats}
          disabled={disabled || draft.billingModel === "FLAT"}
          onChange={(event) =>
            onChange({ ...draft, includedSeats: event.target.value })
          }
          className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
        />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Stripe Price ID (optional)
        <input
          value={draft.stripePriceId}
          placeholder="price_..."
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...draft, stripePriceId: event.target.value })
          }
          className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 font-mono text-sm text-slate-900 outline-none transition focus:border-slate-900"
        />
        <span className="mt-1 block text-xs text-slate-500">
          Leave blank to create and verify a replacement Stripe Price.
        </span>
      </label>
      <label className="flex h-[46px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700">
        <input
          type="checkbox"
          checked={draft.isActive}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...draft, isActive: event.target.checked })
          }
          className="h-4 w-4 rounded border-slate-300"
        />
        Active
      </label>
      {note ? (
        <p className="text-sm font-medium text-amber-700 lg:col-span-full">
          {note}
        </p>
      ) : null}
    </>
  );
}

function CheckoutReadyBadge({ price }: { price: PlanPriceRecord }) {
  if (price.isActive && price.isCheckoutReady) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Current checkout price
      </span>
    );
  }

  if (price.isActive) {
    /*
     * The reasons, on the page.
     *
     * `deriveCheckoutReadiness` computes up to ten specific causes — no Stripe
     * price id, wrong environment, never verified, recurring interval mismatch
     * — the API returns every one of them, and this rendered them in a `title`
     * attribute. A tooltip is invisible on touch, unreachable by keyboard, and
     * inconsistently announced, so in practice the answer to "why can this plan
     * not be bought" was computed, transmitted, and then hidden.
     *
     * That matters beyond tidiness: the public wizard tells a visitor to
     * contact us and we will arrange it, and this is the screen where somebody
     * has to find out what to arrange.
     */
    const reasons = price.checkoutReadinessReasons ?? [];
    return (
      <div className="inline-flex flex-col items-start gap-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
          <XCircle className="h-3.5 w-3.5" /> Active configuration · not
          checkout-ready
        </span>
        {reasons.length ? (
          <ul className="ml-1 list-disc space-y-0.5 pl-4 text-xs text-amber-800">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : (
          /*
           * Not checkout-ready with no reason given is itself worth saying. It
           * means the readiness rules and this record disagree, and silence
           * would read as "no problem found".
           */
          <p className="ml-1 text-xs text-amber-800">
            No reason was returned for this price, which should not happen —
            check the Stripe integration diagnostics.
          </p>
        )}
      </div>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
      <XCircle className="h-3.5 w-3.5" />
      Historical/inactive
    </span>
  );
}

async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const payload = (await response.json().catch(() => null)) as
    | { message?: string }
    | T
    | null;

  if (!response.ok) {
    throw new Error(getPayloadMessage(payload) ?? "Request failed.");
  }

  return payload as T;
}

function getPayloadMessage(value: unknown) {
  return value &&
    typeof value === "object" &&
    "message" in value &&
    typeof value.message === "string"
    ? value.message
    : null;
}

function validateDraft(draft: DraftPrice) {
  if (!/^[A-Za-z]{3}$/.test(draft.currency)) {
    return "Currency must be a three-letter ISO code.";
  }
  if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(draft.currency)) {
    return "Select a supported currency.";
  }
  if (Number.isNaN(Number(draft.unitAmount)) || Number(draft.unitAmount) <= 0) {
    return "Recurring amount must be greater than zero.";
  }
  if (
    !Number.isInteger(Number(draft.minimumSeats)) ||
    Number(draft.minimumSeats) < 1
  )
    return "Minimum seats must be at least one.";
  if (
    draft.maximumSeats &&
    Number(draft.maximumSeats) < Number(draft.minimumSeats)
  )
    return "Maximum seats cannot be below minimum seats.";
  if (
    draft.stripePriceId.trim() &&
    !draft.stripePriceId.trim().startsWith("price_")
  ) {
    return "Stripe Price ID must start with price_.";
  }
  return null;
}

function toPayload(draft: DraftPrice) {
  return {
    billingCycle: draft.billingCycle,
    currency: draft.currency.toUpperCase(),
    unitAmount: Number(draft.unitAmount),
    billingModel: draft.billingModel,
    billingInterval: draft.billingCycle === "ANNUAL" ? "YEAR" : "MONTH",
    minimumSeats: Number(draft.minimumSeats),
    maximumSeats: draft.maximumSeats ? Number(draft.maximumSeats) : null,
    includedSeats: Number(draft.includedSeats),
    stripePriceId: draft.stripePriceId.trim() || null,
    syncToStripe: true,
    isActive: draft.isActive,
  };
}

function normalizeCurrencyOption(currency: string) {
  const normalized = currency.toUpperCase();
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(normalized)
    ? normalized
    : SUPPORTED_CURRENCIES[0]!;
}

function hasOtherActivePrice(
  prices: PlanPriceRecord[],
  billingCycle: BillingCycle,
  currency: string,
  excludePriceId?: string,
) {
  return prices.some(
    (price) =>
      price.id !== excludePriceId &&
      price.isActive &&
      price.billingCycle === billingCycle &&
      price.currency === currency.toUpperCase(),
  );
}

function applyActivePriceChange(
  prices: PlanPriceRecord[],
  changedPrice: PlanPriceRecord,
) {
  if (!changedPrice.isActive) return prices;

  return prices.map((price) => {
    if (price.id === changedPrice.id) return changedPrice;
    if (
      price.planId === changedPrice.planId &&
      price.billingCycle === changedPrice.billingCycle &&
      price.currency === changedPrice.currency &&
      price.isActive
    ) {
      return {
        ...price,
        isActive: false,
        isCheckoutReady: false,
      };
    }
    return price;
  });
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}

function formatEnum(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
