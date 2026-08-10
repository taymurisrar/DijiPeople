"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BillingCycleValue, SubscriptionStatusValue } from "@/lib/domain";
import {
  formatBillingCycle,
  formatCurrency,
  formatEnumLabel,
} from "@/lib/formatters";
import { SUPPORTED_CURRENCIES } from "@/lib/form-options";
import { useToastNotice } from "@/app/_components/ui/toast-provider";
import { usePlatformDefaults } from "@/app/_components/platform-defaults-provider";

type SubscriptionPlanOption = {
  id: string;
  key: string;
  name: string;
  monthlyBasePrice?: number;
  annualBasePrice?: number;
  currency?: string;
  prices?: Array<{
    id: string;
    billingCycle: "MONTHLY" | "ANNUAL";
    billingModel: "FLAT" | "PER_SEAT";
    billingInterval: "MONTH" | "YEAR";
    currency: string;
    unitAmount: number;
    minimumSeats: number;
    maximumSeats: number | null;
    isActive: boolean;
  }>;
};

type PromotionOption = {
  id: string;
  name: string;
  code: string | null;
  discountType: "PERCENTAGE" | "FLAT";
  percentOff: number | null;
  amountOff: number | null;
  currency: string | null;
  duration: "ONCE" | "REPEATING" | "FOREVER";
  durationMonths: number | null;
  scope: "GLOBAL" | "PLAN" | "PRICE" | "CUSTOMER" | "SUBSCRIPTION";
  planId: string | null;
  planPriceId: string | null;
  customerAccountId: string | null;
  subscriptionId: string | null;
  isActive: boolean;
};

type SubscriptionFormProps = {
  tenantId: string;
  customerAccountId?: string | null;
  plans: SubscriptionPlanOption[];
  currentSubscription: {
    id: string;
    plan: SubscriptionPlanOption;
    status: SubscriptionStatusValue | string;
    billingCycle: BillingCycleValue | string;
    basePrice: number;
    discountType: "NONE" | "PERCENTAGE" | "FLAT";
    discountValue: number;
    discountReason: string | null;
    finalPrice: number;
    currency: string;
    startDate: string;
    endDate: string | null;
    renewalDate: string | null;
    autoRenew: boolean;
    purchasedSeats?: number;
    planPrice?: { id: string } | null;
  } | null;
};

