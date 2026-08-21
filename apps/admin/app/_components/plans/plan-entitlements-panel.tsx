"use client";

import { useEffect, useState, useTransition } from "react";
import { LoaderCircle, ShieldCheck } from "lucide-react";

type CatalogFeature = { key: string; label: string; description: string };

/**
 * Plan entitlements.
 *
 * The entitlement set is what a plan actually sells, and until now it could
 * only be changed on the legacy `?workspace=legacy-commerce` page — the runtime
 * record page showed an "Entitlements" tab with nothing on it. The catalog is
 * fetched rather than declared because it lives in the API as
 * `TENANT_FEATURE_DEFINITIONS`, the same list the product gates modules on; a
 * copy in the registry would be a second source of truth for what the product
 * can do.
 *
 * Saving sends the whole key set, which is what `UpdatePlanDto.featureKeys`
 * expects — the API replaces the plan's `PlanFeature` rows with it.
 */
export function PlanEntitlementsPanel({
  planId,
  initialFeatureKeys,
  readOnly = false,
  onSave,
}: {
  planId: string;
  initialFeatureKeys: string[];
  readOnly?: boolean;
  onSave: (featureKeys: string[]) => Promise<void>;
}) {
  const [catalog, setCatalog] = useState<CatalogFeature[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  /*
   * The saved set is the identity of the editing session. When the record
   * reloads after a save the panel re-keys on the new set and starts from what
   * the server actually stored, rather than syncing state inside an effect and
   * cascading a render on every parent update.
   */
  const savedKey = [...initialFeatureKeys].sort().join("|");
  const [draft, setDraft] = useState<{ key: string; selected: string[] }>({
    key: savedKey,
    selected: initialFeatureKeys,
  });
  const selected = draft.key === savedKey ? draft.selected : initialFeatureKeys;
  const setSelected = (
    next: string[] | ((current: string[]) => string[]),
  ) =>
    setDraft({
      key: savedKey,
      selected: typeof next === "function" ? next(selected) : next,
    });
  const [notice, setNotice] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    fetch("/api/super-admin/feature-catalog", { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(
            payload?.message ?? "Unable to load the feature catalog.",
          );
        return payload as CatalogFeature[];
      })
      .then((payload) => {
        if (active) setCatalog(Array.isArray(payload) ? payload : []);
      })
      .catch((error: unknown) => {
        if (!active || (error as { name?: string }).name === "AbortError")
          return;
        setCatalogError(
          error instanceof Error
            ? error.message
            : "Unable to load the feature catalog.",
        );
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const dirty = savedKey !== [...selected].sort().join("|");

  /*
   * A key stored on the plan that the catalog no longer offers is shown rather
   * than dropped. Silently discarding it on the next save would remove an
   * entitlement live tenants are relying on, without anyone deciding to.
   */
  const retired = selected.filter(
    (key) => catalog && !catalog.some((feature) => feature.key === key),
  );

  function toggle(key: string) {
    setNotice(null);
    setSelected((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  }

  function save() {
    setNotice(null);
    setFailed(false);
    startTransition(async () => {
      try {
        await onSave(selected);
        setNotice("Entitlements saved.");
      } catch (error) {
        setFailed(true);
        setNotice(
          error instanceof Error
            ? error.message
            : "Unable to save the entitlements.",
        );
      }
    });
  }

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      aria-labelledby={`plan-entitlements-${planId}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-slate-500" aria-hidden />
            <h2
              id={`plan-entitlements-${planId}`}
              className="text-lg font-semibold text-slate-950"
            >
              Entitlements
            </h2>
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
            The product capabilities a tenant on this plan can use. Removing one
            takes it away from every tenant already subscribed.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
          {selected.length} enabled
        </span>
      </div>

      {catalogError ? (
        <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
          {catalogError}
        </p>
      ) : !catalog ? (
        <p className="mt-4 text-sm text-slate-500">Loading feature catalog…</p>
      ) : !catalog.length ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
          The feature catalog is empty, so there is nothing to grant yet.
        </p>
      ) : (
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {catalog.map((feature) => {
            const checked = selected.includes(feature.key);
            return (
              <label
                key={feature.key}
                className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition ${
                  checked
                    ? "border-[var(--admin-primary)] bg-slate-50"
                    : "border-slate-200 hover:bg-slate-50"
                } ${readOnly ? "cursor-not-allowed opacity-70" : ""}`}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4"
                  checked={checked}
                  disabled={readOnly}
                  onChange={() => toggle(feature.key)}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-900">
                    {feature.label}
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-slate-600">
                    {feature.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}

      {retired.length ? (
        <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This plan grants {retired.join(", ")}, which the feature catalog no
          longer lists. It is kept until someone removes it deliberately.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={readOnly || !dirty || isPending}
          onClick={save}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? (
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
          ) : null}
          Save entitlements
        </button>
        {notice ? (
          <span
            role="status"
            className={`text-xs font-medium ${failed ? "text-rose-700" : "text-emerald-700"}`}
          >
            {notice}
          </span>
        ) : dirty ? (
          <span className="text-xs text-slate-500">Unsaved changes.</span>
        ) : null}
      </div>
    </section>
  );
}
