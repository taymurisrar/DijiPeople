"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { TenantFeaturesResponse } from "../../types";

type FeatureTogglesFormProps = {
  initialFeatures: TenantFeaturesResponse;
};

export function FeatureTogglesForm({
  initialFeatures,
}: FeatureTogglesFormProps) {
  const router = useRouter();
  const [items, setItems] = useState(initialFeatures.items);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch("/api/tenant-settings/features", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        updates: items.map((item) => ({
          key: item.key,
          isEnabled: item.isEnabled,
        })),
      }),
    });

    const data = (await response.json()) as { message?: string };

    if (!response.ok) {
      setError(data.message ?? "Unable to update feature flags.");
      setIsSubmitting(false);
      return;
    }

    router.refresh();
    setIsSubmitting(false);
  }

  return (
    <form className="grid gap-6" onSubmit={handleSubmit}>
      <section className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        {items.map((item) => (
          <label
            key={item.key}
            className="flex items-start justify-between gap-4 rounded-2xl border border-border bg-white px-4 py-4"
          >
            <div>
              <p className="font-medium text-foreground">{item.label}</p>
              <p className="mt-1 text-sm text-muted">{item.description}</p>
              <p className="mt-2 text-xs uppercase tracking-[0.18em] text-muted">
                Feature key: {item.key}
              </p>
              <p className="mt-2 text-xs uppercase tracking-[0.18em] text-muted">
                {item.isIncludedInPlan
                  ? "Included in current plan"
                  : "Not included in current plan"}
              </p>
            </div>
            <input
              checked={item.isEnabled}
              className="mt-1 h-4 w-4 rounded border-border"
              disabled={!item.isIncludedInPlan}
              onChange={(event) =>
                setItems((current) =>
                  current.map((currentItem) =>
                    currentItem.key === item.key
                      ? { ...currentItem, isEnabled: event.target.checked }
                      : currentItem,
                  ),
                )
              }
              type="checkbox"
            />
          </label>
        ))}
      </section>

      {initialFeatures.subscription ? (
        <p className="text-sm text-muted">
          Current plan:{" "}
          <span className="font-medium text-foreground">
            {initialFeatures.subscription.plan.name}
          </span>
        </p>
      ) : null}

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <div className="flex gap-3">
        <button
          className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Saving..." : "Save feature toggles"}
        </button>
      </div>
    </form>
  );
}
