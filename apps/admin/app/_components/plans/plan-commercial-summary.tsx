"use client";

import {
  CalendarDays,
  CircleDollarSign,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  describePlanSchedule,
  selectPlanHeadlinePrices,
  type PlanPriceLike,
} from "@/lib/runtime/plan-headline-prices";

/**
 * What this plan currently costs and who is on it.
 *
 * Every amount here is derived from the plan's `PlanPrice` rows, never from
 * `monthlyBasePrice` / `annualBasePrice`. That distinction is BUG-0027: those
 * two columns are legacy compatibility fields, Admin used to show them, and
 * checkout charged something else entirely. A plan with no published price for
 * a cycle reads "Not configured" — which is the true answer, and the one that
 * tells an operator why nobody can buy it.
 *
 * The two price tiles are one *pair*, chosen together by
 * `selectPlanHeadlinePrices`. They used to be looked up independently by
 * billing cycle, which crossed two schedules and rendered a PKR flat annual
 * price of 120,000 beside a PKR per-seat monthly price of 300 (BUG-1954). A
 * plan carries up to twelve active prices, so the tiles also name the schedule
 * they are showing rather than implying it is the only one.
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
  const headline = selectPlanHeadlinePrices(prices);
  const schedule = describePlanSchedule(headline);
  const alsoPriced =
    headline.otherScheduleCount > 0
      ? ` ${headline.otherScheduleCount} other price schedule${
          headline.otherScheduleCount === 1 ? " is" : "s are"
        } configured below.`
      : "";

  const cards: Array<{
    label: string;
    value: string;
    description: string;
    icon: LucideIcon;
  }> = [
    {
      label: schedule ? `Monthly price · ${schedule}` : "Monthly price",
      value:
        headline.monthly !== null
          ? money(headline.monthly, headline.currency)
          : "Not configured",
      description:
        headline.monthly !== null
          ? `The amount checkout charges for monthly billing.${alsoPriced}`
          : "No published monthly price, so this plan cannot be bought monthly.",
      icon: CircleDollarSign,
    },
    {
      label: schedule ? `Annual price · ${schedule}` : "Annual price",
      value:
        headline.annual !== null
          ? money(headline.annual, headline.currency)
          : "Not configured",
      description:
        headline.annual === null
          ? "No published annual price."
          : headline.monthly === null
            ? "No monthly price on this schedule to compare it against."
            : headline.annualSaving > 0
              ? `${headline.annualSavingPercent}% below twelve monthly payments.`
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

function money(value: number | undefined, currency: string | null | undefined) {
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
