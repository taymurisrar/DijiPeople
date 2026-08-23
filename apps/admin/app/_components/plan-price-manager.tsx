"use client";

import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Power,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { SUPPORTED_CURRENCIES } from "@/lib/form-options";

type BillingCycle = "MONTHLY" | "ANNUAL";
type BillingModel = "PER_SEAT" | "FLAT";

const CYCLES: BillingCycle[] = ["MONTHLY", "ANNUAL"];

export type PlanPriceRecord = {
  id: string;
  planId: string;
  billingCycle: BillingCycle;
  currency: string;
  unitAmount: number;
  billingModel: BillingModel;
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
  billingModel: BillingModel;
  currency: string;
  unitAmount: string;
  minimumSeats: string;
  maximumSeats: string;
  includedSeats: string;
  stripePriceId: string;
  isActive: boolean;
};

/**
 * Plan prices.
 *
 * This screen was a stack of cards, one per price, each repeating "Cycle",
 * "Amount", "Stripe Price ID" and "Subscriptions" as its own labelled block —
 * so a plan priced in six currencies across two periods, with a few superseded
 * versions behind it, rendered several hundred vertical pixels of column
 * headings. The page was long because the layout repeated the schema once per
 * row instead of once per table.
 *
 * Three changes, all aimed at the same thing:
 *
 *   - the rows are a table, so the headings appear once per currency;
 *   - superseded versions are folded away, because the live price is what
 *     anyone opening this tab came to see;
 *   - prices are added through a currency x period grid rather than one form
 *     submission each, since a plan is priced as a set.
 *
 * Stripe is not asked about. It never had to be: `createPlanPrice` passes
 * `syncToStripe: true` and `updatePlanPrice` re-syncs whatever it supersedes.
 * The manual Stripe Price ID field sat in the primary flow implying otherwise,
 * and now sits behind Advanced on the edit form, where adopting a pre-existing
 * Stripe price is a real if rare need.
 */
