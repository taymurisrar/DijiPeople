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
    className="rounded-3xl border border-slate-200 bg-white shadow-sm"
  >
    <div className="border-b border-slate-100 px-6 py-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-950">
            Feature access
          </h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
            Control which features are available for this tenant. Plan defaults are applied automatically; overrides let you customize access when needed.
          </p>
        </div>

        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          {mergedFeatures.filter((feature) => feature.isEnabled).length} /{" "}
          {mergedFeatures.length} enabled
        </div>
      </div>
    </div>

    <div className="grid gap-3 p-4 sm:p-6">
      {mergedFeatures.map((feature) => (
        <button
          key={feature.key}
          type="button"
          onClick={() => toggleFeature(feature.key)}
          className={[
            "group flex w-full items-start justify-between gap-4 rounded-2xl border p-4 text-left transition",
            feature.isEnabled
              ? "border-slate-300 bg-slate-50 shadow-sm"
              : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
          ].join(" ")}
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-slate-950">{feature.label}</p>

              <span
                className={[
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  feature.isIncludedInPlan
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-700",
                ].join(" ")}
              >
                {feature.isIncludedInPlan ? "Plan default" : "Override"}
              </span>
            </div>

            <p className="mt-1 text-sm leading-6 text-slate-500">
              {feature.description}
            </p>

            <p className="mt-2 truncate font-mono text-xs text-slate-400">
              {feature.key}
            </p>
          </div>

          <span
            className={[
              "relative mt-1 inline-flex h-6 w-11 shrink-0 rounded-full transition",
              feature.isEnabled ? "bg-slate-950" : "bg-slate-300",
            ].join(" ")}
          >
            <span
              className={[
                "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition",
                feature.isEnabled ? "left-5" : "left-0.5",
              ].join(" ")}
            />
          </span>
        </button>
      ))}
    </div>

    <div className="flex flex-col gap-3 border-t border-slate-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
      {message ? (
        <p className="text-sm text-slate-500">{message}</p>
      ) : (
        <p className="text-sm text-slate-400">
          Changes are saved only after clicking save.
        </p>
      )}

      <button
        className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Saving..." : "Save changes"}
      </button>
    </div>
  </form>
);
}
