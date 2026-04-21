"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  CheckCheck,
  Sparkles,
} from "lucide-react";
import { plans } from "./content";

type BillingCycle = "monthly" | "annual";
type CurrencyCode = "USD" | "CAD" | "GBP" | "EUR" | "QAR";

type CurrencyOption = {
  code: CurrencyCode;
  label: string;
  symbol: string;
  flag: string;
  monthlyRate: number;
};

const currencies: CurrencyOption[] = [
  { code: "USD", label: "US Dollar", symbol: "$", flag: "🇺🇸", monthlyRate: 1 },
  { code: "CAD", label: "Canadian Dollar", symbol: "CA$", flag: "🇨🇦", monthlyRate: 1.35 },
  { code: "GBP", label: "British Pound", symbol: "£", flag: "🇬🇧", monthlyRate: 0.79 },
  { code: "EUR", label: "Euro", symbol: "€", flag: "🇪🇺", monthlyRate: 0.92 },
  { code: "QAR", label: "Qatari Riyal", symbol: "QAR ", flag: "🇶🇦", monthlyRate: 3.64 },
];

const baseMonthlyPrices = {
  Starter: 200,
  Growth: 400,
  Enterprise: 800,
} as const;

const annualDiscount = 0.18;

export function PlansSection() {
  const [billing, setBilling] = useState<BillingCycle>("annual");
  const [currencyCode, setCurrencyCode] = useState<CurrencyCode>("QAR");
  const [isCurrencyOpen, setIsCurrencyOpen] = useState(false);
  const currencyRef = useRef<HTMLDivElement | null>(null);

  const selectedCurrency = useMemo(
    () => currencies.find((currency) => currency.code === currencyCode) ?? currencies[0],
    [currencyCode],
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        currencyRef.current &&
        !currencyRef.current.contains(event.target as Node)
      ) {
        setIsCurrencyOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsCurrencyOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  function formatPrice(amount: number) {
    const rounded = Math.round(amount);

    switch (selectedCurrency.code) {
      case "USD":
        return `$${rounded}`;
      case "CAD":
        return `CA$${rounded}`;
      case "GBP":
        return `£${rounded}`;
      case "EUR":
        return `€${rounded}`;
      case "QAR":
        return `QAR ${rounded}`;
      default:
        return `${rounded}`;
    }
  }

  function getPlanPrice(planName: string) {
    const basePrice =
      baseMonthlyPrices[planName as keyof typeof baseMonthlyPrices] ?? 200;

    const convertedMonthly = basePrice * selectedCurrency.monthlyRate;

    if (billing === "monthly") {
      return {
        primary: formatPrice(convertedMonthly),
        secondary: "/month",
        helper: "Billed monthly",
      };
    }

    const discountedMonthly = convertedMonthly * (1 - annualDiscount);
    const annualTotal = discountedMonthly * 12;

    return {
      primary: formatPrice(discountedMonthly),
      secondary: "/month",
      helper: `${formatPrice(annualTotal)} billed annually`,
    };
  }

  return (
    <section
      id="plans"
      className="grid gap-8 rounded-[32px] border border-border bg-white/90 p-6 shadow-sm lg:p-10"
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/15 bg-accent-soft px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            <Sparkles className="h-3.5 w-3.5" />
            Plans and rollout paths
          </div>

          <h2 className="text-3xl font-semibold leading-tight text-foreground sm:text-4xl">
            Choose the structure your team actually needs.
          </h2>

          <p className="text-base leading-7 text-muted">
            Pick the plan that fits your team size, rollout complexity, and
            operational needs.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <BillingToggle billing={billing} onChange={setBilling} />

          <div className="relative" ref={currencyRef}>
            <button
              type="button"
              onClick={() => setIsCurrencyOpen((current) => !current)}
              className="inline-flex min-w-[220px] items-center justify-between gap-3 rounded-2xl border border-border bg-white px-4 py-3 text-sm text-foreground shadow-sm transition hover:border-accent/20"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="text-base leading-none">
                  {selectedCurrency.flag}
                </span>
                <span className="min-w-0 text-left">
                  <span className="block font-semibold">{selectedCurrency.code}</span>
                  <span className="block truncate text-xs text-muted">
                    {selectedCurrency.label}
                  </span>
                </span>
              </span>

              <ChevronDown
                className={[
                  "h-4 w-4 shrink-0 text-muted transition",
                  isCurrencyOpen ? "rotate-180" : "",
                ].join(" ")}
              />
            </button>

            {isCurrencyOpen ? (
              <div className="absolute right-0 top-[calc(100%+10px)] z-20 w-[260px] overflow-hidden rounded-2xl border border-border bg-white p-2 shadow-[0_18px_50px_rgba(16,33,43,0.12)]">
                {currencies.map((currency) => {
                  const selected = currency.code === currencyCode;

                  return (
                    <button
                      key={currency.code}
                      type="button"
                      onClick={() => {
                        setCurrencyCode(currency.code);
                        setIsCurrencyOpen(false);
                      }}
                      className={[
                        "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left transition",
                        selected
                          ? "bg-accent-soft/70"
                          : "hover:bg-surface-muted",
                      ].join(" ")}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="text-base leading-none">{currency.flag}</span>
                        <span className="min-w-0">
                          <span className="block font-semibold text-foreground">
                            {currency.code}
                          </span>
                          <span className="block truncate text-xs text-muted">
                            {currency.label}
                          </span>
                        </span>
                      </span>

                      {selected ? (
                        <CheckCheck className="h-4 w-4 shrink-0 text-accent" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {plans.map((plan, index) => {
          const featured = index === 1;
          const price = getPlanPrice(plan.name);

          return (
            <article
              key={plan.name}
              className={[
                "relative flex flex-col rounded-[28px] border p-6 transition duration-300",
                featured
                  ? "scale-[1.01] border-accent bg-white shadow-[0_20px_60px_rgba(15,118,110,0.14)]"
                  : "border-border bg-white/95 hover:-translate-y-1 hover:shadow-md",
              ].join(" ")}
            >
              {featured && (
                <div className="absolute right-5 top-5 rounded-full bg-accent px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white">
                  Most popular
                </div>
              )}

              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                  {plan.name}
                </p>

                <div className="space-y-2">
                  <h3 className="text-xl font-semibold text-foreground">
                    {plan.audience}
                  </h3>

                  <p className="text-sm leading-6 text-muted">
                    Clean HR structure without unnecessary complexity.
                  </p>
                </div>

                <div className="rounded-2xl border border-border bg-surface-muted px-4 py-4">
                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-semibold leading-none text-foreground sm:text-4xl">
                      {price.primary}
                    </span>
                    <span className="pb-1 text-sm text-muted">
                      {price.secondary}
                    </span>
                  </div>

                  <p className="mt-2 text-xs font-medium text-muted">
                    {price.helper}
                  </p>
                </div>
              </div>

              <ul className="mt-6 space-y-3">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-3 text-sm text-foreground"
                  >
                    <div className="mt-0.5 rounded-full bg-accent-soft p-1">
                      <Check className="h-3.5 w-3.5 text-accent" />
                    </div>
                    <span className="leading-6 text-muted">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="#lead-form"
                className={[
                  "mt-8 inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition",
                  featured
                    ? "bg-accent text-white hover:bg-accent-strong"
                    : "bg-foreground text-white hover:opacity-90",
                ].join(" ")}
              >
                {plan.cta}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function BillingToggle({
  billing,
  onChange,
}: {
  billing: BillingCycle;
  onChange: (value: BillingCycle) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-2xl border border-border bg-surface-muted p-1 shadow-sm">
      <button
        type="button"
        onClick={() => onChange("monthly")}
        className={[
          "rounded-xl px-4 py-2.5 text-sm font-semibold transition",
          billing === "monthly"
            ? "bg-white text-foreground shadow-sm"
            : "text-muted hover:text-foreground",
        ].join(" ")}
      >
        Monthly
      </button>

      <button
        type="button"
        onClick={() => onChange("annual")}
        className={[
          "relative rounded-xl px-4 py-2.5 text-sm font-semibold transition",
          billing === "annual"
            ? "bg-white text-foreground shadow-sm"
            : "text-muted hover:text-foreground",
        ].join(" ")}
      >
        <span>Annual</span>
      </button>

      <span className="ml-1 rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent">
        Save 18%
      </span>
    </div>
  );
}