export function PlanPriceManager({
  planId,
  initialPrices,
  defaultCurrency,
}: PlanPriceManagerProps) {
  const [prices, setPrices] = useState(initialPrices);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<DraftPrice | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [showHistorical, setShowHistorical] = useState(false);
  /*
   * Changing an amount is what an operator comes here to do, and it used to
   * cost a click into a seven-field form and a Save. The other six fields are
   * set once and rarely touched, so the amount is editable in place and the
   * full form stays behind Edit for the rare change.
   */
  const [amountEditId, setAmountEditId] = useState<string | null>(null);
  const [amountDraft, setAmountDraft] = useState("");

  const activeCount = prices.filter((price) => price.isActive).length;
  const readyCount = prices.filter(
    (price) => price.isActive && price.isCheckoutReady,
  ).length;
  const historicalCount = prices.length - activeCount;

  /** Currency to rows: live first, then monthly before annual, newest version first. */
  const groups = useMemo(() => {
    const visible = showHistorical
      ? prices
      : prices.filter((price) => price.isActive);
    const byCurrency = new Map<string, PlanPriceRecord[]>();
    for (const price of visible) {
      byCurrency.set(price.currency, [
        ...(byCurrency.get(price.currency) ?? []),
        price,
      ]);
    }
    return [...byCurrency.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([currency, rows]) =>
          [
            currency,
            [...rows].sort(
              (a, b) =>
                Number(b.isActive) - Number(a.isActive) ||
                CYCLES.indexOf(a.billingCycle) -
                  CYCLES.indexOf(b.billingCycle) ||
                (b.version ?? 1) - (a.version ?? 1),
            ),
          ] as const,
      );
  }, [prices, showHistorical]);

  function draftFromPrice(price: PlanPriceRecord): DraftPrice {
    return {
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
    };
  }

  function clearMessages() {
    setError(null);
    setNotice(null);
  }

  function beginEdit(price: PlanPriceRecord) {
    clearMessages();
    setAmountEditId(null);
    setConfirmDeleteId(null);
    setEditingId(price.id);
    setEditingDraft(draftFromPrice(price));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingDraft(null);
  }

  /** Replace one row, and apply what the server's change did to its siblings. */
  function absorb(updated: PlanPriceRecord) {
    setPrices((current) =>
      applyActivePriceChange(
        current.map((item) => (item.id === updated.id ? updated : item)),
        updated,
      ),
    );
  }

  /**
   * Save one price, through the same validation and endpoint as the full form.
   *
   * Deliberately not a narrower request: `updatePlanPrice` supersedes a row
   * whose amount changed, so it needs the whole shape to build the replacement.
   * Sending only the changed field would work today and break the first time
   * the server needs another one to construct the successor.
   */
  function savePrice(priceId: string, next: DraftPrice, onDone?: () => void) {
    clearMessages();
    const validationError = validateDraft(next);
    if (validationError) {
      setError(validationError);
      return;
    }

    setActionId(priceId);
    startTransition(async () => {
      try {
        const updated = await requestJson<PlanPriceRecord>(
          `/api/super-admin/plans/${planId}/prices/${priceId}`,
          { method: "PATCH", body: JSON.stringify(toUpdatePayload(next)) },
        );
        absorb(updated);
        onDone?.();
      } catch (requestError) {
        setError(getErrorMessage(requestError, "Unable to update price."));
      } finally {
        setActionId(null);
      }
    });
  }

  function saveAmount(price: PlanPriceRecord) {
    const trimmed = amountDraft.trim();
    if (trimmed === String(price.unitAmount)) {
      setAmountEditId(null);
      return;
    }
    savePrice(price.id, { ...draftFromPrice(price), unitAmount: trimmed }, () =>
      setAmountEditId(null),
    );
  }

  function setPriceActive(price: PlanPriceRecord, isActive: boolean) {
    savePrice(price.id, { ...draftFromPrice(price), isActive });
  }

  /**
   * Remove the row, rather than retire it.
   *
   * The API refuses whenever a subscription, order, promotion or later version
   * references the price, so this is only ever reachable for a row nothing was
   * billed against — the typo, the currency that never launched. Anything with
   * history is deactivated instead, and the disabled button says so.
   */
  function deletePrice(price: PlanPriceRecord) {
    clearMessages();
    setActionId(price.id);
    startTransition(async () => {
      try {
        const outcome = await requestJson<{ message?: string }>(
          `/api/super-admin/plans/${planId}/prices/${price.id}?mode=permanent`,
          { method: "DELETE" },
        );
        setPrices((current) => current.filter((item) => item.id !== price.id));
        setConfirmDeleteId(null);
        setNotice(outcome.message ?? "Price deleted.");
      } catch (requestError) {
        setError(getErrorMessage(requestError, "Unable to delete price."));
      } finally {
        setActionId(null);
      }
    });
  }

  function deactivatePrice(price: PlanPriceRecord) {
    clearMessages();
    setActionId(price.id);
    startTransition(async () => {
      try {
        const updated = await requestJson<PlanPriceRecord>(
          `/api/super-admin/plans/${planId}/prices/${price.id}`,
          { method: "DELETE" },
        );
        setPrices((current) =>
          current.map((item) => (item.id === price.id ? updated : item)),
        );
      } catch (requestError) {
        setError(getErrorMessage(requestError, "Unable to deactivate price."));
      } finally {
        setActionId(null);
      }
    });
  }

  /** Create every filled cell of the composer grid, reporting partial success. */
  function createPrices(drafts: DraftPrice[]) {
    clearMessages();
    for (const draft of drafts) {
      const validationError = validateDraft(draft);
      if (validationError) {
        setError(
          `${draft.currency} ${formatEnum(draft.billingCycle).toLowerCase()}: ${validationError}`,
        );
        return;
      }
    }

    setActionId("create");
    startTransition(async () => {
      const created: PlanPriceRecord[] = [];
      const failures: string[] = [];

      /*
       * Sequential, not `Promise.all`. Creating an active price supersedes the
       * existing one for the same currency and period, so overlapping creates
       * would race over which ends up live. The set is small and the operator
       * is watching it.
       */
      for (const draft of drafts) {
        try {
          created.push(
            await requestJson<PlanPriceRecord>(
              `/api/super-admin/plans/${planId}/prices`,
              { method: "POST", body: JSON.stringify(toCreatePayload(draft)) },
            ),
          );
        } catch (requestError) {
          failures.push(
            `${draft.currency} ${formatEnum(draft.billingCycle).toLowerCase()} (${getErrorMessage(requestError, "failed")})`,
          );
        }
      }

      if (created.length) {
        setPrices((current) =>
          created.reduce(
            (all, price) => applyActivePriceChange([...all, price], price),
            current,
          ),
        );
      }

      /*
       * Both halves of a partial run are reported, and the composer stays open.
       * Closing it on a mixed result would leave the operator to work out from
       * the table which of the six they asked for actually landed.
       */
      if (failures.length) {
        setError(
          `${created.length} price(s) created. ${failures.length} failed: ${failures.join("; ")}`,
        );
      } else {
        setShowComposer(false);
        setNotice(
          `${created.length} price${created.length === 1 ? "" : "s"} created and synced to Stripe.`,
        );
      }
      setActionId(null);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span className="font-semibold text-slate-950">
            {activeCount} active price{activeCount === 1 ? "" : "s"}
          </span>
          <span aria-hidden>·</span>
          <span
            className={
              readyCount === activeCount ? "text-emerald-700" : "text-amber-700"
            }
          >
            {readyCount} checkout-ready
          </span>
          {historicalCount ? (
            <>
              <span aria-hidden>·</span>
              <button
                type="button"
                onClick={() => setShowHistorical((value) => !value)}
                className="font-medium text-slate-600 underline decoration-dotted underline-offset-4 transition hover:text-slate-900"
              >
                {showHistorical ? "Hide" : "Show"} {historicalCount} superseded
              </button>
            </>
          ) : null}
        </div>

        {!showComposer ? (
          <button
            type="button"
            onClick={() => {
              clearMessages();
              setShowComposer(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add prices
          </button>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {notice}
        </p>
      ) : null}

      {showComposer ? (
        <PriceComposer
          defaultCurrency={defaultCurrency}
          existingCurrencies={[
            ...new Set(prices.map((price) => price.currency)),
          ]}
          busy={isPending && actionId === "create"}
          onCancel={() => {
            setShowComposer(false);
            clearMessages();
          }}
          onCreate={createPrices}
        />
      ) : null}

      {!groups.length ? (
        <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-10 text-center">
          <p className="text-base font-semibold text-slate-950">
            {prices.length ? "No active prices" : "This plan has no prices yet"}
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
            {prices.length
              ? "Every price on this plan has been superseded or deactivated. Nobody can buy it until one is active."
              : "Add a price per currency and billing period. Stripe products and prices are created for you."}
          </p>
        </div>
      ) : (
        groups.map(([currency, rows]) => (
          <section
            key={currency}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
          >
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5">
              <h3 className="text-sm font-semibold tracking-wide text-slate-950">
                {currency}
              </h3>
              <span className="text-xs text-slate-500">
                {rows.filter((row) => row.isActive).length} active
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wider text-slate-500">
                    <th scope="col" className="w-8 py-2 pl-4" />
                    <th scope="col" className="py-2 pr-3 font-semibold">
                      Period
                    </th>
                    <th scope="col" className="py-2 pr-3 font-semibold">
                      Amount
                    </th>
                    <th scope="col" className="py-2 pr-3 font-semibold">
                      Model
                    </th>
                    <th scope="col" className="py-2 pr-3 font-semibold">
                      Checkout
                    </th>
                    <th
                      scope="col"
                      className="py-2 pr-3 text-right font-semibold"
                    >
                      Subs
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((price) => {
                    const busy = isPending && actionId === price.id;

                    if (editingId === price.id && editingDraft) {
                      return (
                        <tr key={price.id} className="bg-slate-50/70">
                          <td colSpan={7} className="p-4">
                            <PriceEditForm
                              draft={editingDraft}
                              onChange={setEditingDraft}
                              disabled={busy}
                              saving={busy}
                              supersedeNote={
                                editingDraft.isActive &&
                                hasOtherActivePrice(
                                  prices,
                                  editingDraft.billingCycle,
                                  editingDraft.currency,
                                  price.id,
                                )
                                  ? "Saving this makes it the checkout price. The one it replaces is deactivated."
                                  : undefined
                              }
                              onCancel={cancelEdit}
                              onSave={() =>
                                savePrice(price.id, editingDraft, cancelEdit)
                              }
                            />
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <PriceRow
                        key={price.id}
                        price={price}
                        busy={busy}
                        expanded={expandedId === price.id}
                        confirmingDelete={confirmDeleteId === price.id}
                        amountEditing={amountEditId === price.id}
                        amountDraft={amountDraft}
                        onToggleExpand={() =>
                          setExpandedId(
                            expandedId === price.id ? null : price.id,
                          )
                        }
                        onAmountDraft={setAmountDraft}
                        onBeginAmountEdit={() => {
                          clearMessages();
                          cancelEdit();
                          setAmountEditId(price.id);
                          setAmountDraft(String(price.unitAmount));
                        }}
                        onCancelAmountEdit={() => setAmountEditId(null)}
                        onCommitAmount={() => saveAmount(price)}
                        onEdit={() => beginEdit(price)}
                        onToggleActive={() =>
                          price.isActive
                            ? deactivatePrice(price)
                            : setPriceActive(price, true)
                        }
                        onRequestDelete={() => {
                          clearMessages();
                          setConfirmDeleteId(price.id);
                        }}
                        onCancelDelete={() => setConfirmDeleteId(null)}
                        onConfirmDelete={() => deletePrice(price)}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function PriceRow({
  price,
  busy,
  expanded,
  confirmingDelete,
  amountEditing,
  amountDraft,
  onToggleExpand,
  onAmountDraft,
  onBeginAmountEdit,
  onCancelAmountEdit,
  onCommitAmount,
  onEdit,
  onToggleActive,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  price: PlanPriceRecord;
  busy: boolean;
  expanded: boolean;
  confirmingDelete: boolean;
  amountEditing: boolean;
  amountDraft: string;
  onToggleExpand: () => void;
  onAmountDraft: (value: string) => void;
  onBeginAmountEdit: () => void;
  onCancelAmountEdit: () => void;
  onCommitAmount: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const reasons = price.checkoutReadinessReasons ?? [];
  const period = price.billingCycle === "ANNUAL" ? "Annual" : "Monthly";

  return (
    <>
      <tr className={price.isActive ? "" : "text-slate-400"}>
        <td className="py-2.5 pl-4 align-middle">
          <button
            type="button"
            onClick={onToggleExpand}
            aria-expanded={expanded}
            aria-label={`${expanded ? "Hide" : "Show"} details for the ${price.currency} ${period.toLowerCase()} price`}
            className="rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronRight className="h-4 w-4" aria-hidden />
            )}
          </button>
        </td>

        <td className="py-2.5 pr-3 align-middle">
          <span className="font-medium text-slate-900">{period}</span>
          {(price.version ?? 1) > 1 ? (
            <span className="ml-1.5 text-xs text-slate-400">
              v{price.version}
            </span>
          ) : null}
        </td>

        <td className="py-2.5 pr-3 align-middle">
          {/*
            Editable in place. Enter commits, Escape abandons, and leaving the
            field commits too — clicking away to check another row should not
            silently discard what was typed.
          */}
          {amountEditing ? (
            <input
              autoFocus
              type="number"
              step="0.01"
              min="0.01"
              inputMode="decimal"
              value={amountDraft}
              disabled={busy}
              aria-label={`Amount in ${price.currency}`}
              onChange={(event) => onAmountDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onCommitAmount();
                }
                if (event.key === "Escape") onCancelAmountEdit();
              }}
              onBlur={onCommitAmount}
              className="h-8 w-28 rounded-lg border border-slate-900 px-2 text-sm font-semibold text-slate-950 outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={onBeginAmountEdit}
              title="Click to edit the amount"
              className="-ml-1.5 inline-flex items-center gap-1.5 rounded-lg px-1.5 py-0.5 font-semibold text-slate-900 transition hover:bg-slate-100"
            >
              {formatCurrency(price.unitAmount, price.currency)}
              {busy ? (
                <Loader2
                  className="h-3 w-3 animate-spin text-slate-400"
                  aria-hidden
                />
              ) : (
                <Pencil className="h-3 w-3 text-slate-400" aria-hidden />
              )}
            </button>
          )}
        </td>

        <td className="py-2.5 pr-3 align-middle text-slate-600">
          {price.billingModel === "PER_SEAT"
            ? `Per seat · min ${price.minimumSeats}`
            : `Flat · ${price.includedSeats} seats`}
        </td>

        <td className="py-2.5 pr-3 align-middle">
          <CheckoutReadyBadge price={price} onShowReasons={onToggleExpand} />
        </td>

        <td className="py-2.5 pr-3 text-right align-middle tabular-nums text-slate-700">
          {price.subscriptionCount}
        </td>

        <td className="py-2.5 pr-4 align-middle">
          {confirmingDelete ? (
            <div className="flex items-center justify-end gap-2">
              <span className="text-xs text-slate-600">
                Delete permanently?
              </span>
              <button
                type="button"
                onClick={onConfirmDelete}
                disabled={busy}
                className="rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
              >
                {busy ? "Deleting…" : "Delete"}
              </button>
              <button
                type="button"
                onClick={onCancelDelete}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-1">
              <IconAction label="Edit price" onClick={onEdit} disabled={busy}>
                <Pencil className="h-3.5 w-3.5" aria-hidden />
              </IconAction>
              <IconAction
                label={price.isActive ? "Deactivate price" : "Activate price"}
                onClick={onToggleActive}
                disabled={busy}
                tone={price.isActive ? "amber" : "emerald"}
              >
                <Power className="h-3.5 w-3.5" aria-hidden />
              </IconAction>
              {/*
                Delete is offered only where the API would allow it, and the
                disabled button explains itself rather than disappearing — so
                "why can I delete that one and not this one" has an answer on
                the page instead of in the 409.
              */}
              <IconAction
                label={
                  price.canDelete
                    ? "Delete price permanently"
                    : `Cannot delete: ${price.subscriptionCount} subscription(s) reference this price. Deactivate it instead.`
                }
                onClick={onRequestDelete}
                disabled={busy || !price.canDelete}
                tone="rose"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </IconAction>
            </div>
          )}
        </td>
      </tr>

      {expanded ? (
        <tr className="bg-slate-50/60">
          <td />
          <td colSpan={6} className="py-3 pr-4 text-xs">
            {reasons.length ? (
              <div className="mb-3">
                <p className="font-semibold text-amber-900">
                  Why this price is not checkout-ready
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-amber-800">
                  {reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
              <Detail label="Stripe price">
                {price.stripePriceId ?? "Not created yet"}
              </Detail>
              <Detail label="Stripe product">
                {price.stripeProductId ?? "Not created yet"}
              </Detail>
              <Detail label="Environment">
                {price.stripeEnvironment ?? "—"}
              </Detail>
              <Detail label="Sync status">
                {formatEnum(price.stripeSyncStatus)}
              </Detail>
              <Detail label="Last verified">
                {price.stripeVerifiedAt
                  ? new Date(price.stripeVerifiedAt).toLocaleString()
                  : "Never"}
              </Detail>
              <Detail label="Seats">
                {price.billingModel === "PER_SEAT"
                  ? `${price.minimumSeats}–${price.maximumSeats ?? "unlimited"}`
                  : `${price.includedSeats} included`}
              </Detail>
            </dl>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-0.5 break-all font-mono text-slate-700">{children}</dd>
    </div>
  );
}

function IconAction({
  label,
  onClick,
  disabled,
  tone = "slate",
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "slate" | "amber" | "emerald" | "rose";
  children: React.ReactNode;
}) {
  const tones = {
    slate: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
    amber: "text-amber-600 hover:bg-amber-50 hover:text-amber-800",
    emerald: "text-emerald-600 hover:bg-emerald-50 hover:text-emerald-800",
    rose: "text-rose-600 hover:bg-rose-50 hover:text-rose-800",
  } as const;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`rounded-lg p-1.5 transition disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

/**
 * Add several prices at once.
 *
 * A plan is priced as a set — every currency you sell in, monthly and annual —
 * and the old form created exactly one price per submission, with the pricing
 * model and seat bounds retyped for each. Six prices meant six passes through
 * seven fields.
 *
 * Here the terms that are the same across the set are stated once, and the
 * amounts are a currency x period grid. A blank cell is simply not created, so
 * "monthly only, in three currencies" needs no extra control to express.
 */
function PriceComposer({
  defaultCurrency,
  existingCurrencies,
  busy,
  onCancel,
  onCreate,
}: {
  defaultCurrency: string;
  existingCurrencies: string[];
  busy: boolean;
  onCancel: () => void;
  onCreate: (drafts: DraftPrice[]) => void;
}) {
  const [billingModel, setBillingModel] = useState<BillingModel>("PER_SEAT");
  const [minimumSeats, setMinimumSeats] = useState("1");
  const [maximumSeats, setMaximumSeats] = useState("");
  const [includedSeats, setIncludedSeats] = useState("0");
  /*
   * Seeded with the currencies this plan already sells in, because the common
   * reason to open this is to add a period to a market that exists or to
   * re-price one. A plan with no prices starts on its own default currency.
   */
  const [rows, setRows] = useState<string[]>(() =>
    existingCurrencies.length
      ? [...existingCurrencies].sort()
      : [normalizeCurrencyOption(defaultCurrency)],
  );
  /** `${currency}:${cycle}` to the typed amount. */
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  const unusedCurrencies = SUPPORTED_CURRENCIES.filter(
    (currency) => !rows.includes(currency),
  );

  const drafts: DraftPrice[] = rows.flatMap((currency) =>
    CYCLES.flatMap((cycle) => {
      const amount = (amounts[`${currency}:${cycle}`] ?? "").trim();
      if (!amount) return [];
      return [
        {
          billingCycle: cycle,
          billingModel,
          currency,
          unitAmount: amount,
          minimumSeats: billingModel === "PER_SEAT" ? minimumSeats : "1",
          maximumSeats: billingModel === "PER_SEAT" ? maximumSeats : "",
          includedSeats: billingModel === "FLAT" ? includedSeats : "0",
          stripePriceId: "",
          isActive: true,
        },
      ];
    }),
  );

  return (
    <section className="rounded-2xl border border-slate-300 bg-slate-50 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-950">Add prices</h3>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel adding prices"
          className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-200 hover:text-slate-900"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <label className="text-sm font-medium text-slate-700">
          Pricing model
          <select
            value={billingModel}
            disabled={busy}
            onChange={(event) =>
              setBillingModel(event.target.value as BillingModel)
            }
            className="mt-1 block h-9 w-40 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900"
          >
            <option value="PER_SEAT">Per seat</option>
            <option value="FLAT">Flat recurring</option>
          </select>
        </label>

        {/*
          Seat bounds belong to per-seat pricing and included seats to flat, so
          each model shows only its own. Rendering both and greying out the two
          that do not apply made every form wider than it ever needed to be —
          and a disabled input still reads as something you failed to fill in.
        */}
        {billingModel === "PER_SEAT" ? (
          <>
            <label className="text-sm font-medium text-slate-700">
              Minimum seats
              <input
                type="number"
                min="1"
                step="1"
                value={minimumSeats}
                disabled={busy}
                onChange={(event) => setMinimumSeats(event.target.value)}
                className="mt-1 block h-9 w-28 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Maximum seats
              <input
                type="number"
                min={minimumSeats || "1"}
                step="1"
                placeholder="No limit"
                value={maximumSeats}
                disabled={busy}
                onChange={(event) => setMaximumSeats(event.target.value)}
                className="mt-1 block h-9 w-28 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900"
              />
            </label>
          </>
        ) : (
          <label className="text-sm font-medium text-slate-700">
            Included seats
            <input
              type="number"
              min="0"
              step="1"
              value={includedSeats}
              disabled={busy}
              onChange={(event) => setIncludedSeats(event.target.value)}
              className="mt-1 block h-9 w-28 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900"
            />
            <span className="mt-0.5 block text-xs font-normal text-slate-500">
              Headcount the flat amount covers.
            </span>
          </label>
        )}
      </div>

      <table className="mt-4 w-full max-w-xl text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
            <th scope="col" className="pb-1.5 font-semibold">
              Currency
            </th>
            <th scope="col" className="pb-1.5 font-semibold">
              Monthly
            </th>
            <th scope="col" className="pb-1.5 font-semibold">
              Annual
            </th>
            <th scope="col" className="pb-1.5" />
          </tr>
        </thead>
        <tbody>
          {rows.map((currency) => (
            <tr key={currency}>
              <td className="py-1 pr-3 font-semibold text-slate-900">
                {currency}
              </td>
              {CYCLES.map((cycle) => (
                <td key={cycle} className="py-1 pr-3">
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="—"
                    disabled={busy}
                    aria-label={`${formatEnum(cycle)} amount in ${currency}`}
                    value={amounts[`${currency}:${cycle}`] ?? ""}
                    onChange={(event) =>
                      setAmounts((current) => ({
                        ...current,
                        [`${currency}:${cycle}`]: event.target.value,
                      }))
                    }
                    className="h-9 w-32 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900"
                  />
                </td>
              ))}
              <td className="py-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    setRows((current) =>
                      current.filter((item) => item !== currency),
                    )
                  }
                  aria-label={`Remove ${currency}`}
                  className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {unusedCurrencies.length ? (
        <div className="mt-3">
          <label className="sr-only" htmlFor="plan-price-add-currency">
            Add a currency
          </label>
          <select
            id="plan-price-add-currency"
            value=""
            disabled={busy}
            onChange={(event) => {
              if (!event.target.value) return;
              const currency = event.target.value;
              setRows((current) => [...current, currency]);
            }}
            className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900"
          >
            <option value="">+ Add a currency…</option>
            {unusedCurrencies.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => onCreate(drafts)}
          disabled={busy || !drafts.length}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="h-4 w-4" aria-hidden />
          )}
          {drafts.length
            ? `Create ${drafts.length} price${drafts.length === 1 ? "" : "s"}`
            : "Create prices"}
        </button>
        <span className="text-xs text-slate-500">
          Stripe products and prices are created automatically. Blank cells are
          skipped.
        </span>
      </div>
    </section>
  );
}

/** The full form, for the fields the table does not edit in place. */
function PriceEditForm({
  draft,
  onChange,
  disabled,
  saving,
  supersedeNote,
  onCancel,
  onSave,
}: {
  draft: DraftPrice;
  onChange: (draft: DraftPrice) => void;
  disabled?: boolean;
  saving?: boolean;
  supersedeNote?: string;
  onCancel: () => void;
  onSave: () => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-4">
        <label className="text-sm font-medium text-slate-700">
          Pricing model
          <select
            value={draft.billingModel}
            disabled={disabled}
            onChange={(event) => {
              const billingModel = event.target.value as BillingModel;
              onChange({
                ...draft,
                billingModel,
                minimumSeats:
                  billingModel === "FLAT" ? "1" : draft.minimumSeats,
                maximumSeats: billingModel === "FLAT" ? "" : draft.maximumSeats,
                // Cleared for per-seat, kept for flat: included seats are a
                // flat concept, and this used to reset them on the way in.
                includedSeats:
                  billingModel === "PER_SEAT" ? "0" : draft.includedSeats,
              });
            }}
            className="mt-1 block h-9 w-40 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900"
          >
            <option value="PER_SEAT">Per seat</option>
            <option value="FLAT">Flat recurring</option>
          </select>
        </label>

        <label className="text-sm font-medium text-slate-700">
          Billing period
          <select
            value={draft.billingCycle}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...draft,
                billingCycle: event.target.value as BillingCycle,
              })
            }
            className="mt-1 block h-9 w-32 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900"
          >
            <option value="MONTHLY">Monthly</option>
            <option value="ANNUAL">Annual</option>
          </select>
        </label>

        <label className="text-sm font-medium text-slate-700">
          Currency
          <select
            value={draft.currency}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...draft, currency: event.target.value.toUpperCase() })
            }
            className="mt-1 block h-9 w-28 rounded-lg border border-slate-300 bg-white px-2 text-sm uppercase text-slate-900"
          >
            {SUPPORTED_CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium text-slate-700">
          {draft.billingModel === "PER_SEAT"
            ? "Price per seat"
            : "Recurring amount"}
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={draft.unitAmount}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...draft, unitAmount: event.target.value })
            }
            className="mt-1 block h-9 w-32 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900"
          />
        </label>

        {draft.billingModel === "PER_SEAT" ? (
          <>
            <label className="text-sm font-medium text-slate-700">
              Minimum seats
              <input
                type="number"
                min="1"
                step="1"
                value={draft.minimumSeats}
                disabled={disabled}
                onChange={(event) =>
                  onChange({ ...draft, minimumSeats: event.target.value })
                }
                className="mt-1 block h-9 w-28 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Maximum seats
              <input
                type="number"
                min={draft.minimumSeats || "1"}
                step="1"
                placeholder="No limit"
                value={draft.maximumSeats}
                disabled={disabled}
                onChange={(event) =>
                  onChange({ ...draft, maximumSeats: event.target.value })
                }
                className="mt-1 block h-9 w-28 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900"
              />
            </label>
          </>
        ) : (
          /*
            Flat only — and this was previously disabled on
            `billingModel === "FLAT"`, the one model that uses it.
            `FLAT_SCHEDULE` in `pricing.catalog.ts` carries `includedSeats`;
            `PER_SEAT_SCHEDULE` carries `minimumSeats`. The condition was
            inverted, so the headcount a flat price includes could not be set
            from this screen at all.
          */
          <label className="text-sm font-medium text-slate-700">
            Included seats
            <input
              type="number"
              min="0"
              step="1"
              value={draft.includedSeats}
              disabled={disabled}
              onChange={(event) =>
                onChange({ ...draft, includedSeats: event.target.value })
              }
              className="mt-1 block h-9 w-28 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900"
            />
          </label>
        )}

        <label className="flex items-center gap-2 pt-6 text-sm font-medium text-slate-700">
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
      </div>

      {/*
        Stripe, behind a disclosure.

        `updatePlanPrice` supersedes any row whose amount, currency, interval or
        model changed by creating the replacement with `syncToStripe: true`, so
        the sync is already guaranteed on exactly the edits that need it. This
        field sitting in the primary flow implied an operator had to go and
        fetch an id from the Stripe dashboard first. It stays available because
        adopting a pre-existing Stripe price is occasionally the right thing.
      */}
      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced((value) => !value)}
          aria-expanded={showAdvanced}
          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 transition hover:text-slate-800"
        >
          {showAdvanced ? (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          )}
          Advanced
        </button>
        {showAdvanced ? (
          <label className="mt-2 block text-sm font-medium text-slate-700">
            Stripe Price ID
            <input
              value={draft.stripePriceId}
              placeholder="price_…"
              disabled={disabled}
              onChange={(event) =>
                onChange({ ...draft, stripePriceId: event.target.value })
              }
              className="mt-1 block h-9 w-80 max-w-full rounded-lg border border-slate-300 bg-white px-2 font-mono text-sm text-slate-900"
            />
            <span className="mt-1 block text-xs font-normal text-slate-500">
              Leave blank and one is created and verified for you. Set it only
              to adopt a Stripe price that already exists.
            </span>
          </label>
        ) : null}
      </div>

      {supersedeNote ? (
        <p className="flex items-start gap-1.5 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {supersedeNote}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Save className="h-4 w-4" aria-hidden />
          )}
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function CheckoutReadyBadge({
  price,
  onShowReasons,
}: {
  price: PlanPriceRecord;
  onShowReasons: () => void;
}) {
  if (!price.isActive) {
    return (
      <span className="text-xs font-medium text-slate-500">Superseded</span>
    );
  }

  if (price.isCheckoutReady) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
        Live
      </span>
    );
  }

  /*
   * The reasons stay on the page, one click away.
   *
   * `deriveCheckoutReadiness` computes up to ten specific causes — no Stripe
   * price id, wrong environment, never verified, interval mismatch — and the
   * API returns every one of them. They were once rendered into a `title`
   * attribute: invisible on touch, unreachable by keyboard, inconsistently
   * announced. So the answer to "why can this plan not be bought" was computed,
   * transmitted, and then hidden. Listing them inline under every row fixed
   * that and created this screen's other problem. Here the count is on the row
   * and the detail is in the expander.
   */
  const count = price.checkoutReadinessReasons?.length ?? 0;

  return (
    <button
      type="button"
      onClick={onShowReasons}
      className="inline-flex items-center gap-1 rounded-lg px-1 py-0.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-50"
    >
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
      {count
        ? `Blocked · ${count} reason${count === 1 ? "" : "s"}`
        : /*
           * Not checkout-ready with no reason given is itself worth saying: it
           * means the readiness rules and this record disagree, and silence
           * would read as "no problem found".
           */
          "Blocked · no reason returned"}
    </button>
  );
}

async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
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

/**
 * The fields both endpoints accept.
 *
 * Kept separate from `syncToStripe` because the two endpoints do not take the
 * same body, and the global `ValidationPipe` runs with
 * `forbidNonWhitelisted: true` — an unknown property is a 400, not an ignored
 * extra. One shared payload sent to both is what produced
 * `property syncToStripe should not exist` on every attempt to edit a price.
 */
function toBasePayload(draft: DraftPrice) {
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
    isActive: draft.isActive,
  };
}

/** `CreatePlanPriceDto` declares `syncToStripe`; a new price asks for the sync. */
function toCreatePayload(draft: DraftPrice) {
  return { ...toBasePayload(draft), syncToStripe: true };
}

/**
 * `UpdatePlanPriceDto` declares no `syncToStripe`, and does not need one.
 *
 * A Stripe price is immutable, so `updatePlanPrice` cannot edit one in place:
 * when a change touches amount, currency, interval or billing model it
 * supersedes the row by calling `createPlanPrice` with `syncToStripe: true`
 * hardcoded. The sync is therefore already guaranteed on exactly the edits that
 * need it, and asking for it in the body only added a property the endpoint
 * rejects.
 */
function toUpdatePayload(draft: DraftPrice) {
  return toBasePayload(draft);
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
      return { ...price, isActive: false, isCheckoutReady: false };
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
