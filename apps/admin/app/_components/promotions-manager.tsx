"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Plus, Power, Trash2 } from "lucide-react";
import { useConfirmAction } from "@/app/_components/runtime/use-confirm-action";

type Promotion = {
  id: string;
  name: string;
  code: string | null;
  discountType: "PERCENTAGE" | "FLAT";
  percentOff: number | null;
  amountOff: number | null;
  currency: string | null;
  duration: "ONCE" | "REPEATING" | "FOREVER";
  durationMonths: number | null;
  /* "" until the operator chooses — see `emptyDraft` (BUG-1751). */
  scope: "" | "GLOBAL" | "PLAN" | "PRICE" | "CUSTOMER" | "SUBSCRIPTION";
  isActive: boolean;
  stripeSyncStatus: string;
  version: number;
  /* Whether this promotion has ever applied to anything — the line between a
   * record that can be removed and one that carries commercial history. */
  redemptionCount: number;
};

type LookupOption = { value: string; label: string };

type PromotionDraft = {
  name: string;
  code: string;
  discountType: "PERCENTAGE" | "FLAT";
  value: string;
  currency: string;
  duration: "ONCE" | "REPEATING" | "FOREVER";
  durationMonths: string;
  scope: "GLOBAL" | "PLAN" | "PRICE" | "CUSTOMER" | "SUBSCRIPTION";
  targetId: string;
  syncToStripe: boolean;
};

/*
 * Defaults for a form that writes commercial terms.
 *
 * These were chosen for convenience and added up to something dangerous: the
 * widest scope, a pre-filled 10%, and immediate activation meant one press of
 * "Add promotion" published a 10% discount against every eligible subscription
 * (BUG-1751).
 *
 * Scope now starts unset so the operator has to say what the promotion applies
 * to, and the percentage is blank so the number is one somebody chose. Creation
 * no longer activates — that is a separate act, on the API side.
 */
const emptyDraft: PromotionDraft = {
  name: "",
  code: "",
  discountType: "PERCENTAGE" as const,
  value: "",
  currency: "QAR",
  duration: "ONCE" as const,
  durationMonths: "",
  scope: "" as PromotionDraft["scope"],
  targetId: "",
  syncToStripe: false,
};