export function SubscriptionForm({
  tenantId,
  customerAccountId,
  plans,
  currentSubscription,
}: SubscriptionFormProps) {
  const router = useRouter();
  const { defaults } = usePlatformDefaults();
  const { showToast } = useToastNotice();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [planId, setPlanId] = useState(
    currentSubscription?.plan.id ?? plans[0]?.id ?? "",
  );
  const [status, setStatus] = useState<SubscriptionStatusValue | string>(
    currentSubscription?.status ?? "Trialing",
  );
  const [billingCycle, setBillingCycle] = useState<BillingCycleValue | string>(
    currentSubscription?.billingCycle ?? "MONTHLY",
  );
  const [discountType, setDiscountType] = useState<
    "NONE" | "PERCENTAGE" | "FLAT"
  >(currentSubscription?.discountType ?? "NONE");
  const [discountValue, setDiscountValue] = useState(
    String(currentSubscription?.discountValue ?? 0),
  );
  const [discountReason, setDiscountReason] = useState(
    currentSubscription?.discountReason ?? "",
  );
  const [manualFinalPrice, setManualFinalPrice] = useState(
    String(currentSubscription?.finalPrice ?? ""),
  );
  const [currency, setCurrency] = useState(
    currentSubscription?.currency ?? defaults.currency,
  );
  const [autoRenew, setAutoRenew] = useState(
    currentSubscription?.autoRenew ?? true,
  );
  const [purchasedSeats, setPurchasedSeats] = useState(
    currentSubscription?.purchasedSeats ?? 1,
  );
  const [planPriceId, setPlanPriceId] = useState(
    currentSubscription?.planPrice?.id ?? "",
  );
  const [promotions, setPromotions] = useState<PromotionOption[]>([]);
  const [promotionId, setPromotionId] = useState("");
  const [startDate, setStartDate] = useState(
    currentSubscription?.startDate?.slice(0, 10) ??
      new Date().toISOString().slice(0, 10),
  );
  const [endDate, setEndDate] = useState(
    currentSubscription?.endDate?.slice(0, 10) ?? "",
  );
  const [renewalDate, setRenewalDate] = useState(
    currentSubscription?.renewalDate?.slice(0, 10) ?? "",
  );

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === planId) ?? null,
    [planId, plans],
  );
  const selectedPrice = useMemo(
    () =>
      selectedPlan?.prices?.find((price) => price.id === planPriceId) ?? null,
    [planPriceId, selectedPlan?.prices],
  );
  const availablePromotions = useMemo(
    () =>
      promotions.filter(
        (promotion) =>
          promotion.isActive &&
          (promotion.scope === "GLOBAL" ||
            (promotion.scope === "PLAN" && promotion.planId === planId) ||
            (promotion.scope === "PRICE" &&
              promotion.planPriceId === planPriceId) ||
            (promotion.scope === "CUSTOMER" &&
              promotion.customerAccountId === customerAccountId) ||
            (promotion.scope === "SUBSCRIPTION" &&
              promotion.subscriptionId === currentSubscription?.id)),
      ),
    [
      customerAccountId,
      currentSubscription?.id,
      planId,
      planPriceId,
      promotions,
    ],
  );
  const selectedPromotion = useMemo(
    () =>
      availablePromotions.find((promotion) => promotion.id === promotionId) ??
      null,
    [availablePromotions, promotionId],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/super-admin/promotions", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : []))
      .then((items: PromotionOption[]) => setPromotions(items))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const pricingPreview = useMemo(() => {
    const basePrice = selectedPrice
      ? Number(selectedPrice.unitAmount) *
        (selectedPrice.billingModel === "PER_SEAT" ? purchasedSeats : 1)
      : Number(
          billingCycle === "ANNUAL" || billingCycle === "Annual"
            ? (selectedPlan?.annualBasePrice ?? 0)
            : (selectedPlan?.monthlyBasePrice ?? 0),
        );
    const parsedDiscount = Number(discountValue || 0);
    let discounted = basePrice;

    if (discountType === "PERCENTAGE") {
      discounted = basePrice - basePrice * (parsedDiscount / 100);
    }

    if (discountType === "FLAT") {
      discounted = basePrice - parsedDiscount;
    }

    const manual =
      manualFinalPrice.length > 0 ? Number(manualFinalPrice) : null;

    return {
      basePrice,
      finalPrice: manual ?? Math.max(discounted, 0),
    };
  }, [
    billingCycle,
    discountType,
    discountValue,
    manualFinalPrice,
    selectedPlan?.annualBasePrice,
    selectedPlan?.monthlyBasePrice,
    selectedPrice,
    purchasedSeats,
  ]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!planId) {
      setMessage("Select a plan before saving the subscription.");
      return;
    }

    startTransition(async () => {
      const response = await fetch(
        `/api/super-admin/tenants/${tenantId}/subscription`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            planId,
            planPriceId: planPriceId || null,
            promotionId: promotionId || null,
            purchasedSeats,
            status,
            billingCycle,
            discountType,
            discountValue: Number(discountValue || 0),
            discountReason: discountReason || undefined,
            manualFinalPrice:
              manualFinalPrice.length > 0
                ? Number(manualFinalPrice)
                : undefined,
            currency,
            autoRenew,
            startDate,
            endDate: endDate.length > 0 ? endDate : null,
            renewalDate: renewalDate.length > 0 ? renewalDate : undefined,
          }),
        },
      );

      const payload = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;

      if (!response.ok) {
        setMessage(payload?.message ?? "Unable to update subscription.");
        return;
      }

      setMessage("Subscription updated.");
      showToast({ title: "Subscription updated", tone: "success" });
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div>
        <h3 className="text-lg font-semibold text-slate-950">Subscription</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Keep billing cycle, pricing, and renewal details aligned with the
          customer agreement.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Purchased seats
          <input
            min="1"
            step="1"
            type="number"
            value={purchasedSeats}
            disabled={selectedPrice?.billingModel === "FLAT"}
            onChange={(event) =>
              setPurchasedSeats(Math.max(1, Number(event.target.value)))
            }
            className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900"
          />
          <span className="mt-1 block text-xs text-slate-500">
            Billing entitlement. User deactivation does not change this
            quantity.
          </span>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Plan
          <select
            value={planId}
            onChange={(event) => {
              setPlanId(event.target.value);
              const plan = plans.find((item) => item.id === event.target.value);
              const nextPrice = plan?.prices?.find((price) => price.isActive);
              setPlanPriceId(nextPrice?.id ?? "");
              if (nextPrice) {
                setBillingCycle(nextPrice.billingCycle);
                setCurrency(nextPrice.currency);
                setPurchasedSeats(
                  Math.max(purchasedSeats, nextPrice.minimumSeats),
                );
              }
              setManualFinalPrice("");
              if (plan?.currency) {
                setCurrency(plan.currency);
              }
            }}
            className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900"
          >
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Price / billing frequency
          <select
            value={planPriceId}
            onChange={(event) => {
              const price = selectedPlan?.prices?.find(
                (item) => item.id === event.target.value,
              );
              setPlanPriceId(event.target.value);
              if (price) {
                setBillingCycle(price.billingCycle);
                setCurrency(price.currency);
                setPurchasedSeats(Math.max(purchasedSeats, price.minimumSeats));
              }
              setManualFinalPrice("");
            }}
            className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-[var(--admin-primary)]"
          >
            <option value="">Legacy plan base price</option>
            {selectedPlan?.prices
              ?.filter((price) => price.isActive)
              .map((price) => (
                <option key={price.id} value={price.id}>
                  {formatEnumLabel(price.billingModel)} ·{" "}
                  {formatBillingCycle(price.billingCycle)} ·{" "}
                  {formatCurrency(price.unitAmount, price.currency)}
                  {price.billingModel === "PER_SEAT" ? " / seat" : ""}
                </option>
              ))}
          </select>
          <span className="mt-1 block text-xs text-slate-500">
            The selected price drives currency, interval, pricing model, and
            Stripe quantity.
          </span>
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
            className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900"
          >
            {(["TRIALING", "ACTIVE", "PAST_DUE", "CANCELLED"] as const).map(
              (option) => (
                <option key={option} value={option}>
                  {formatEnumLabel(option)}
                </option>
              ),
            )}
          </select>
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Billing cycle
          <select
            value={billingCycle}
            onChange={(event) => {
              setBillingCycle(event.target.value as typeof billingCycle);
              setManualFinalPrice("");
            }}
            className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900"
          >
            {(["MONTHLY", "ANNUAL"] as const).map((option) => (
              <option key={option} value={option}>
                {formatBillingCycle(option)}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Currency
          <select
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm uppercase outline-none transition focus:border-slate-900"
          >
            {SUPPORTED_CURRENCIES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <label className="block text-sm font-medium text-slate-700 lg:col-span-3">
          Promotion
          <select
            value={promotionId}
            onChange={(event) => {
              const promotion = availablePromotions.find(
                (item) => item.id === event.target.value,
              );
              setPromotionId(event.target.value);
              if (promotion) {
                setDiscountType(promotion.discountType);
                setDiscountValue(
                  String(promotion.percentOff ?? promotion.amountOff ?? 0),
                );
                setDiscountReason(
                  `${promotion.name}${promotion.code ? ` (${promotion.code})` : ""}`,
                );
                setManualFinalPrice("");
              }
            }}
            className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--admin-primary)]"
          >
            <option value="">No managed promotion</option>
            {availablePromotions.map((promotion) => (
              <option key={promotion.id} value={promotion.id}>
                {promotion.name} ·{" "}
                {promotion.discountType === "PERCENTAGE"
                  ? `${promotion.percentOff}%`
                  : `${promotion.currency} ${promotion.amountOff}`}{" "}
                ·{" "}
                {promotion.duration === "REPEATING"
                  ? `${promotion.durationMonths} months`
                  : formatEnumLabel(promotion.duration)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Discount type
          <select
            value={discountType}
            onChange={(event) =>
              setDiscountType(event.target.value as typeof discountType)
            }
            className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900"
          >
            <option value="NONE">None</option>
            <option value="PERCENTAGE">Percentage</option>
            <option value="FLAT">Flat</option>
          </select>
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Discount value
          <input
            min="0"
            step="0.01"
            type="number"
            value={discountValue}
            onChange={(event) => setDiscountValue(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900"
          />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Final price override
          <input
            min="0"
            step="0.01"
            type="number"
            value={manualFinalPrice}
            onChange={(event) => setManualFinalPrice(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900"
          />
        </label>
      </div>

      <label className="block text-sm font-medium text-slate-700">
        Discount reason
        <input
          value={discountReason}
          onChange={(event) => setDiscountReason(event.target.value)}
          className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900"
        />
      </label>

      <div className="grid gap-4 lg:grid-cols-3">
        <label className="block text-sm font-medium text-slate-700">
          Start date
          <input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900"
          />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Renewal date
          <input
            type="date"
            value={renewalDate}
            onChange={(event) => setRenewalDate(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900"
          />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          End date
          <input
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900"
          />
        </label>
      </div>

      <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-700">
        <input
          checked={autoRenew}
          onChange={(event) => setAutoRenew(event.target.checked)}
          type="checkbox"
        />
        Auto renew subscription
      </label>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
        <div className="text-sm font-medium text-slate-700">
          Pricing preview
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Base price
            </div>
            <div className="mt-1 text-lg font-semibold text-slate-950">
              {formatCurrency(pricingPreview.basePrice, currency)}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Final price
            </div>
            <div className="mt-1 text-lg font-semibold text-slate-950">
              {formatCurrency(pricingPreview.finalPrice, currency)}
            </div>
          </div>
        </div>
        {selectedPromotion ? (
          <p className="mt-3 border-t border-slate-200 pt-3 text-sm text-slate-600">
            {selectedPromotion.duration === "ONCE"
              ? "Discount applies to the first invoice only."
              : selectedPromotion.duration === "FOREVER"
                ? "Discount applies to every eligible invoice."
                : selectedPrice?.billingInterval === "YEAR"
                  ? `Valid for ${selectedPromotion.durationMonths} calendar months; Stripe applies it to the annual invoice, not as monthly instalments.`
                  : `Discounted for the first ${selectedPromotion.durationMonths} monthly invoices.`}{" "}
            After the promotion:{" "}
            {formatCurrency(pricingPreview.basePrice, currency)} /{" "}
            {selectedPrice?.billingInterval === "YEAR" ? "year" : "month"}.
          </p>
        ) : null}
      </div>

      {message ? <p className="text-sm text-slate-600">{message}</p> : null}

      <button
        className="inline-flex rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Saving..." : "Save subscription"}
      </button>
    </form>
  );
}
