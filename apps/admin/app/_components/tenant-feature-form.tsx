"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

type FeatureCatalogItem = {
  key: string;
  label: string;
  description: string;
};

type FeatureItem = {
  key: string;
  isEnabled: boolean;
  isIncludedInPlan: boolean;
  tenantOverrideEnabled: boolean | null;
};

type TenantFeatureFormProps = {
  tenantId: string;
  catalog: FeatureCatalogItem[];
  features: FeatureItem[];
};

export function TenantFeatureForm({
  tenantId,
  catalog,
  features,
}: TenantFeatureFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(features.map((feature) => [feature.key, feature.isEnabled])),
  );

  const mergedFeatures = useMemo(
    () =>
      catalog.map((item) => {
        const current = features.find((feature) => feature.key === item.key);
        return {
          ...item,
          isEnabled: values[item.key] ?? current?.isEnabled ?? false,
          isIncludedInPlan: current?.isIncludedInPlan ?? false,
        };
      }),
    [catalog, features, values],
  );

  function toggleFeature(key: string) {
    setValues((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    startTransition(async () => {
      const response = await fetch(`/api/super-admin/tenants/${tenantId}/features`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          features: mergedFeatures.map((feature) => ({
            key: feature.key,
            isEnabled: feature.isEnabled,
            source: feature.isIncludedInPlan ? "PLAN" : "MANUAL",
          })),
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        setMessage(payload?.message ?? "Unable to save feature overrides.");
        return;
      }

      setMessage("Feature access updated.");
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div>
        <h3 className="text-lg font-semibold text-slate-950">Feature access</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Plan defaults define the baseline. Manual overrides let operations shape a tenant deal without branching the product.
        </p>
      </div>

      <div className="grid gap-3">
        {mergedFeatures.map((feature) => (
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
                {feature.key} {feature.isIncludedInPlan ? "• plan" : "• override"}
              </div>
            </div>
            <input
              checked={feature.isEnabled}
              onChange={() => toggleFeature(feature.key)}
              type="checkbox"
            />
          </label>
        ))}
      </div>

      {message ? <p className="text-sm text-slate-600">{message}</p> : null}

      <button
        className="inline-flex rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Saving..." : "Save features"}
      </button>
    </form>
  );
}