export function PromotionsManager({
  initialPromotions,
}: {
  initialPromotions: Promotion[];
}) {
  const [promotions, setPromotions] = useState(initialPromotions);
  const [draft, setDraft] = useState(emptyDraft);
  const [targets, setTargets] = useState<LookupOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { confirmAction, confirmDialog } = useConfirmAction();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (draft.scope === "GLOBAL") {
      setTargets([]);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/super-admin/promotions/targets?scope=${draft.scope}`, {
      signal: controller.signal,
    })
      .then((response) =>
        response.ok
          ? response.json()
          : Promise.reject(new Error("Lookup unavailable")),
      )
      .then(
        (payload: Array<{ id: string; name?: string; companyName?: string }>) =>
          setTargets(
            payload.map((item) => ({
              value: item.id,
              label: item.name ?? item.companyName ?? item.id,
            })),
          ),
      )
      .catch((lookupError: unknown) => {
        if (
          !(
            lookupError instanceof DOMException &&
            lookupError.name === "AbortError"
          )
        ) {
          setTargets([]);
        }
      });
    return () => controller.abort();
  }, [draft.scope]);

  function createPromotion() {
    if (!draft.name.trim()) return setError("Name is required.");
    /*
     * Scope has to be chosen rather than defaulted (BUG-1751). It used to
     * start at GLOBAL, so the widest possible commercial term was what an
     * operator got for not touching the field.
     */
    if (!draft.scope)
      return setError("Choose what this promotion applies to.");
    if (!draft.value.trim())
      return setError(
        draft.discountType === "PERCENTAGE"
          ? "Enter the percentage to discount."
          : "Enter the amount to discount.",
      );
    if (draft.scope !== "GLOBAL" && !draft.targetId)
      return setError("Select the record this promotion applies to.");
    if (draft.duration === "REPEATING" && Number(draft.durationMonths) < 1)
      return setError("Enter the number of discounted months.");
    setError(null);
    startTransition(async () => {
      try {
        const targetKey = targetKeyForScope(draft.scope);
        const response = await fetch("/api/super-admin/promotions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: draft.name.trim(),
            code: draft.code.trim() || null,
            discountType: draft.discountType,
            percentOff:
              draft.discountType === "PERCENTAGE" ? Number(draft.value) : null,
            amountOff:
              draft.discountType === "FLAT" ? Number(draft.value) : null,
            currency: draft.discountType === "FLAT" ? draft.currency : null,
            duration: draft.duration,
            durationMonths:
              draft.duration === "REPEATING"
                ? Number(draft.durationMonths)
                : null,
            scope: draft.scope,
            ...(targetKey ? { [targetKey]: draft.targetId } : {}),
            syncToStripe: draft.syncToStripe,
          }),
        });
        const payload = (await response.json()) as Promotion & {
          message?: string;
        };
        if (!response.ok)
          throw new Error(payload.message ?? "Unable to create promotion.");
        setPromotions((current) => [payload, ...current]);
        setDraft(emptyDraft);
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to create promotion.",
        );
      }
    });
  }

  /*
   * Deactivate and delete are two different things and used to be one.
   *
   * `DELETE /promotions/:id` was wired to `deactivatePromotion`, so this button
   * sent a delete, got 200 back, and left the row in place — and it was the
   * only action offered, which meant a mistyped promotion could never be
   * removed (BUG-1757). Deactivation now has its own route, and delete
   * genuinely deletes.
   */
  /*
   * Publishing is its own act now.
   *
   * Promotions are created inactive (BUG-1751), so there has to be a way to
   * turn one on deliberately — and it confirms, because activating a global
   * discount is the thing that used to happen by accident.
   */
  function activate(promotion: Promotion) {
    void (async () => {
      const scope =
        promotion.scope === "GLOBAL"
          ? "every eligible subscription"
          : `the selected ${promotion.scope.toLowerCase()}`;
      const confirmed = await confirmAction({
        title: `Activate ${promotion.name}?`,
        description: `This applies the discount to ${scope} from now on.`,
        creates: [
          promotion.discountType === "PERCENTAGE"
            ? `${promotion.percentOff ?? 0}% off, applied to ${scope}`
            : `${promotion.currency ?? ""} ${promotion.amountOff ?? 0} off, applied to ${scope}`,
        ],
        confirmLabel: "Activate promotion",
        tone: promotion.scope === "GLOBAL" ? "danger" : "default",
      });
      if (!confirmed) return;
      startTransition(async () => {
        const response = await fetch(
          `/api/super-admin/promotions/${promotion.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive: true }),
          },
        );
        if (!response.ok) {
          setError("Unable to activate this promotion.");
          return;
        }
        const updated = (await response.json()) as Promotion;
        setPromotions((current) =>
          current.map((item) => (item.id === promotion.id ? updated : item)),
        );
      });
    })();
  }

  function deactivate(id: string) {
    startTransition(async () => {
      const response = await fetch(
        `/api/super-admin/promotions/${id}/deactivate`,
        { method: "POST" },
      );
      if (!response.ok) {
        setError("Unable to deactivate this promotion.");
        return;
      }
      const updated = (await response.json()) as Promotion;
      setPromotions((current) =>
        current.map((item) => (item.id === id ? updated : item)),
      );
    });
  }

  function remove(promotion: Promotion) {
    /*
     * The app's own dialog, not `window.confirm`.
     *
     * A native confirm is unstyled, unescapable in any meaningful way and
     * outside the app's theme — the same objections BUG-0020 raised about
     * `window.prompt`. It also cannot name what it is about to delete beyond a
     * single string, which is the thing BUG-1560 and BUG-1756 exist to fix.
     */
    void (async () => {
      const confirmed = await confirmAction({
        title: `Delete ${promotion.name}?`,
        description:
          "This permanently deletes the promotion. It cannot be undone.",
        creates: [promotion.name],
        intent: "delete",
        confirmLabel: "Delete promotion",
        tone: "danger",
      });
      if (!confirmed) return;
      doRemove(promotion);
    })();
  }

  function doRemove(promotion: Promotion) {
    startTransition(async () => {
      const response = await fetch(`/api/super-admin/promotions/${promotion.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        // A redeemed promotion is refused by the API and says why. Show that
        // reason rather than a generic failure: it tells the operator to
        // deactivate instead.
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(payload?.message ?? "Unable to delete this promotion.");
        return;
      }
      setPromotions((current) =>
        current.filter((item) => item.id !== promotion.id),
      );
    });
  }

  return (
    <div className="space-y-4">
      {confirmDialog}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Name">
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className={control}
            />
          </Field>
          <Field label="Promotion code">
            <input
              value={draft.code}
              onChange={(e) =>
                setDraft({ ...draft, code: e.target.value.toUpperCase() })
              }
              placeholder="Optional"
              className={control}
            />
          </Field>
          <Field label="Discount type">
            <select
              value={draft.discountType}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  discountType: e.target.value as typeof draft.discountType,
                })
              }
              className={control}
            >
              <option value="PERCENTAGE">Percentage</option>
              <option value="FLAT">Fixed amount</option>
            </select>
          </Field>
          <Field
            label={
              draft.discountType === "PERCENTAGE" ? "Percent off" : "Amount off"
            }
          >
            <input
              type="number"
              min="0.01"
              max={draft.discountType === "PERCENTAGE" ? 100 : undefined}
              step="0.01"
              value={draft.value}
              onChange={(e) => setDraft({ ...draft, value: e.target.value })}
              className={control}
            />
          </Field>
          {draft.discountType === "FLAT" ? (
            <Field label="Currency">
              <input
                value={draft.currency}
                maxLength={3}
                onChange={(e) =>
                  setDraft({ ...draft, currency: e.target.value.toUpperCase() })
                }
                className={control}
              />
            </Field>
          ) : null}
          <Field label="Duration">
            <select
              value={draft.duration}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  duration: e.target.value as typeof draft.duration,
                })
              }
              className={control}
            >
              <option value="ONCE">First invoice</option>
              <option value="REPEATING">First N months</option>
              <option value="FOREVER">Forever</option>
            </select>
          </Field>
          {draft.duration === "REPEATING" ? (
            <Field label="Months">
              <input
                type="number"
                min="1"
                value={draft.durationMonths}
                onChange={(e) =>
                  setDraft({ ...draft, durationMonths: e.target.value })
                }
                className={control}
              />
            </Field>
          ) : null}
          <Field label="Scope">
            <select
              value={draft.scope}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  scope: e.target.value as typeof draft.scope,
                  targetId: "",
                })
              }
              className={control}
            >
              <option value="GLOBAL">All eligible subscriptions</option>
              <option value="PLAN">Plan</option>
              <option value="PRICE">Price</option>
              <option value="CUSTOMER">Customer</option>
              <option value="SUBSCRIPTION">Subscription</option>
            </select>
          </Field>
          {draft.scope !== "GLOBAL" ? (
            <Field label="Applies to">
              <select
                value={draft.targetId}
                onChange={(e) =>
                  setDraft({ ...draft, targetId: e.target.value })
                }
                className={control}
              >
                <option value="">Select record</option>
                {targets.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={draft.syncToStripe}
              onChange={(e) =>
                setDraft({ ...draft, syncToStripe: e.target.checked })
              }
            />
            Create Stripe coupon now
          </label>
          <button
            type="button"
            disabled={isPending}
            onClick={createPromotion}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--admin-primary)] px-4 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            Add promotion
          </button>
        </div>
        {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Promotion</th>
                <th className="px-4 py-3">Discount</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Scope</th>
                <th className="px-4 py-3">Stripe</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {promotions.map((promotion) => (
                <tr key={promotion.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-950">
                      {promotion.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {promotion.code ?? "No code"} · v{promotion.version}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {promotion.discountType === "PERCENTAGE"
                      ? `${promotion.percentOff}%`
                      : `${promotion.currency} ${promotion.amountOff}`}
                  </td>
                  <td className="px-4 py-3">
                    {promotion.duration === "REPEATING"
                      ? `${promotion.durationMonths} months`
                      : friendly(promotion.duration)}
                  </td>
                  <td className="px-4 py-3">{friendly(promotion.scope)}</td>
                  <td className="px-4 py-3">
                    <Badge active={promotion.stripeSyncStatus === "SYNCED"}>
                      {friendly(promotion.stripeSyncStatus)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge active={promotion.isActive}>
                      {promotion.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {promotion.isActive ? null : (
                        <button
                          onClick={() => activate(promotion)}
                          disabled={isPending}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"
                        >
                          <Power className="h-3.5 w-3.5" />
                          Activate
                        </button>
                      )}
                      {promotion.isActive ? (
                        <button
                          onClick={() => deactivate(promotion.id)}
                          disabled={isPending}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700"
                        >
                          {isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Power className="h-3.5 w-3.5" />
                          )}
                          Deactivate
                        </button>
                      ) : null}
                      {promotion.redemptionCount === 0 ? (
                        <button
                          onClick={() => remove(promotion)}
                          disabled={isPending}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700"
                          title="This promotion has never been redeemed, so it can be removed."
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      ) : (
                        <span
                          className="text-xs text-slate-400"
                          title={`Redeemed ${promotion.redemptionCount} time(s), so it carries commercial history and cannot be deleted.`}
                        >
                          Redeemed
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const control =
  "mt-1.5 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[var(--admin-primary)]";
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
      {label}
      {children}
    </label>
  );
}
function Badge({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
    >
      {children}
    </span>
  );
}
function friendly(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
function targetKeyForScope(scope: PromotionDraft["scope"]) {
  return scope === "PLAN"
    ? "planId"
    : scope === "PRICE"
      ? "planPriceId"
      : scope === "CUSTOMER"
        ? "customerAccountId"
        : scope === "SUBSCRIPTION"
          ? "subscriptionId"
          : null;
}
