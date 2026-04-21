"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type PlanFormProps = {
  mode: "create" | "edit";
  actionUrl: string;
  initialPlan?: {
    key: string;
    name: string;
    description: string | null;
    isActive: boolean;
    monthlyBasePrice: number;
    annualBasePrice: number;
    currency: string;
    sortOrder: number;
    features: string[];
  };
  featureCatalog: Array<{
    key: string;
    label: string;
    description: string;
  }>;
};

export function PlanForm({
  mode,
  actionUrl,
  initialPlan,
  featureCatalog,
}: PlanFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(initialPlan?.key ?? "");
  const [name, setName] = useState(initialPlan?.name ?? "");
  const [description, setDescription] = useState(initialPlan?.description ?? "");
  const [isActive, setIsActive] = useState(initialPlan?.isActive ?? true);
  const [monthlyBasePrice, setMonthlyBasePrice] = useState(
    String(initialPlan?.monthlyBasePrice ?? 0),
  );
  const [annualBasePrice, setAnnualBasePrice] = useState(
    String(initialPlan?.annualBasePrice ?? 0),
  );
  const [currency, setCurrency] = useState(initialPlan?.currency ?? "USD");
  const [sortOrder, setSortOrder] = useState(String(initialPlan?.sortOrder ?? 0));
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>(
    initialPlan?.features ?? [],
  );

  function toggleFeature(featureKey: string) {
    setSelectedFeatures((current) =>
      current.includes(featureKey)
        ? current.filter((item) => item !== featureKey)
        : [...current, featureKey],
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const response = await fetch(actionUrl, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key,
          name,
          description,
          isActive,
          monthlyBasePrice: Number(monthlyBasePrice),
          annualBasePrice: Number(annualBasePrice),
          currency,
          sortOrder: Number(sortOrder),
          featureKeys: selectedFeatures,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { id?: string; message?: string }
        | null;

      if (!response.ok) {
        setError(payload?.message ?? "Unable to save the plan.");
        return;
      }

      if (mode === "create" && payload?.id) {
        router.push(`/plans/${payload.id}`);
        return;
      }

      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Plan key
          <input
            value={key}
            onChange={(event) => setKey(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Plan name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900"
          />
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px_180px_180px_180px]">
        <label className="block text-sm font-medium text-slate-700">
          Description
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Monthly price
          <input
            min="0"
            step="0.01"
            type="number"
            value={monthlyBasePrice}
            onChange={(event) => setMonthlyBasePrice(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Annual price
          <input
            min="0"
            step="0.01"
            type="number"
            value={annualBasePrice}
            onChange={(event) => setAnnualBasePrice(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Currency
          <input
            maxLength={3}
            value={currency}
            onChange={(event) => setCurrency(event.target.value.toUpperCase())}
            className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm uppercase text-slate-900 outline-none transition focus:border-slate-900"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Sort order
          <input
            type="number"
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900"
          />
        </label>
        <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Active plan
        </label>
      </div>

      <section className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">Included features</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Feature entitlements define what tenants on this plan are allowed to activate.
          </p>
        </div>
        <div className="grid gap-4">
          {featureCatalog.map((feature) => (
            <label
              key={feature.key}
              className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
            >
              <div>
                <div className="font-medium text-slate-950">{feature.label}</div>
                <div className="mt-1 text-sm leading-6 text-slate-600">
                  {feature.description}
                </div>
                <div className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                  {feature.key}
                </div>
              </div>
              <input
                type="checkbox"
                checked={selectedFeatures.includes(feature.key)}
                onChange={() => toggleFeature(feature.key)}
                className="mt-1 h-4 w-4 rounded border-slate-300"
              />
            </label>
          ))}
        </div>
      </section>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {isPending
          ? "Saving..."
          : mode === "create"
            ? "Create plan"
            : "Save plan"}
      </button>
    </form>
  );
}
