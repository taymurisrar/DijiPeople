"use client";

import {
  CalendarDays,
  CircleDollarSign,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type PlanPriceLike = {
  billingCycle?: string;
  isActive?: boolean;
  unitAmount?: number;
  currency?: string;
};

/**
 * What this plan currently costs and who is on it.
 *
 * Every amount here is derived from the plan's `PlanPrice` rows, never from
 * `monthlyBasePrice` / `annualBasePrice`. That distinction is BUG-0027: those
 * two columns are legacy compatibility fields, Admin used to show them, and
 * checkout charged something else entirely. A plan with no published price for
 * a cycle reads "Not configured" — which is the true answer, and the one that
 * tells an operator why nobody can buy it.
 */
export function PlanCommercialSummary({
  prices,
  featureCount,
  subscriptionCount,
}: {
  prices: PlanPriceLike[];
  featureCount: number;
  subscriptionCount: number;
}) {
  const monthly = prices.find(
    (price) => price.billingCycle === "MONTHLY" && price.isActive !== false,
  );
  const annual = prices.find(
    (price) => price.billingCycle === "ANNUAL" && price.isActive !== false,
  );
  const monthlyAnnualized = (monthly?.unitAmount ?? 0) * 12;
  const annualSaving =
    annual && monthlyAnnualized > 0
      ? Math.max(monthlyAnnualized - (annual.unitAmount ?? 0), 0)
      : 0;
  const annualSavingPercent =
    monthlyAnnualized > 0
      ? Math.round((annualSaving / monthlyAnnualized) * 100)
      : 0;

  const cards: Array<{
    label: string;
    value: string;
    description: string;
    icon: LucideIcon;
  }> = [
    {
      label: "Monthly price",
      value: monthly
        ? money(monthly.unitAmount, monthly.currency)
        : "Not configured",
      description: monthly
        ? "The amount checkout charges for monthly billing."
        : "No published monthly price, so this plan cannot be bought monthly.",
      icon: CircleDollarSign,
    },
    {
      label: "Annual price",
      value: annual
        ? money(annual.unitAmount, annual.currency)
        : "Not configured",
      description: !annual
        ? "No published annual price."
        : annualSaving > 0
          ? `${annualSavingPercent}% below twelve monthly payments.`
          : "No annual discount against monthly billing.",
      icon: CalendarDays,
    },
    {
      label: "Subscriptions",
      value: String(subscriptionCount),
      description:
        subscriptionCount === 0
          ? "No tenant is billed on this plan yet."
          : "Tenants billed on this plan. Their purchased terms are snapshotted and unaffected by edits here.",
      icon: UsersRound,
    },
    {
      label: "Entitlements",
      value: String(featureCount),
      description: "Product capabilities this plan grants.",
      icon: ShieldCheck,
    },
  ];

  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center gap-2 text-slate-500">
              <Icon className="h-4 w-4" aria-hidden />
              <p className="text-xs font-semibold uppercase tracking-[0.14em]">
                {card.label}
              </p>
            </div>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              {card.value}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {card.description}
            </p>
          </div>
        );
      })}
    </section>
  );
}

function money(value: number | undefined, currency: string | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value))
    return "Not configured";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    // An unknown ISO code must not blank the card an operator is reading.
    return `${currency ?? ""} ${value.toFixed(2)}`.trim();
  }
}
